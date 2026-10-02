#!/usr/bin/env node
// Zero-dependency static file server for the web build.
//
//   node tools/ai-studio/qa/serve.mjs [port]
//
// Exists so QA runs against the same directory Vercel publishes (vercel.json
// sets outputDirectory to "web") without adding a dev server dependency.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', 'web');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

export function createServer() {
  return http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' || rel === '') rel = '/index.html';
    // vercel.json cleanUrls: /campaign serves campaign.html
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

    fs.readFile(file, (err, buf) => {
      if (err) {
        // cleanUrls fallback
        fs.readFile(path.join(ROOT, rel + '.html'), (e2, b2) => {
          if (e2) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + rel); return; }
          res.writeHead(200, { 'Content-Type': TYPES['.html'] }).end(b2);
        });
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      }).end(buf);
    });
  });
}

export function listen(port = 0) {
  return new Promise(resolve => {
    const srv = createServer();
    srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.argv[2] || 8099);
  listen(port).then(({ port: p }) => console.log(`serving web/ at http://127.0.0.1:${p}/`));
}