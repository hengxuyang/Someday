import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, analyse, validateEdit } from './extract.js';

const FOOD = `9:41
@foodie.sg
Ke Kou Mian
Orchard Towers
Open 24/7
Best noodles in town! Come try the combo, super spicy and delicious
Original $8.90
Spicy $9.90
1,204 likes`;

test('food screenshot becomes a structured eat item', () => {
  const r = extract(FOOD);
  assert.equal(r.type, 'food');
  assert.equal(r.intent, 'eat');
  assert.equal(r.name, 'Ke Kou Mian');
  assert.equal(r.location, 'Orchard Towers');
  assert.deepEqual(r.useful_details, ['Open 24/7', 'Original $8.90', 'Spicy $9.90']);
  assert.ok(r.confidence > 0.5);
});

test('place screenshot becomes a visit item', () => {
  const r = extract('Mt. Fuji Fifth Station\nJapan\nBest season: Autumn\nScenic hiking trail with summit views');
  assert.equal(r.intent, 'visit');
  assert.equal(r.location, 'Japan');
  assert.deepEqual(r.useful_details, ['Best season: Autumn']);
});

test('product screenshot becomes a buy item without a bogus location', () => {
  const r = extract('Sony WH-1000XM5\n$399.00\nFree shipping\nAdd to cart');
  assert.equal(r.intent, 'buy');
  assert.equal(r.name, 'Sony WH-1000XM5');
  assert.equal(r.location, '');
});

test('unclear text is low confidence "other"', () => {
  const r = extract('hello world');
  assert.equal(r.type, 'other');
  assert.ok(r.confidence < 0.5);
});

test('empty text does not crash', () => {
  assert.equal(extract('').type, 'other');
  assert.equal(extract(undefined).intent, 'other');
});

test('re-analysing keeps fields the user edited', () => {
  const item = { extracted_text: FOOD, name: 'My Noodles', intent: 'visit', edited_fields: ['name', 'intent'] };
  const patch = analyse(item);
  assert.equal('name' in patch, false);
  assert.equal('intent' in patch, false);
  assert.equal(patch.type, 'food');
  assert.equal(patch.why_saved, 'Place to visit');
  assert.equal(patch.confidence, 1);
});

test('validateEdit rejects bad input', () => {
  assert.throws(() => validateEdit({ intent: 'nap' }), { status: 400 });
  assert.throws(() => validateEdit({ hash: 'x' }), { status: 400 });
  assert.throws(() => validateEdit({ useful_details: 'a' }), { status: 400 });
  assert.deepEqual(validateEdit({ name: '  Foo ', useful_details: [' a ', ''] }), { name: 'Foo', useful_details: ['a'] });
});
