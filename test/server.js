// Plain-Node static file server + canned /api/* responder for the Playwright
// test harness. Replaces `python3 -m http.server`, which can only serve static
// files and can't answer /api/* at all — every surface that calls an /api/*
// endpoint on load (sso, sms, psgc, everify, ai) would otherwise see a
// console error (404/501) in every test run, even though those endpoints are
// real Vercel serverless functions that work fine on the deployed site.
//
// This server does two things only:
//   1. serve ../public statically, with correct Content-Type per extension
//   2. answer any /api/* request with HTTP 200 + application/json + a thin
//      canned body — just enough that each caller's success path runs
//      without throwing (the surfaces already fall back gracefully on a
//      missing field, so the bodies below are intentionally minimal).
//
// Genuinely missing static files still 404 — this is not a blanket-200.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = 5173;
// Bind IPv4 explicitly, and let playwright.config.js address us the same way.
// 5173 is Vite's default port: a Vite dev server from any unrelated project
// binds [::1]:5173, `localhost` resolves to BOTH ::1 and 127.0.0.1, and
// Chromium races them — so half the suite silently loads a stranger's app and
// fails in ways that look like product regressions. Pinning both ends to
// 127.0.0.1 removes the race.
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Minimal canned bodies — just enough shape that each caller's `if (r && r.x)`
// success path runs without throwing. Unlisted actions/paths fall back to
// `{ ok: true }`, which every caller already tolerates via its own fallback.
const API_BODIES = {
  '/api/sso': { ok: true, profile: { first_name: 'Juan', last_name: 'Dela Cruz', name: 'Juan Dela Cruz', mobile: '+639175550142' } },
  '/api/sms': { ok: true, results: [] },
  '/api/psgc': { ok: true, level: 'regions', items: [] },
  '/api/everify': { ok: true, verified: true, hasIdentity: false, person: null },
  '/api/ai': { ok: true, translated: null, transliterated: null, data: null }
};

function cannedBodyFor(pathname) {
  for (const prefix of Object.keys(API_BODIES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return API_BODIES[prefix];
  }
  return { ok: true };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    // Drain the request body (if any) so the client's fetch always resolves cleanly.
    for await (const _chunk of req) { /* discard */ }
    const body = JSON.stringify(cannedBodyFor(url.pathname));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') filePath = path.join(PUBLIC_DIR, 'index.html');

  // Guard against path traversal outside PUBLIC_DIR.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`test server listening on http://${HOST}:${PORT}`);
});
