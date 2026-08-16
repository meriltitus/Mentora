// api/lib/session.js — In-memory session store for MVP

const fs = require('fs');
const path = require('path');

// Use /tmp for Vercel serverless environment (read-only filesystem workaround)
const isVercel = process.env.VERCEL === '1';
const DATA_DIR = isVercel ? '/tmp/data' : path.join(__dirname, '../../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let sessions = new Map();

function loadSessionsFromDisk() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      sessions = new Map(Object.entries(parsed));
      console.log(`[Session] Loaded ${sessions.size} sessions from disk.`);
    }
  } catch (e) {
    console.error('[Session] Error loading sessions:', e);
  }
}

function saveSessionsToDisk() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (e) {
    console.error('[Session] Error saving sessions:', e);
  }
}

loadSessionsFromDisk();
/**
 * Mastery status constants
 */
const MasteryStatus = {
  NOT_TESTED: 'NOT_TESTED',
  IN_PROGRESS: 'IN_PROGRESS',
  GAP: 'GAP',
  RETESTING: 'RETESTING',
  MASTERED: 'MASTERED'
};

/**
 * Session phase constants
 */
const SessionPhase = {
  DISCOVERY: 'discovery',     // understanding what user wants to learn
  PLANNING: 'planning',       // generating learning path
  LEARNING: 'learning',       // active teaching loop
  ASSESSMENT: 'assessment',   // final assessment
  COMPLETE: 'complete'        // session finished
};

/**
 * Create a new session
 */
function createSession(goal) {
  const id = generateSessionId();
  const session = {
    id,
    goal: goal || '',
    topic: null,
    learningPath: [],           // [{ id, label, description, misconceptions[] }]
    masteryMap: {},             // { conceptId: { status, confidence, gapCount, testCount, lastStrategy } }
    activeConcept: null,        // current concept id being taught
    currentGapConcept: null,    // concept where gap was detected
    dialogueHistory: [],        // [{ role: 'tutor'|'user', text, timestamp }]
    phase: SessionPhase.DISCOVERY,
    teachingStrategy: null,     // last strategy used
    usedStrategies: [],         // strategies used for current concept
    retestQueue: [],            // concept IDs that need retesting
    discoveryAnswers: [],       // answers during goal discovery
    topicSuggestions: null,     // recommended topics (if discovery happened)
    turnCount: 0,
    createdAt: Date.now(),
    lastActiveAt: Date.now()
  };

  sessions.set(id, session);
  saveSessionsToDisk();
  return session;
}

/**
 * Get session by ID
 */
function getSession(id) {
  const session = sessions.get(id);
  if (session) {
    session.lastActiveAt = Date.now();
  }
  return session || null;
}

/**
 * Update session (partial merge)
 */
function updateSession(id, updates) {
  const session = sessions.get(id);
  if (!session) return null;

  Object.assign(session, updates, { lastActiveAt: Date.now() });
  saveSessionsToDisk();
  return session;
}

/**
 * Initialize mastery map from learning path
 */
function initMasteryMap(session) {
  session.masteryMap = {};
  session.learningPath.forEach(concept => {
    session.masteryMap[concept.id] = {
      status: MasteryStatus.NOT_TESTED,
      confidence: 0,
      gapCount: 0,
      testCount: 0,
      lastStrategy: null,
      hadGap: false
    };
  });
}

/**
 * Update mastery for a specific concept
 * Enforces evidence-based mastery rules
 */
function updateMastery(session, conceptId, evaluation) {
  const mastery = session.masteryMap[conceptId];
  if (!mastery) return;

  mastery.testCount++;

  const { correctness, confidence } = evaluation;

  switch (mastery.status) {
    case MasteryStatus.NOT_TESTED:
    case MasteryStatus.IN_PROGRESS:
      if (correctness === 'question' || correctness === 'insufficient' || correctness === 'acknowledgement' || correctness === 'unknown') {
        // Do not penalize confidence or mark as gap if they just asked a question, said idk, or gave a filler response
        mastery.status = MasteryStatus.IN_PROGRESS;
      } else if (correctness === 'correct' && confidence >= 0.75) {
        mastery.status = MasteryStatus.MASTERED;
        mastery.confidence = confidence;
      } else if (correctness === 'incorrect' || confidence < 0.5) {
        mastery.status = MasteryStatus.GAP;
        mastery.gapCount++;
        mastery.hadGap = true;
        mastery.confidence = confidence;
      } else {
        // partial — stay in progress, update confidence
        mastery.status = MasteryStatus.IN_PROGRESS;
        mastery.confidence = confidence;
      }
      break;

    case MasteryStatus.GAP:
      // After correction, moves to RETESTING (handled by agent action)
      if (correctness === 'correct' && confidence >= 0.6) {
        mastery.status = MasteryStatus.RETESTING;
        mastery.confidence = confidence;
        // Add to retest queue
        if (!session.retestQueue.includes(conceptId)) {
          session.retestQueue.push(conceptId);
        }
      } else {
        mastery.confidence = confidence;
        mastery.gapCount++;
      }
      break;

    case MasteryStatus.RETESTING:
      if (correctness === 'correct' && confidence >= 0.75) {
        mastery.status = MasteryStatus.MASTERED;
        mastery.confidence = confidence;
        // Remove from retest queue
        session.retestQueue = session.retestQueue.filter(id => id !== conceptId);
      } else if (correctness === 'incorrect') {
        mastery.status = MasteryStatus.GAP;
        mastery.gapCount++;
        mastery.confidence = confidence;
      } else {
        // partial on retest — stay retesting
        mastery.confidence = confidence;
      }
      break;

    case MasteryStatus.MASTERED:
      // Already mastered, update confidence only
      mastery.confidence = Math.max(mastery.confidence, confidence);
      break;
  }
  
  saveSessionsToDisk();
}

/**
 * Calculate overall understanding percentage
 */
function calculateUnderstanding(session) {
  const concepts = session.learningPath;
  if (concepts.length === 0) return 0;

  let score = 0;
  concepts.forEach(c => {
    const m = session.masteryMap[c.id];
    if (!m) return;
    switch (m.status) {
      case MasteryStatus.MASTERED: score += 1.0; break;
      case MasteryStatus.RETESTING: score += 0.5; break;
      case MasteryStatus.IN_PROGRESS: score += 0.3; break;
      case MasteryStatus.GAP: score += 0.1; break;
      default: score += 0; break;
    }
  });

  return Math.round((score / concepts.length) * 100);
}

/**
 * Get next concept to teach
 */
function getNextConcept(session) {
  // Priority 1: Retest queue
  if (session.retestQueue.length > 0) {
    return session.retestQueue[0];
  }

  // Priority 2: First concept that is NOT_TESTED or IN_PROGRESS
  for (const concept of session.learningPath) {
    const m = session.masteryMap[concept.id];
    if (m && (m.status === MasteryStatus.NOT_TESTED || m.status === MasteryStatus.IN_PROGRESS)) {
      return concept.id;
    }
  }

  // Priority 3: Any GAP concepts
  for (const concept of session.learningPath) {
    const m = session.masteryMap[concept.id];
    if (m && m.status === MasteryStatus.GAP) {
      return concept.id;
    }
  }

  // All mastered or retesting
  return null;
}

/**
 * Check if session is ready for final assessment
 */
function isReadyForFinalAssessment(session) {
  const allTested = session.learningPath.every(c => {
    const m = session.masteryMap[c.id];
    return m && m.status !== MasteryStatus.NOT_TESTED;
  });

  if (!allTested) return false;

  // Check retest queue is clear
  return session.retestQueue.length === 0;
}

/**
 * Add a dialogue entry
 */
function addDialogue(session, role, text) {
  if (!session) return;
  if (!Array.isArray(session.dialogueHistory)) {
    session.dialogueHistory = [];
  }
  session.dialogueHistory.push({
    role,
    text,
    timestamp: Date.now()
  });
  saveSessionsToDisk();
}

/**
 * Build mastery map for API response (frontend-friendly format)
 */
function getMasteryForResponse(session) {
  const result = {};
  if (!session || !session.masteryMap) return result;
  for (const [conceptId, mastery] of Object.entries(session.masteryMap)) {
    // Map internal status to CSS-compatible status for roadmap
    let cssStatus = 'locked';
    switch (mastery.status) {
      case MasteryStatus.MASTERED: cssStatus = 'mastered'; break;
      case MasteryStatus.GAP: cssStatus = 'gap-detected'; break;
      case MasteryStatus.RETESTING: cssStatus = 'retesting'; break;
      case MasteryStatus.IN_PROGRESS: cssStatus = 'in-progress'; break;
      default: cssStatus = 'locked'; break;
    }
    result[conceptId] = {
      ...mastery,
      cssStatus
    };
  }
  return result;
}

function generateSessionId() {
  return 'ses_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

function getAllSessions() {
  return Array.from(sessions.values());
}

function deleteSession(id) {
  if (id === 'all') {
    sessions.clear();
  } else {
    sessions.delete(id);
  }
  saveSessionsToDisk();
}

module.exports = {
  MasteryStatus,
  SessionPhase,
  createSession,
  getSession,
  updateSession,
  initMasteryMap,
  updateMastery,
  calculateUnderstanding,
  getNextConcept,
  isReadyForFinalAssessment,
  addDialogue,
  getMasteryForResponse,
  getAllSessions,
  deleteSession
};
