// Revisit logic (PROJECT.md §10-11): which saved things to surface, and how reviewing changes them.
// Pure functions: the clock and random source are passed in so they can be tested.

export const SNOOZE_DAYS = 7;
export const STATUSES = ['new', 'keep', 'maybe', 'done'];
export const REVIEW_ACTIONS = ['keep', 'maybe', 'done', 'reset', 'later', 'viewed'];

const DAY = 24 * 60 * 60 * 1000;
const iso = (d) => d.toISOString();

// Done things are finished, and snoozed things ("Maybe later") stay out of sight for a while.
export function isActive(item, now = new Date()) {
  return item.status !== 'done' && !(item.snoozed_until && item.snoozed_until > iso(now));
}

export function applyReview(action, now = new Date()) {
  const seen = { last_revisited_at: iso(now) };
  switch (action) {
    case 'keep': case 'maybe': case 'done': return { ...seen, status: action };
    case 'reset': return { status: 'new', snoozed_until: undefined };
    case 'later': return { ...seen, snoozed_until: iso(new Date(now.getTime() + SNOOZE_DAYS * DAY)) };
    case 'viewed': return seen;
    default: throw Object.assign(new Error('Unknown action'), { status: 400 });
  }
}

// A small, varied handful. Things not looked at for longer are likelier; things marked "keep"
// get a nudge; after each pick, items of the same kind become less likely so the set is mixed.
export function pickForDiscovery(items, n = 3, now = new Date(), rng = Math.random) {
  const pool = items.filter((i) => isActive(i, now)).map((item) => {
    const touched = new Date(item.last_revisited_at || item.created_at).getTime();
    const days = Math.max(0, (now.getTime() - touched) / DAY);
    return { item, weight: (1 + Math.min(days, 30) / 10) * (item.status === 'keep' ? 1.5 : 1) };
  });
  const picks = [];
  while (picks.length < n && pool.length) {
    const total = pool.reduce((sum, p) => sum + p.weight, 0);
    let r = rng() * total;
    const idx = Math.max(0, pool.findIndex((p) => (r -= p.weight) < 0));
    const [chosen] = pool.splice(idx, 1);
    picks.push(chosen.item);
    for (const p of pool) if (p.item.intent === chosen.item.intent) p.weight *= 0.2;
  }
  return picks;
}

// A short list for review mode: unreviewed things (newest first), then the "maybe"s that have
// waited longest. Things already marked keep or done are not asked about again.
export function reviewQueue(items, limit = 5, now = new Date()) {
  const active = items.filter((i) => isActive(i, now));
  const fresh = active.filter((i) => !i.status || i.status === 'new').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const maybes = active.filter((i) => i.status === 'maybe')
    .sort((a, b) => (a.last_revisited_at || a.created_at).localeCompare(b.last_revisited_at || b.created_at));
  return [...fresh, ...maybes].slice(0, limit);
}
