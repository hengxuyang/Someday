import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const publicDir = path.join(here, 'public');
const MAX_BYTES = 50 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
};

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BYTES) {
        reject(Object.assign(new Error('File too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function serveFile(res, dir, rel) {
  const file = path.join(dir, rel);
  if (!file.startsWith(dir + path.sep)) return json(res, 403, { error: 'Forbidden' });
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    json(res, 404, { error: 'Not found' });
  }
}

export function createServer(store) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;

      if (p === '/api/items' && req.method === 'GET') return json(res, 200, await store.list());

      if (p === '/api/items' && req.method === 'POST') {
        const name = decodeURIComponent(req.headers['x-filename'] || 'screenshot');
        const { item, duplicate } = await store.add(await readBody(req), name);
        return json(res, duplicate ? 200 : 201, { item, duplicate });
      }

      const del = p.match(/^\/api\/items\/([a-f0-9]+)$/);
      if (del && req.method === 'DELETE') {
        return (await store.remove(del[1])) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Not found' });
      }

      if (req.method === 'GET' && p.startsWith('/images/')) return serveFile(res, store.imageDir, path.basename(p));
      if (req.method === 'GET') return serveFile(res, publicDir, p === '/' ? 'index.html' : p.slice(1));

      json(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      json(res, err.status || 500, { error: err.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new Store(root);
  await store.init();
  const port = Number(process.env.PORT) || 3000;
  // Bind to loopback only: this is a private, local app.
  createServer(store).listen(port, '127.0.0.1', () => console.log(`Someday running at http://localhost:${port}`));
}
