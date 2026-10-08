import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.js';
import { createServer, backfill } from './server.js';

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

const FOOD_TEXT = 'Ke Kou Mian\nOrchard Towers\nOpen 24/7\nOriginal $8.90\nnoodles restaurant menu';

test('import structures the item; edits survive re-processing; intent filter works', async () => {
  const s = await start(async () => ({ engine: 'fake', text: FOOD_TEXT }));
  const { item } = await s.upload(1);
  assert.equal(item.intent, 'eat');
  assert.equal(item.name, 'Ke Kou Mian');

  const patch = (body) => fetch(`${s.base}/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const edited = await (await patch({ name: 'KKM', intent: 'visit' })).json();
  assert.equal(edited.item.name, 'KKM');
  assert.equal(edited.item.why_saved, 'Place to visit');
  assert.equal(edited.item.confidence, 1);

  const again = await fetch(`${s.base}/api/items/${item.id}/reprocess`, { method: 'POST' }).then((r) => r.json());
  assert.equal(again.item.name, 'KKM');
  assert.equal(again.item.intent, 'visit');

  const list = (q) => fetch(`${s.base}/api/items?${q}`).then((r) => r.json());
  assert.equal((await list('intent=visit')).length, 1);
  assert.equal((await list('intent=eat')).length, 0);
  assert.equal((await list('q=kkm')).length, 1);

  assert.equal((await patch({ intent: 'nap' })).status, 400);
  assert.equal((await fetch(`${s.base}/api/items/${item.id}`, { method: 'PATCH', body: '{oops' })).status, 400);
  s.close();
});

test('backfill analyses items that were OCRed before Phase 3', async () => {
  const store = new Store(await mkdtemp(path.join(os.tmpdir(), 'someday-')));
  await store.init();
  const { item } = await store.add(png(9), 'old.png');
  await store.update(item.id, { extracted_text: FOOD_TEXT, ocr_status: 'done' });
  await backfill(store);
  assert.equal((await store.list())[0].intent, 'eat');
});

test('review actions, discovery and the review queue work together', async () => {
  const s = await start(async () => ({ engine: 'fake', text: FOOD_TEXT }));
  const a = (await s.upload(1)).item;
  const b = (await s.upload(2)).item;
  const get = (u) => fetch(`${s.base}${u}`).then((r) => r.json());
  const act = (id, action) => fetch(`${s.base}/api/items/${id}/review`, { method: 'POST', body: JSON.stringify({ action }) });

  assert.equal((await get('/api/review/queue')).length, 2);
  assert.equal((await act(a.id, 'keep').then((r) => r.json())).item.status, 'keep');
  assert.deepEqual((await get('/api/review/queue')).map((i) => i.id), [b.id]); // kept items are not asked again

  await act(b.id, 'later'); // snoozed
  assert.equal((await get('/api/review/queue')).length, 0);
  assert.deepEqual((await get('/api/discover?n=5')).map((i) => i.id), [a.id]);
  assert.equal((await get(`/api/discover?exclude=${a.id}`)).length, 0);

  await act(a.id, 'done');
  assert.equal((await get('/api/discover')).length, 0);
  assert.equal((await get('/api/items')).length, 2); // done items stay findable in the library

  assert.equal((await act(a.id, 'explode')).status, 400);
  assert.equal((await act('deadbeef', 'keep')).status, 404);
  s.close();
});
