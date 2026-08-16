const { getSession, getMasteryForResponse, calculateUnderstanding } = require('../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.query.id;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  const session = getSession(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  return res.status(200).json({
    session_id: session.id,
    goal: session.goal,
    learningPath: session.learningPath,
    masteryMap: getMasteryForResponse(session),
    understanding_pct: calculateUnderstanding(session),
    dialogueHistory: session.dialogueHistory,
    agent_state: 'IDLE'
  });
};
