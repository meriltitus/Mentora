const { deleteSession } = require('../lib/session');

module.exports = async (req, res) => {
  // Support both POST and DELETE for easier calling from frontend fetch
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.body.id || req.query.id;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing id' });
  }

  deleteSession(sessionId);
  return res.status(200).json({ success: true });
};
