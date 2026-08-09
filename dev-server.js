// Minimal local HTTP server that mimics Vercel's Node runtime request
// handling, so we can test the real handler over an actual HTTP round
// trip (curl) without needing a Vercel account/login.
const http = require('http');
const handler = require('./api/chart');

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
    Promise.resolve(handler(req, res)).catch((err) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    });
  });
});

const PORT = 3001;
server.listen(PORT, () => console.log(`dev server on http://localhost:${PORT}`));
