const { getAllSessions, calculateUnderstanding } = require('../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const sessions = getAllSessions();
  
  const history = sessions.map(s => ({
    id: s.id,
    goal: s.goal,
    createdAt: s.createdAt,
    understanding_pct: calculateUnderstanding(s)
  })).sort((a, b) => b.createdAt - a.createdAt);
  
  return res.status(200).json({ history });
};
