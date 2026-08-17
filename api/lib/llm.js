// api/lib/llm.js — Provider-agnostic LLM abstraction
// Swap provider by changing LLM_PROVIDER env var

/**
 * @param {Object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userPrompt
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxTokens=2048]
 * @param {boolean} [opts.jsonMode=false]
 * @returns {Promise<string>} Raw text response
 */
async function generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 800, jsonMode = false }) {
  const provider = (process.env.LLM_PROVIDER || 'groq').toLowerCase();

  switch (provider) {
    case 'gemini':
      return generateGemini({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode });
    case 'openai':
      return generateOpenAI({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode });
    case 'groq':
      return generateGroq({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode });
    default:
      throw new Error(`Unknown LLM provider: ${provider}. Supported: gemini, openai, groq`);
  }
}

// ──────────────────────────────────────────────
// Google Gemini
// ──────────────────────────────────────────────
async function generateGemini({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set');

  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);

  const generationConfig = {
    temperature,
    maxOutputTokens: maxTokens,
  };

  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
    generationConfig,
  });

  const result = await model.generateContent(userPrompt);
  const response = result.response;
  return response.text();
}

// ──────────────────────────────────────────────
// OpenAI (alternative provider)
// ──────────────────────────────────────────────
async function generateOpenAI({ systemPrompt, userPrompt, temperature, maxTokens, jsonMode }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set');

  const body = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature,
    max_tokens: maxTokens,
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ──────────────────────────────────────────────
// Groq (OpenAI-compatible, ultra-fast inference with automatic fallback)
// ──────────────────────────────────────────────
async function generateGroq({ systemPrompt, userPrompt, temperature, maxTokens = 800, jsonMode }) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set');

  const modelsToTry = [
    process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
    'qwen/qwen3.6-27b',
    'llama-3.3-70b-versatile',
    'mixtral-8x7b-32768'
  ];
  const uniqueModels = [...new Set(modelsToTry)];

  let lastError = null;

  for (const model of uniqueModels) {
    try {
      const body = {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        max_tokens: Math.min(maxTokens, 1000),
      };

      // Qwen models output reasoning thoughts which fail Groq's strict JSON validation at start of generation.
      // We bypass JSON mode for Qwen; our robust parseJSONResponse will extract the JSON object from the text.
      if (jsonMode && !model.includes('qwen')) {
        body.response_format = { type: 'json_object' };
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (res.status === 429) {
        console.warn(`[LLM] Groq 429 on model ${model}. Falling back to next available model...`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[LLM] Groq error on model ${model}:`, errText);
        lastError = new Error(`Groq API error ${res.status}: ${errText}`);
        continue;
      }

      const data = await res.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        return data.choices[0].message.content;
      }
    } catch (err) {
      lastError = err;
      console.warn(`[LLM] Model ${model} fetch exception:`, err.message);
    }
  }

  throw lastError || new Error('All Groq fallback models failed');
}

// ──────────────────────────────────────────────
// Groq Whisper (Audio Transcription)
// ──────────────────────────────────────────────
async function transcribeAudioGroq(base64Audio) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY environment variable is not set');

  const base64Data = base64Audio.includes(',') ? base64Audio.split(',')[1] : base64Audio;
  const buffer = Buffer.from(base64Data.trim(), 'base64');
  const blob = new Blob([buffer], { type: 'audio/webm' });

  const formData = new FormData();
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'en');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return data.text;
}

/**
 * Generate with JSON parsing and retry on malformed output
 * @param {Object} opts - same as generate()
 * @returns {Promise<Object>} Parsed JSON object
 */
async function generateJSON(opts) {
  const optsWithJson = { ...opts, jsonMode: true };

  // Attempt 1
  try {
    const raw = await generate(optsWithJson);
    return parseJSONResponse(raw);
  } catch (err1) {
    console.warn('[LLM] First attempt failed, retrying...', err1.message);
  }

  // Attempt 2 (retry once)
  try {
    const raw = await generate(optsWithJson);
    return parseJSONResponse(raw);
  } catch (err2) {
    console.error('[LLM] Second attempt also failed', err2.message);
    throw new Error(`LLM JSON generation failed after 2 attempts: ${err2.message}`);
  }
}

/**
 * Parse JSON from LLM response, handling markdown fences
 */
function parseJSONResponse(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Empty response from LLM');
  }

  let cleaned = raw.trim();

  // Strip markdown code fences if present
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?([\s\S]*?)```/g, '$1').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to extract JSON object/array from the response
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      let matched = jsonMatch[0];
      // Clean common trailing commas
      matched = matched.replace(/,\s*([\]}])/g, '$1');
      try {
        return JSON.parse(matched);
      } catch (innerErr) {
        // Continue to throw outer error
      }
    }
    throw new Error(`Could not parse JSON from LLM response: ${cleaned.substring(0, 250)}`);
  }
}

module.exports = { generate, generateJSON, transcribeAudioGroq };
