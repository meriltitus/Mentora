const { transcribeAudioGroq } = require('../lib/llm');

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audio } = req.body || {};
    if (!audio) {
      return res.status(400).json({ error: 'audio base64 string is required' });
    }

    const transcript = await transcribeAudioGroq(audio);
    
    return res.status(200).json({ transcript: transcript || '' });
  } catch (error) {
    console.warn('[transcribe] Notice:', error.message);
    return res.status(200).json({
      transcript: '',
      warning: error.message
    });
  }
};
