// api/session/start.js — Session creation endpoint
const {
  createSession, updateSession, initMasteryMap,
  addDialogue, getMasteryForResponse, SessionPhase, calculateUnderstanding
} = require('../lib/session');
const { generateJSON } = require('../lib/llm');
const { unifiedStartPrompt } = require('../lib/prompts');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { goal } = req.body || {};

    if (!goal || goal.trim().length === 0) {
      return res.status(400).json({ error: 'Goal is required' });
    }

    // Create session
    const session = createSession(goal.trim());

    // Single-pass fast start analysis & curriculum generation
    const promptData = unifiedStartPrompt(goal.trim());
    const startResult = await generateJSON({
      systemPrompt: promptData.systemPrompt,
      userPrompt: promptData.userPrompt,
      temperature: 0.6
    });

    // Add the user's goal to dialogue
    addDialogue(session, 'user', goal.trim());

    if (startResult.goal_clarity === 'clear' && Array.isArray(startResult.concepts) && startResult.concepts.length > 0) {
      // Goal is clear — curriculum generated in 1 roundtrip
      session.topic = startResult.detected_topic || goal.trim();
      session.learningPath = startResult.concepts;
      session.phase = SessionPhase.LEARNING;
      initMasteryMap(session);

      // Set first concept as active & in progress
      const firstConcept = session.learningPath[0];
      session.activeConcept = firstConcept ? firstConcept.id : null;
      if (firstConcept && session.masteryMap[firstConcept.id]) {
        session.masteryMap[firstConcept.id].status = 'IN_PROGRESS';
      }

      const teachReply = startResult.reply_text || `Great! Let's explore ${session.topic}.`;
      addDialogue(session, 'tutor', teachReply);

      return res.status(200).json({
        session_id: session.id,
        session_state: session,
        needs_clarification: false,
        tutor_state: 'SPEAKING',
        reply_text: teachReply,
        topic: session.topic,
        learning_path: session.learningPath,
        active_concept_id: session.activeConcept,
        mastery_map: getMasteryForResponse(session),
        understanding_pct: calculateUnderstanding(session),
        phase: session.phase
      });
    } else {
      // Goal is vague or asks for recommendations — enter discovery
      session.phase = SessionPhase.DISCOVERY;
      session.topicSuggestions = startResult.topic_suggestions || null;

      const replyText = startResult.reply_text || startResult.discovery_question ||
        "I'd love to help you learn! Could you tell me a bit about what area interests you, or what you're trying to achieve?";

      addDialogue(session, 'tutor', replyText);

      return res.status(200).json({
        session_id: session.id,
        session_state: session,
        needs_clarification: true,
        tutor_state: session.topicSuggestions ? 'SPEAKING' : 'LISTENING',
        reply_text: replyText,
        topic: null,
        learning_path: [],
        active_concept_id: null,
        mastery_map: {},
        understanding_pct: 0,
        phase: session.phase,
        ...(session.topicSuggestions ? { topic_suggestions: session.topicSuggestions } : {})
      });
    }
  } catch (error) {
    console.error('[session/start] Error:', error);
    return res.status(500).json({
      error: 'Failed to start session',
      message: error.message
    });
  }
};
