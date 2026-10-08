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

import { readFileSync } from 'node:fs';

test('real noisy Instagram OCR (garbled CJK + icons) still yields the venue', () => {
  const r = extract(readFileSync(new URL('./fixtures/instagram-steak-stop.txt', import.meta.url), 'utf8'));
  assert.equal(r.intent, 'eat');
  assert.equal(r.name, 'Steak Stop');
  assert.equal(r.location, '12 Joo Chiat Rd, 01-03 Hotel Classic by Venue, Singapore 427353');
  assert.deepEqual(r.useful_details, ['12pm-3pm & 5pm-10pm']);
  assert.ok(r.confidence >= 0.5);
});

test('garbled lines are never chosen as the name', () => {
  const r = extract('BS VjioSBRRRIZH+H OBA RM!\nASRHSEmMExZers*®\nRamen Nagi\nOpen 11am-10pm');
  assert.equal(r.name, 'Ramen Nagi');
});

test('CJK names are accepted', () => {
  assert.equal(extract('客家人豆腐\n味道很好的餐厅\nmenu').name, '客家人豆腐');
});

test('address and hours alone suggest a place to visit, with low confidence', () => {
  const r = extract('Some Spot\n5 Orchard Road\nOpen 10am-9pm');
  assert.equal(r.type, 'place');
  assert.ok(r.confidence < 0.5);
  assert.equal(r.location, '5 Orchard Road');
});

test('Apple Vision output of the same screenshot: food, full address, de-duplicated hours', () => {
  const r = extract(readFileSync(new URL('./fixtures/instagram-steak-stop-vision.txt', import.meta.url), 'utf8'));
  assert.equal(r.type, 'food'); // "Hotel" in the address must not make it a place
  assert.equal(r.name, 'Steak Stop');
  assert.equal(r.location, '12 Joo Chiat Rd, 01-03 Hotel Classic by Venue, Singapore 427353');
  assert.equal(r.useful_details.length, 1);
  assert.match(r.useful_details[0], /12pm-3pm/);
});

test('a lone postal code line is not mistaken for a second address', () => {
  assert.equal(extract('Cafe Nine\n9 Bukit Pasoh Road,\nSingapore 089827\nOpen 8am-5pm').location, '9 Bukit Pasoh Road, Singapore 089827');
});
