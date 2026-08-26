// Minimal local HTTP server that mimics Vercel's Node runtime request
// handling, so we can test the real handlers over an actual HTTP round
// trip (curl) without needing a Vercel account/login.
const fs = require('fs');
const path = require('path');
const http = require('http');

// No dotenv dependency -- just a few lines to load .env into process.env
// for local dev (Vercel sets real env vars itself in production).
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const routes = {
  '/api/chart': require('./api/chart'),
  '/api/interpret': require('./api/interpret'),
};

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = { '.html': 'text/html; charset=utf-8' };

function tryServeStatic(req, res, pathname) {
  const filePath = path.join(PUBLIC_DIR, pathname === '/' ? '/test.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
  res.end(fs.readFileSync(filePath));
  return true;
}

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    if (raw) {
      try { req.body = JSON.parse(raw); } catch (e) { req.body = {}; }
    }
    res.status = function (code) { this.statusCode = code; return this; };
    res.json = function (obj) {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(obj));
    };

    const pathname = (req.url || '').split('?')[0];
    const handler = routes[pathname];
    if (!handler) {
      if (tryServeStatic(req, res, pathname)) return;
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `no route for ${pathname}`, availableRoutes: Object.keys(routes) }));
      return;
    }

    Promise.resolve(handler(req, res)).catch((err) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    });
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`dev server on http://localhost:${PORT}`));
