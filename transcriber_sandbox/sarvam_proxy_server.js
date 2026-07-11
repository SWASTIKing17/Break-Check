/**
 * Sarvam AI Cloud Transcriber — Local Zero-Dependency Proxy Server
 * 
 * Bypasses browser CORS restrictions when testing from file:// by serving
 * sarvam_minimal_test.html on http://localhost:8888 and streaming form POSTs
 * directly to https://api.sarvam.ai/speech-to-text.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8888;
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  // Allow all local origins during testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Serve UI
  if (req.url === '/' || req.url === '/index.html' || req.url === '/sarvam_minimal_test.html') {
    const uiPath = path.join(__dirname, 'sarvam_minimal_test.html');
    if (!fs.existsSync(uiPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('sarvam_minimal_test.html not found in ' + __dirname);
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(uiPath).pipe(res);
  }

  // Proxy to Sarvam API
  if (req.url === '/proxy/sarvam' && req.method === 'POST') {
    console.log(`[Proxy] Forwarding audio upload (${req.headers['content-length'] || '?'} bytes) to https://api.sarvam.ai/speech-to-text...`);

    const sarvamReq = https.request('https://api.sarvam.ai/speech-to-text', {
      method: 'POST',
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'api-subscription-key': req.headers['api-subscription-key'] || ''
      }
    }, (sarvamRes) => {
      console.log(`[Proxy] Sarvam API replied: HTTP ${sarvamRes.statusCode}`);
      res.writeHead(sarvamRes.statusCode, {
        'Content-Type': sarvamRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      sarvamRes.pipe(res);
    });

    sarvamReq.on('error', (err) => {
      console.error('[Proxy] Sarvam request error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `Proxy Gateway Error: ${err.message}` }));
    });

    req.on('error', (err) => {
      console.error('[Proxy] Client upload error:', err.message);
      sarvamReq.destroy();
    });

    req.pipe(sarvamReq);
    return;
  }

  // Proxy to Groq Cloud API
  if (req.url === '/proxy/groq' && req.method === 'POST') {
    console.log(`[Proxy] Forwarding audio upload (${req.headers['content-length'] || '?'} bytes) to https://api.groq.com...`);

    const groqReq = https.request('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
        'authorization': req.headers['authorization'] || ''
      }
    }, (groqRes) => {
      console.log(`[Proxy] Groq API replied: HTTP ${groqRes.statusCode}`);
      res.writeHead(groqRes.statusCode, {
        'Content-Type': groqRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      groqRes.pipe(res);
    });

    groqReq.on('error', (err) => {
      console.error('[Proxy] Groq request error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `Proxy Gateway Error: ${err.message}` }));
    });

    req.on('error', (err) => {
      console.error('[Proxy] Client upload error:', err.message);
      groqReq.destroy();
    });

    req.pipe(groqReq);
    return;
  }

  // Proxy to Groq Chat Completions API (Stage 3 LLM Refiner)
  if (req.url === '/proxy/groq_chat' && req.method === 'POST') {
    console.log(`[Proxy] Forwarding Stage 3 LLM prompt (${req.headers['content-length'] || '?'} bytes) to https://api.groq.com...`);

    const groqChatReq = https.request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': req.headers['content-type'] || 'application/json',
        'content-length': req.headers['content-length'],
        'authorization': req.headers['authorization'] || ''
      }
    }, (groqRes) => {
      console.log(`[Proxy] Groq LLM replied: HTTP ${groqRes.statusCode}`);
      res.writeHead(groqRes.statusCode, {
        'Content-Type': groqRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      groqRes.pipe(res);
    });

    groqChatReq.on('error', (err) => {
      console.error('[Proxy] Groq LLM request error:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: `Proxy Gateway Error: ${err.message}` }));
    });

    req.on('error', (err) => {
      console.error('[Proxy] Client prompt upload error:', err.message);
      groqChatReq.destroy();
    });

    req.pipe(groqChatReq);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found: ' + req.url);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please close any other running instances.`);
  } else {
    console.error('❌ Server error:', err);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`\n============================================================`);
  console.log(`  🚀 Sarvam AI Local Debug Gateway`);
  console.log(`============================================================`);
  console.log(`  Server running at:  http://${HOST}:${PORT}`);
  console.log(`  Open that URL in your browser to test without CORS errors!`);
  console.log(`  Press Ctrl+C to stop.\n`);
});
