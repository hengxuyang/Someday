import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from './store.js';

const png = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(`data${n}`)]);

async function fresh() {
  const s = new Store(await mkdtemp(path.join(os.tmpdir(), 'someday-')));
  await s.init();
  return s;
}

test('add copies image and lists it', async () => {
  const s = await fresh();
  const { item, duplicate } = await s.add(png(1), 'IMG_1.PNG');
  assert.equal(duplicate, false);
  await access(path.join(s.root, item.image_path));
  assert.equal((await s.list()).length, 1);
});

test('duplicate images are detected', async () => {
  const s = await fresh();
  await s.add(png(1), 'a.png');
  const r = await s.add(png(1), 'b.png');
  assert.equal(r.duplicate, true);
  assert.equal((await s.list()).length, 1);
});

test('concurrent adds are not lost', async () => {
  const s = await fresh();
  await Promise.all([1, 2, 3, 4, 5].map((n) => s.add(png(n), `${n}.png`)));
  assert.equal((await s.list()).length, 5);
});

test('rejects non-images', async () => {
  const s = await fresh();
  await assert.rejects(() => s.add(Buffer.from('not an image at all'), 'x.txt'), { status: 415 });
});

test('remove deletes the copy and the record', async () => {
  const s = await fresh();
  const { item } = await s.add(png(1), 'a.png');
  assert.equal(await s.remove(item.id), true);
  await assert.rejects(access(path.join(s.root, item.image_path)));
  assert.equal(await s.remove(item.id), false);
});
