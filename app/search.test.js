import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search } from './search.js';

const items = [
  { id: 'a', original_filename: 'IMG_1.PNG', extracted_text: 'Ke Kou Mian\nOrchard Towers\nOpen 24/7' },
  { id: 'b', original_filename: 'IMG_2.PNG', extracted_text: 'Best RAMEN in Singapore' },
  { id: 'c', original_filename: 'ramen-nagi.png' },
];
const ids = (q) => search(items, q).map((i) => i.id);

test('empty query returns everything', () => assert.deepEqual(ids('  '), ['a', 'b', 'c']));
test('matches OCR text case-insensitively', () => assert.deepEqual(ids('ramen').sort(), ['b', 'c']));
test('matches filename', () => assert.deepEqual(ids('IMG_1'), ['a']));
test('all words must match, in any order', () => {
  assert.deepEqual(ids('towers kou'), ['a']);
  assert.deepEqual(ids('ramen orchard'), []);
});
test('items without OCR text do not crash', () => assert.deepEqual(ids('nagi'), ['c']));
