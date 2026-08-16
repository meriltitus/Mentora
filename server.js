// server.js — Simple local development server (alternative to vercel dev)
// Usage: node server.js
// This serves static files and proxies /api/* to the serverless functions

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Load .env file if it exists
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const value = trimmed.substring(eqIdx + 1).trim();
          process.env[key] = value;
        }
      }
    });
    console.log('[Server] Loaded .env file');
  }
} catch (e) {
  console.warn('[Server] Could not load .env:', e.message);
}

const PORT = process.env.PORT || 3000;

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    return handleAPI(req, res, pathname);
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, filePath);
  const ext = path.extname(fullPath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

async function handleAPI(req, res, pathname) {
  // Parse body for POST requests
  let body = {};
  if (req.method === 'POST') {
    try {
      const rawBody = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
      body = JSON.parse(rawBody);
    } catch (e) {
      body = {};
    }
  }

  // Create a mock Vercel-style req/res
  const mockReq = {
    method: req.method,
    body,
    query: url.parse(req.url, true).query,
    headers: req.headers
  };

  const mockRes = {
    statusCode: 200,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      res.writeHead(this.statusCode, {
        'Content-Type': 'application/json',
        ...this.headers
      });
      res.end(JSON.stringify(data));
    },
    end() {
      res.writeHead(this.statusCode, this.headers);
      res.end();
    }
  };

  // Route to the correct handler
  try {
    let handler;
    if (pathname === '/api/session/start') {
      handler = require('./api/session/start');
    } else if (pathname === '/api/session/turn') {
      handler = require('./api/session/turn');
    } else if (pathname === '/api/session/transcribe') {
      handler = require('./api/session/transcribe');
    } else if (pathname === '/api/session/history') {
      handler = require('./api/session/history');
    } else if (pathname === '/api/session/load') {
      handler = require('./api/session/load');
    } else if (pathname === '/api/session/delete') {
      handler = require('./api/session/delete');
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API route not found' }));
      return;
    }

    await handler(mockReq, mockRes);
  } catch (err) {
    console.error('[Server] API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error', message: err.message }));
  }
}

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║         MENTORA — Voice-First AI Tutor        ║
╠═══════════════════════════════════════════════╣
║                                               ║
║  🌐 Live:  http://localhost:${PORT}              ║
║  🎮 Demo:  http://localhost:${PORT}/?demo=1      ║
║                                               ║
║  API Endpoints:                               ║
║  POST /api/session/start                      ║
║  POST /api/session/turn                       ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});
