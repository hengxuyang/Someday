import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isActive, applyReview, pickForDiscovery, reviewQueue, SNOOZE_DAYS } from './curate.js';

const NOW = new Date('2026-10-20T12:00:00Z');
const item = (id, extra = {}) => ({ id, intent: 'eat', created_at: '2026-10-01T00:00:00.000Z', ...extra });

test('done and snoozed items are not active; expired snoozes are', () => {
  assert.equal(isActive(item('a', { status: 'done' }), NOW), false);
  assert.equal(isActive(item('a', { snoozed_until: '2026-10-25T00:00:00.000Z' }), NOW), false);
  assert.equal(isActive(item('a', { snoozed_until: '2026-10-10T00:00:00.000Z' }), NOW), true);
});

test('applyReview sets status and revisit time; "later" snoozes', () => {
  assert.deepEqual(applyReview('keep', NOW), { status: 'keep', last_revisited_at: NOW.toISOString() });
  const later = applyReview('later', NOW);
  assert.equal(new Date(later.snoozed_until) - NOW, SNOOZE_DAYS * 86_400_000);
  assert.equal(later.status, undefined);
  assert.equal(applyReview('reset', NOW).status, 'new');
  assert.throws(() => applyReview('explode'), { status: 400 });
});

test('discovery returns at most n, never done or snoozed items, without repeats', () => {
  const items = [item('a'), item('b'), item('c', { status: 'done' }), item('d', { snoozed_until: '2027-01-01T00:00:00.000Z' }), item('e'), item('f')];
  const picks = pickForDiscovery(items, 3, NOW, () => 0.5);
  assert.equal(picks.length, 3);
  assert.equal(new Set(picks.map((p) => p.id)).size, 3);
  assert.ok(picks.every((p) => !['c', 'd'].includes(p.id)));
  assert.equal(pickForDiscovery([item('a')], 3, NOW).length, 1);
  assert.deepEqual(pickForDiscovery([], 3, NOW), []);
});

test('discovery mixes kinds: with a fixed rng the second pick avoids the first pick\'s intent', () => {
  const items = [item('e1'), item('e2'), item('e3'), item('v1', { intent: 'visit' })];
  const rolls = [0, 0.5, 0.5];
  const picks = pickForDiscovery(items, 2, NOW, () => rolls.shift());
  assert.equal(picks[0].id, 'e1');
  assert.equal(picks[1].id, 'v1');
});

test('items not seen for longer are likelier than just-seen ones', () => {
  const stale = item('stale');
  const fresh = item('fresh', { last_revisited_at: NOW.toISOString() });
  let staleFirst = 0;
  for (let i = 0; i < 1000; i++) if (pickForDiscovery([fresh, stale], 1, NOW, Math.random)[0].id === 'stale') staleFirst++;
  assert.ok(staleFirst > 600, `stale picked ${staleFirst}/1000`);
});

test('review queue: unreviewed newest first, then oldest maybes; keep/done/snoozed excluded; capped', () => {
  const items = [
    item('old', { created_at: '2026-09-01T00:00:00.000Z' }),
    item('new', { created_at: '2026-10-10T00:00:00.000Z' }),
    item('kept', { status: 'keep' }),
    item('gone', { status: 'done' }),
    item('maybeOld', { status: 'maybe', last_revisited_at: '2026-10-02T00:00:00.000Z' }),
    item('maybeNew', { status: 'maybe', last_revisited_at: '2026-10-12T00:00:00.000Z' }),
    item('snoozed', { snoozed_until: '2027-01-01T00:00:00.000Z' }),
  ];
  assert.deepEqual(reviewQueue(items, 10, NOW).map((i) => i.id), ['new', 'old', 'maybeOld', 'maybeNew']);
  assert.equal(reviewQueue(items, 2, NOW).length, 2);
});
