import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.js';
import { createServer } from './server.js';

const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`data${n}`)]);

async function start(ocr) {
  const store = new Store(await mkdtemp(path.join(os.tmpdir(), 'someday-')));
  await store.init();
  const server = createServer(store, { ocr });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const upload = (n) => fetch(`${base}/api/items`, { method: 'POST', headers: { 'X-Filename': `${n}.png` }, body: png(n) }).then((r) => r.json());
  return { base, upload, close: () => server.close() };
}

test('import runs OCR and search finds the text', async () => {
  const s = await start(async () => ({ engine: 'fake', text: 'Ke Kou Mian\nOrchard Towers' }));
  const { item } = await s.upload(1);
  assert.equal(item.ocr_status, 'done');
  assert.match(item.extracted_text, /Orchard/);
  assert.equal((await fetch(`${s.base}/api/items?q=orchard`).then((r) => r.json())).length, 1);
  assert.equal((await fetch(`${s.base}/api/items?q=sushi`).then((r) => r.json())).length, 0);
  s.close();
});

test('OCR failure does not block the import and can be retried', async () => {
  let fail = true;
  const s = await start(async () => {
    if (fail) throw new Error('no engine');
    return { engine: 'fake', text: 'hello' };
  });
  const { item } = await s.upload(1);
  assert.equal(item.ocr_status, 'failed');
  assert.equal((await fetch(`${s.base}/api/items`).then((r) => r.json())).length, 1);

  fail = false;
  const retry = await fetch(`${s.base}/api/items/${item.id}/ocr`, { method: 'POST' }).then((r) => r.json());
  assert.equal(retry.item.ocr_status, 'done');
  assert.equal(retry.item.extracted_text, 'hello');
  s.close();
});

test('duplicate imports do not re-run OCR', async () => {
  let calls = 0;
  const s = await start(async () => { calls++; return { engine: 'fake', text: 'x' }; });
  await s.upload(1);
  const dup = await s.upload(1);
  assert.equal(dup.duplicate, true);
  assert.equal(calls, 1);
  s.close();
});
