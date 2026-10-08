import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { ocrImage } from './ocr.js';
import { search } from './search.js';
import { analyse, validateEdit, whyFor } from './extract.js';
import { applyReview, pickForDiscovery, reviewQueue } from './curate.js';

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

// OCR failure must never block an import: record it and let the user retry later.
async function runOcr(store, item, ocr) {
  try {
    const { text, engine } = await ocr(path.join(store.root, item.image_path));
    const ocrFields = { extracted_text: text, ocr_status: 'done', ocr_engine: engine, ocr_error: undefined };
    return store.update(item.id, { ...ocrFields, ...analyse({ ...item, ...ocrFields }) });
  } catch (err) {
    return store.update(item.id, { ocr_status: 'failed', ocr_error: err.message });
  }
}

// Items imported before structured extraction existed get analysed on startup.
export async function backfill(store) {
  for (const item of await store.list()) {
    if (item.ocr_status === 'done' && !item.type) await store.update(item.id, analyse(item));
  }
}

export function createServer(store, { ocr = ocrImage, clock = () => new Date() } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;

      if (p === '/api/items' && req.method === 'GET') {
        const intent = url.searchParams.get('intent');
        const items = search(await store.list(), url.searchParams.get('q'));
        return json(res, 200, intent ? items.filter((i) => i.intent === intent) : items);
      }

      if (p === '/api/items' && req.method === 'POST') {
        const name = decodeURIComponent(req.headers['x-filename'] || 'screenshot');
        const added = await store.add(await readBody(req), name);
        const item = added.duplicate ? added.item : await runOcr(store, added.item, ocr);
        return json(res, added.duplicate ? 200 : 201, { item, duplicate: added.duplicate });
      }

      const redo = p.match(/^\/api\/items\/([a-f0-9]+)\/ocr$/);
      if (redo && req.method === 'POST') {
        const item = (await store.list()).find((i) => i.id === redo[1]);
        return item ? json(res, 200, { item: await runOcr(store, item, ocr) }) : json(res, 404, { error: 'Not found' });
      }

      if (p === '/api/discover' && req.method === 'GET') {
        const n = Math.min(Math.max(Number(url.searchParams.get('n')) || 3, 1), 6);
        const exclude = new Set((url.searchParams.get('exclude') || '').split(',').filter(Boolean));
        const items = (await store.list()).filter((i) => !exclude.has(i.id));
        return json(res, 200, pickForDiscovery(items, n, clock()));
      }

      if (p === '/api/review/queue' && req.method === 'GET') {
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 5, 1), 20);
        return json(res, 200, reviewQueue(await store.list(), limit, clock()));
      }

      const review = p.match(/^\/api\/items\/([a-f0-9]+)\/review$/);
      if (review && req.method === 'POST') {
        const { action } = JSON.parse((await readBody(req)).toString() || '{}');
        const patch = applyReview(action, clock());
        const item = await store.update(review[1], patch);
        return item ? json(res, 200, { item }) : json(res, 404, { error: 'Not found' });
      }

      const one = p.match(/^\/api\/items\/([a-f0-9]+)$/);

      if (one && req.method === 'PATCH') {
        const item = (await store.list()).find((i) => i.id === one[1]);
        if (!item) return json(res, 404, { error: 'Not found' });
        const edit = validateEdit(JSON.parse((await readBody(req)).toString() || '{}'));
        const edited_fields = [...new Set([...(item.edited_fields || []), ...Object.keys(edit)])];
        const patch = { ...edit, edited_fields };
        // Changing the intent updates the "why saved" line unless the user wrote their own.
        if (edit.intent && !edited_fields.includes('why_saved')) patch.why_saved = whyFor(edit.intent);
        if (edited_fields.includes('type') || edited_fields.includes('intent')) patch.confidence = 1;
        return json(res, 200, { item: await store.update(item.id, patch) });
      }

      const reprocess = p.match(/^\/api\/items\/([a-f0-9]+)\/reprocess$/);
      if (reprocess && req.method === 'POST') {
        const item = (await store.list()).find((i) => i.id === reprocess[1]);
        return item ? json(res, 200, { item: await store.update(item.id, analyse(item)) }) : json(res, 404, { error: 'Not found' });
      }

      const del = one;
      if (del && req.method === 'DELETE') {
        return (await store.remove(del[1])) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Not found' });
      }

      if (req.method === 'GET' && p.startsWith('/images/')) return serveFile(res, store.imageDir, path.basename(p));
      if (req.method === 'GET') return serveFile(res, publicDir, p === '/' ? 'index.html' : p.slice(1));

      json(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      json(res, err.status || (err instanceof SyntaxError ? 400 : 500), { error: err.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new Store(root);
  await store.init();
  await backfill(store);
  const port = Number(process.env.PORT) || 3000;
  // Bind to loopback only: this is a private, local app.
  createServer(store).listen(port, '127.0.0.1', () => console.log(`Someday running at http://localhost:${port}`));
}
