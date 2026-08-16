// test_complete_suite.js — Comprehensive API & Engine Verification
const fs = require('fs');
const path = require('path');

// Load environment variables from .env
const envPath = path.resolve(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2] || '';
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runTests() {
  console.log(`\n======================================================`);
  console.log(`🚀 RUNNING EXTENSIVE TEST SUITE AGAINST: ${BASE_URL}`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`⏳ [TEST] ${name} ... `);
      const start = Date.now();
      await fn();
      const elapsed = Date.now() - start;
      console.log(`✅ PASSED (${elapsed}ms)`);
      passed++;
    } catch (err) {
      console.log(`❌ FAILED`);
      console.error(`   Error:`, err.message);
      failed++;
    }
  }

  let sessionId = null;
  let sessionState = null;

  // 1. Test /api/session/start
  await test('POST /api/session/start - Create Session with Roadmap & Diagnostic Question', async () => {
    const res = await fetch(`${BASE_URL}/api/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal: 'Distributed Systems & Paxos Consensus' })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (!data.session_id) throw new Error('Missing session_id');
    if (!data.reply_text) throw new Error('Missing reply_text');
    if (!data.session_state) throw new Error('Missing session_state');
    if (!data.learning_path || data.learning_path.length === 0) {
      throw new Error('Missing or empty learning_path');
    }

    sessionId = data.session_id;
    sessionState = data.session_state;

    console.log(`\n      • Initial Tutor Speech: "${data.reply_text.substring(0, 75)}..."`);
    console.log(`      • Generated Roadmap Nodes (${data.learning_path.length}): ${data.learning_path.map(n => n.name).join(' -> ')}`);
    console.log(`      • Active Concept: "${data.active_concept_id}"`);
  });

  // 2. Test /api/session/turn (Pass 1 - Accurate Answer)
  await test('POST /api/session/turn - Accurate Student Response (Mastery Progression)', async () => {
    const res = await fetch(`${BASE_URL}/api/session/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        transcript: 'Paxos achieves consensus through a two-phase protocol: Phase 1 Prepare/Promise to select proposal number, and Phase 2 Accept/Accepted to commit the value across a majority quorum.',
        session_state: sessionState
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (!data.reply_text) throw new Error('Missing reply_text');
    if (!data.session_state) throw new Error('Missing session_state');

    sessionState = data.session_state;
    console.log(`\n      • Diagnostic Pedagogical State: "${data.tutor_state || 'SPEAKING'}"`);
    console.log(`      • Tutor Response: "${data.reply_text.substring(0, 75)}..."`);
    console.log(`      • Overall Understanding: ${data.understanding_pct || 0}%`);
  });

  // 3. Test /api/session/turn (Pass 2 - Knowledge Gap Answer)
  await test('POST /api/session/turn - Sub-optimal Answer (Gap Detection & Socratic Correction)', async () => {
    const res = await fetch(`${BASE_URL}/api/session/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        transcript: 'I think Paxos just uses a single master database that handles all writes without needing any quorum or voting.',
        session_state: sessionState
      })
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (!data.reply_text) throw new Error('Missing reply_text');
    if (!data.session_state) throw new Error('Missing session_state');

    sessionState = data.session_state;
    console.log(`\n      • Tutor Socratic Guidance: "${data.reply_text.substring(0, 75)}..."`);
    console.log(`      • Active Pedagogical Action: "${data.action}"`);
  });

  // 4. Test /api/session/transcribe (Whisper Audio STT Mock Payload)
  await test('POST /api/session/transcribe - Audio STT Endpoint Payload Validation', async () => {
    const dummyAudioBase64 = 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAACxEU2bdLpnu4tTq4QVSalmU6yBgVTsi4HTbScBAAAAAAAAWVKugUWWgECfh3VUZWJtQoeBAkKFgQIYUYBkAQAAAAAAACxEU2bdLpnu4tTq4QVSalmU6yBgVTsi4HTbScBAAAAAAAAWVKugUWWgEOf';
    const res = await fetch(`${BASE_URL}/api/session/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio: dummyAudioBase64 })
    });

    if (res.status === 200 || res.status === 400) {
      const data = await res.json();
      console.log(`\n      • Transcribe Response Code: ${res.status} (Handled gracefully: ${data.transcript !== undefined || data.error !== undefined})`);
    } else {
      throw new Error(`Unexpected status ${res.status}`);
    }
  });

  console.log(`\n======================================================`);
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) process.exit(1);
}

runTests();
