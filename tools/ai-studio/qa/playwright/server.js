// Minimal static file server for the web build.
//
// Dependency-free and separate from the Playwright runner so it can be reused
// by hand (`node server.js`). Serves web/ at the root exactly like
// vercel.json's outputDirectory does, so asset paths resolve as in production.
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB = path.resolve(process.argv[2] || path.join(__dirname, '../../../../web'));
const PORT = Number(process.env.PORT || process.env.BF_QA_PORT || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

function createServer() {
  return http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const file = path.join(WEB, urlPath);
    // Refuse to serve anything outside web/.
    if (!file.startsWith(WEB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Beast Forge web served from ${WEB}`);
    console.log(`  http://127.0.0.1:${PORT}/`);
  });
}

module.exports = { createServer, WEB, PORT };
