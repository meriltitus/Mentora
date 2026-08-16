// api/session/turn.js — Conversation turn endpoint (evaluator + agent)
const {
  getSession, updateSession, updateMastery, addDialogue,
  getMasteryForResponse, calculateUnderstanding, getNextConcept,
  isReadyForFinalAssessment, initMasteryMap,
  SessionPhase, MasteryStatus
} = require('../lib/session');
const { generateJSON } = require('../lib/llm');
const {
  evaluatorPrompt, agentDecisionPrompt, teachConceptPrompt,
  topicSelectionPrompt, learningPathPrompt, topicRecommendationPrompt,
  goalAnalysisPrompt, finalSummaryPrompt, unifiedTurnPrompt
} = require('../lib/prompts');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { session_id, transcript, session_state } = req.body || {};

    if (!session_id && !session_state) return res.status(400).json({ error: 'session_id or session_state is required' });
    if (!transcript || transcript.trim().length === 0) {
      return res.status(400).json({ error: 'transcript is required' });
    }

    const session = session_state || getSession(session_id);
    if (!session) return res.status(404).json({ error: 'Session not found or expired' });

    session.turnCount++;
    const userText = transcript.trim();
    addDialogue(session, 'user', userText);

    // Route based on session phase
    switch (session.phase) {
      case SessionPhase.DISCOVERY:
        return await handleDiscovery(session, userText, res);
      case SessionPhase.PLANNING:
        return await handlePlanning(session, userText, res);
      case SessionPhase.LEARNING:
        return await handleLearning(session, userText, res);
      case SessionPhase.ASSESSMENT:
        return await handleAssessment(session, userText, res);
      case SessionPhase.COMPLETE:
        return sendResponse(res, session, {
          reply_text: "We've already completed this session! Start a new session to learn something else.",
          tutor_state: 'IDLE',
          action: 'END'
        });
      default:
        return await handleLearning(session, userText, res);
    }
  } catch (error) {
    console.error('[session/turn] Error:', error);
    return res.status(500).json({
      error: 'Failed to process turn',
      message: error.message
    });
  }
};

// ──────────────────────────────────────────────
// DISCOVERY PHASE
// ──────────────────────────────────────────────
async function handleDiscovery(session, userText, res) {
  // Check if user is selecting from topic suggestions
  if (session.topicSuggestions && session.topicSuggestions.length > 0) {
    const selPrompt = topicSelectionPrompt(userText, session.topicSuggestions);
    try {
      const selection = await generateJSON({
        systemPrompt: selPrompt.systemPrompt,
        userPrompt: selPrompt.userPrompt,
        temperature: 0.3
      });

      if (selection.is_clear && selection.selected_topic_name) {
        // Topic selected — generate learning path
        session.topic = selection.selected_topic_name;
        session.phase = SessionPhase.PLANNING;
        return await generateAndStartPath(session, res, selection.reply_text);
      }
    } catch (e) {
      console.warn('Topic selection parse failed:', e.message);
    }
  }

  // Continue discovery — analyze the response
  session.discoveryAnswers.push({
    question: session.dialogueHistory.length > 1
      ? session.dialogueHistory[session.dialogueHistory.length - 2].text
      : 'What do you want to learn?',
    answer: userText
  });

  // Re-analyze with updated context
  const goalPrompt = goalAnalysisPrompt(
    `Original: "${session.goal}". Latest response: "${userText}"`
  );
  const analysis = await generateJSON({
    systemPrompt: goalPrompt.systemPrompt,
    userPrompt: goalPrompt.userPrompt,
    temperature: 0.6
  });

  if (analysis.goal_clarity === 'clear' && analysis.detected_topic) {
    // Goal became clear
    session.topic = analysis.detected_topic;
    session.phase = SessionPhase.PLANNING;
    return await generateAndStartPath(session, res, analysis.reply_text);
  }

  // Still vague — try generating recommendations if we have enough context
  if (session.discoveryAnswers.length >= 1) {
    const recPrompt = topicRecommendationPrompt(session.goal, session.discoveryAnswers);
    const recommendations = await generateJSON({
      systemPrompt: recPrompt.systemPrompt,
      userPrompt: recPrompt.userPrompt,
      temperature: 0.7
    });

    session.topicSuggestions = recommendations.topics || [];
    const replyText = recommendations.reply_text || analysis.reply_text;

    addDialogue(session, 'tutor', replyText);

    return sendResponse(res, session, {
      reply_text: replyText,
      tutor_state: 'SPEAKING',
      action: 'DISCOVER',
      topic_suggestions: session.topicSuggestions
    });
  }

  // Ask another discovery question
  const replyText = analysis.reply_text || analysis.discovery_question ||
    "Could you tell me more about what you're hoping to achieve?";
  addDialogue(session, 'tutor', replyText);

  return sendResponse(res, session, {
    reply_text: replyText,
    tutor_state: 'LISTENING',
    action: 'DISCOVER'
  });
}

// ──────────────────────────────────────────────
// Generate learning path and start teaching
// ──────────────────────────────────────────────
async function generateAndStartPath(session, res, prefixReply) {
  const pathPrompt = learningPathPrompt(session.topic, session.goal);
  const pathResult = await generateJSON({
    systemPrompt: pathPrompt.systemPrompt,
    userPrompt: pathPrompt.userPrompt,
    temperature: 0.6
  });

  session.learningPath = pathResult.concepts || [];
  session.phase = SessionPhase.LEARNING;
  initMasteryMap(session);

  // Set first concept active
  const firstConcept = session.learningPath[0];
  session.activeConcept = firstConcept ? firstConcept.id : null;

  let replyText = prefixReply || pathResult.reply_text ||
    `Great choice! Let's dive into ${session.topic}.`;

  // Teach first concept
  if (firstConcept) {
    if (session.masteryMap[firstConcept.id]) {
      session.masteryMap[firstConcept.id].status = MasteryStatus.IN_PROGRESS;
    }

    try {
      const teachData = teachConceptPrompt(firstConcept, session);
      const teachResult = await generateJSON({
        systemPrompt: teachData.systemPrompt,
        userPrompt: teachData.userPrompt,
        temperature: 0.7
      });
      replyText = replyText + ' ' + (teachResult.reply_text || '');
    } catch (e) {
      console.warn('Teach prompt failed:', e.message);
      replyText += ` Let's start with ${firstConcept.label}. ${firstConcept.description}. Can you explain this concept back to me in your own words?`;
    }
  }

  addDialogue(session, 'tutor', replyText);

  return sendResponse(res, session, {
    reply_text: replyText,
    tutor_state: 'SPEAKING',
    action: 'TEACH'
  });
}

// ──────────────────────────────────────────────
// PLANNING PHASE (fallback)
// ──────────────────────────────────────────────
async function handlePlanning(session, userText, res) {
  return await generateAndStartPath(session, res, null);
}

// ──────────────────────────────────────────────
// LEARNING PHASE — The core teach/evaluate/decide loop
// ──────────────────────────────────────────────
async function handleLearning(session, userText, res) {
  const activeConcept = session.learningPath.find(c => c.id === session.activeConcept);

  if (!activeConcept) {
    // No active concept — check if we should do final assessment
    if (isReadyForFinalAssessment(session)) {
      session.phase = SessionPhase.ASSESSMENT;
      return await handleFinalAssessment(session, res);
    }

    // Find next concept
    const nextId = getNextConcept(session);
    if (nextId) {
      session.activeConcept = nextId;
      const nextConcept = session.learningPath.find(c => c.id === nextId);
      if (session.masteryMap[nextId]) {
        session.masteryMap[nextId].status = MasteryStatus.IN_PROGRESS;
      }

      const isRetest = session.masteryMap[nextId] && session.masteryMap[nextId].hadGap;
      const transitionContext = isRetest 
        ? `We are jumping back to retest a previous concept: "${nextConcept.label}".`
        : `We are advancing to the next concept: "${nextConcept.label}".`;

      const teachData = teachConceptPrompt(nextConcept, session, transitionContext);
      const teachResult = await generateJSON({
        systemPrompt: teachData.systemPrompt,
        userPrompt: teachData.userPrompt,
        temperature: 0.7
      });

      const replyText = teachResult.reply_text || `Let's talk about ${nextConcept.label}. ${nextConcept.description}. Explain this to me in your own words.`;
      addDialogue(session, 'tutor', replyText);

      return sendResponse(res, session, {
        reply_text: replyText,
        tutor_state: 'SPEAKING',
        action: 'TEACH'
      });
    }

    // Everything mastered
    session.phase = SessionPhase.ASSESSMENT;
    return await handleFinalAssessment(session, res);
  }

  // ── SINGLE-PASS TURN (EVALUATION + TUTOR DECISION) ──
  const tutorMessages = session.dialogueHistory.filter(d => d.role === 'tutor');
  const tutorLastMessage = tutorMessages.length > 0 ? tutorMessages[tutorMessages.length - 1].text : '';
  const turnPromptData = unifiedTurnPrompt(activeConcept, userText, session, tutorLastMessage);
  
  let turnResult;
  try {
    turnResult = await generateJSON({
      systemPrompt: turnPromptData.systemPrompt,
      userPrompt: turnPromptData.userPrompt,
      temperature: 0.5
    });
  } catch (e) {
    console.error('Unified turn prompt failed:', e.message);
    turnResult = {
      evaluation: {
        correctness: 'partial',
        confidence: 0.5,
        reasoning: 'Evaluation fallback',
        matched_misconception: null,
        missing_pieces: [],
        demonstrated_understanding: []
      },
      action: 'PROBE',
      reply_text: `I had a temporary hiccup connecting to the model (${e.message}). Could you please repeat your thoughts?`,
      tutor_state: 'PROBING',
      teaching_strategy: null
    };
  }

  const evaluation = turnResult.evaluation || {
    correctness: 'partial',
    confidence: 0.5,
    reasoning: 'Assessment complete',
    matched_misconception: null,
    missing_pieces: [],
    demonstrated_understanding: []
  };

  // Apply mastery update from evaluation
  updateMastery(session, activeConcept.id, evaluation);

  const agentDecision = {
    action: turnResult.action || 'PROBE',
    reply_text: turnResult.reply_text || 'Can you tell me more about that?',
    tutor_state: turnResult.tutor_state || 'SPEAKING',
    teaching_strategy: turnResult.teaching_strategy || null
  };

  // Track teaching strategy
  if (agentDecision.teaching_strategy) {
    session.teachingStrategy = agentDecision.teaching_strategy;
    if (!session.usedStrategies.includes(agentDecision.teaching_strategy)) {
      session.usedStrategies.push(agentDecision.teaching_strategy);
    }
  }

  // Handle action
  const action = agentDecision.action;

  if (action === 'ADVANCE') {
    // The agent decided to advance. We must mark the current concept as MASTERED
    // (or RETESTING if it had a previous gap) so the state machine can progress.
    const m = session.masteryMap[activeConcept.id];
    if (m) {
      if (!m.hadGap || m.status === MasteryStatus.RETESTING) {
        m.status = MasteryStatus.MASTERED;
      } else if (m.hadGap && m.status !== MasteryStatus.RETESTING) {
        // Had a gap but hasn't been retested — queue for retest
        if (!session.retestQueue.includes(activeConcept.id)) {
          session.retestQueue.push(activeConcept.id);
        }
        m.status = MasteryStatus.RETESTING;
      }
    }

    // Reset strategies for next concept
    session.usedStrategies = [];

    // Find next concept
    const nextId = getNextConcept(session);
    if (!nextId || action === 'END') {
      session.phase = SessionPhase.ASSESSMENT;
      const replyText = agentDecision.reply_text || "Excellent work! Let me prepare your session summary.";
      addDialogue(session, 'tutor', replyText);

      // Generate final assessment
      return await handleFinalAssessment(session, res, replyText);
    }

    session.activeConcept = nextId;
    if (session.masteryMap[nextId]) {
      session.masteryMap[nextId].status = MasteryStatus.IN_PROGRESS;
    }
  } else if (action === 'END') {
    session.phase = SessionPhase.ASSESSMENT;
    const replyText = agentDecision.reply_text || "Great work today! Let me summarize what we covered.";
    addDialogue(session, 'tutor', replyText);
    return await handleFinalAssessment(session, res, replyText);
  }

  // Record the tutor's reply
  const replyText = agentDecision.reply_text || "Can you tell me more about that?";
  addDialogue(session, 'tutor', replyText);

  // Map agent tutor_state to frontend states
  const tutorState = mapTutorState(agentDecision.tutor_state || action);

  return sendResponse(res, session, {
    reply_text: replyText,
    tutor_state: tutorState,
    action: action,
    evaluation: {
      correctness: evaluation.correctness,
      confidence: evaluation.confidence,
      matched_misconception: evaluation.matched_misconception
    }
  });
}

// ──────────────────────────────────────────────
// FINAL ASSESSMENT
// ──────────────────────────────────────────────
async function handleAssessment(session, userText, res) {
  // If we're in assessment and user responds, evaluate their response
  const activeConcept = session.learningPath.find(c => c.id === session.activeConcept);
  if (activeConcept) {
    return await handleLearning(session, userText, res);
  }
  return await handleFinalAssessment(session, res);
}

async function handleFinalAssessment(session, res, prefixReply) {
  session.phase = SessionPhase.COMPLETE;

  try {
    const summaryPromptData = finalSummaryPrompt(session);
    const summary = await generateJSON({
      systemPrompt: summaryPromptData.systemPrompt,
      userPrompt: summaryPromptData.userPrompt,
      temperature: 0.7
    });

    const replyText = (prefixReply ? prefixReply + ' ' : '') + (summary.reply_text || 'Session complete!');
    addDialogue(session, 'tutor', replyText);

    return res.status(200).json({
      session_id: session.id,
      tutor_state: 'SUMMARY',
      action: 'END',
      reply_text: replyText,
      active_concept_id: null,
      current_gap_concept_id: null,
      mastery_updates: [],
      mastery_map: getMasteryForResponse(session),
      learning_path: session.learningPath,
      understanding_pct: calculateUnderstanding(session),
      phase: session.phase,
      summary: {
        understanding_pct: summary.understanding_pct || calculateUnderstanding(session),
        mastered: summary.mastered || [],
        needs_practice: summary.needs_practice || [],
        gaps_fixed: summary.gaps_fixed || [],
        next_step: summary.next_step || 'Continue practicing these concepts.'
      }
    });
  } catch (e) {
    console.error('Final summary failed:', e.message);
    const understanding = calculateUnderstanding(session);
    const replyText = (prefixReply ? prefixReply + ' ' : '') +
      `Session complete! Your understanding is at ${understanding}%. Keep practicing!`;
    addDialogue(session, 'tutor', replyText);

    return sendResponse(res, session, {
      reply_text: replyText,
      tutor_state: 'SUMMARY',
      action: 'END',
      summary: { understanding_pct: understanding }
    });
  }
}

// ──────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────
function mapTutorState(state) {
  const stateMap = {
    'SPEAKING': 'SPEAKING',
    'PROBING': 'CORRECTING',     // maps to CORRECTING canvas state
    'CORRECTING': 'CORRECTING',
    'RETESTING': 'RETESTING',
    'CONFIRMED': 'CONFIRMED',
    'ADVANCING': 'CONFIRMED',
    'MASTERY_CONFIRMED': 'CONFIRMED',
    'LISTENING': 'LISTENING',
    'THINKING': 'THINKING',
    'IDLE': 'IDLE',
    'SUMMARY': 'SUMMARY',
    // Action-based fallbacks
    'PROBE': 'SPEAKING',
    'CORRECT_AND_REASK': 'CORRECTING',
    'RETEST': 'RETESTING',
    'ADVANCE': 'CONFIRMED',
    'QUIZ': 'SPEAKING',
    'TEACH': 'SPEAKING',
    'END': 'SUMMARY'
  };
  return stateMap[state] || 'SPEAKING';
}

function sendResponse(res, session, extra) {
  return res.status(200).json({
    session_id: session.id,
    session_state: session,
    tutor_state: extra.tutor_state || 'SPEAKING',
    action: extra.action || 'SPEAK',
    reply_text: extra.reply_text || '',
    active_concept_id: session.activeConcept,
    current_gap_concept_id: session.currentGapConcept,
    mastery_updates: extra.mastery_updates || [],
    mastery_map: getMasteryForResponse(session),
    learning_path: session.learningPath,
    understanding_pct: calculateUnderstanding(session),
    phase: session.phase,
    topic: session.topic,
    ...(extra.topic_suggestions ? { topic_suggestions: extra.topic_suggestions } : {}),
    ...(extra.evaluation ? { evaluation: extra.evaluation } : {}),
    ...(extra.summary ? { summary: extra.summary } : {})
  });
}
