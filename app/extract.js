// Rule-based understanding of OCR text (PROJECT.md §7, Phase 3). Pure functions, no I/O.
// Output shape matches the data model: type, intent, name, location, why_saved,
// useful_details, confidence. Deliberately simple; a later phase may add optional AI.

export const TYPES = ['food', 'place', 'product', 'event', 'info', 'other'];
export const INTENTS = ['eat', 'visit', 'buy', 'experience', 'learn', 'reference', 'other'];

const KEYWORDS = {
  food: /\b(restaurants?|cafe|café|menu|ramen|noodles?|sushi|brunch|bakery|dessert|coffee|pizza|burgers?|buffet|michelin|hawker|kopitiam|dishes|dish|combo|omakase|bbq|steak|dim sum|bistro|eatery|cuisine|delicious|tasty|foodie|breakfast|dinner|lunch|spicy|bubble tea|ice cream)\b/gi,
  place: /\b(hike|hiking|trail|mountain|mt\.?|temple|beach|park|museum|island|itinerary|travel|things to do|scenic|waterfall|national park|best season|castle|resort|hotel|viewpoint|lookout|attraction|sightseeing|trek|summit|shrine|garden|onsen|visit)\b/gi,
  product: /\b(add to cart|buy now|sale|discount|\d+% off|free shipping|in stock|sold out|shipping|checkout|order now|limited stock|voucher|amazon|shopee|lazada|price|deal|bundle)\b/gi,
  event: /\b(concert|tickets?|festival|exhibition|workshop|class|tour|live|register|admission|rsvp|lineup|line-up|gig|screening|performance|pop-?up|expo|market day|event)\b/gi,
  info: /\b(tutorial|how to|guide|tips|learn|course|step \d|steps|explained|thread|cheat ?sheet|lesson|beginner|tricks|hacks|recipe|ingredients)\b/gi,
};
const TYPE_TO_INTENT = { food: 'eat', place: 'visit', product: 'buy', event: 'experience', info: 'learn', other: 'other' };
const WHY = {
  eat: 'Place to eat',
  visit: 'Place to visit',
  buy: 'Something to consider buying',
  experience: 'Something to experience',
  learn: 'Something to learn',
  reference: 'Reference to keep',
  other: 'Saved for later',
};

const lines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const count = (re, text) => (text.match(re) || []).length;

export function classify(text) {
  const scores = Object.fromEntries(Object.entries(KEYWORDS).map(([t, re]) => [t, count(re, text)]));
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, top] = ranked[0];
  const second = ranked[1][1];
  if (top === 0) return { type: 'other', confidence: 0.2 };
  // Confidence grows with evidence and with how clearly the winner leads.
  const lead = (top - second) / top;
  const confidence = Math.min(0.85, 0.35 + 0.1 * Math.min(top, 4) + 0.15 * lead);
  return { type: best, confidence: Math.round(confidence * 100) / 100 };
}

const NOISE = [
  /^@|^#/, /^\d{1,2}:\d{2}/, /^\d+%$/, /^(like|likes|comments?|share|follow|following|reply|view|more|save|send|home|search|reels?|liked by)\b/i,
  /^https?:|www\.|\.com\b/i, /^[\d\s.,$¥€£%:/-]+$/, /^.{0,2}$/, /\b\d+[kKmM]?\s+(likes|comments|views|followers)\b/i,
];

function nameCandidates(text) {
  return lines(text).slice(0, 15).filter((l) => !NOISE.some((re) => re.test(l)) && l.length <= 60);
}

export function guessName(text) {
  const scored = nameCandidates(text).map((line, i) => {
    const words = line.split(/\s+/);
    const capitalised = words.filter((w) => /^[A-Z0-9]/.test(w)).length / words.length;
    let score = capitalised * 2 - i * 0.1;
    if (words.length <= 5) score += 1;
    if (/[.!?]$/.test(line) || words.length > 8) score -= 2;
    return { line, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score > 0 ? scored[0].line : '';
}

const ADDRESS = /\b\d{1,4}[A-Za-z]?[ \t]+[A-Z][\w' ]{2,30}[ \t](Road|Rd|Street|St|Avenue|Ave|Lane|Drive|Dr|Boulevard|Blvd)\b[^\n]*/;
const VENUE = /\b([A-Z][\w']+(?:[ \t]+[A-Z][\w']+){0,3}[ \t](?:Towers?|Plaza|Mall|Centre|Center|Building|Market|Square|Hotel|Station|Island|Park|Hawker Centre|Food Centre|Quay|Walk|Point|City))\b/;
const PREPOSITION = /\b(?:in|at|near)[ \t]+([A-Z][\w']+(?:[ \t]+[A-Z][\w']+){0,2})\b/;

export function guessLocation(text, name = '', type = 'other') {
  const n = name.toLowerCase();
  // A match that is just part of the name (e.g. "Fuji Fifth Station") isn't a location.
  const usable = (loc) => loc && !n.includes(loc.toLowerCase());
  for (const re of [ADDRESS, VENUE, PREPOSITION]) {
    const m = text.match(re);
    const loc = m && (m[1] || m[0]).trim();
    if (usable(loc)) return loc;
  }
  // Fallback: a short Title Case line right under the name ("Japan", "Orchard").
  const all = lines(text);
  const next = all[all.indexOf(name) + 1];
  if (['food', 'place', 'event'].includes(type) && name && next && !NOISE.some((re) => re.test(next)) && next.split(/\s+/).length <= 3 && /^[A-Z]/.test(next) && !DETAIL_PATTERNS.some((re) => re.test(next))) return next;
  return '';
}

const DETAIL_PATTERNS = [
  /(?:S\$|US\$|RM|[$¥€£])\s?\d[\d,]*(?:\.\d{1,2})?/i,
  /\bopen\b|\bclosed\b|24\s?\/\s?7|\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b|\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\b\s*[-–]/i,
  /\bbest (?:season|time)\b|\bentry\b|\badmission\b|\breservation/i,
];

export function guessDetails(text, name = '', location = '') {
  const seen = new Set();
  const out = [];
  for (const line of lines(text)) {
    if (line === name || line === location || line.length > 80) continue;
    if (!DETAIL_PATTERNS.some((re) => re.test(line))) continue;
    const key = line.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(line);
    }
    if (out.length === 8) break;
  }
  return out;
}

export function extract(text) {
  const t = (text || '').trim();
  if (!t) return { type: 'other', intent: 'other', name: '', location: '', why_saved: WHY.other, useful_details: [], confidence: 0.1 };
  const { type, confidence } = classify(t);
  const intent = TYPE_TO_INTENT[type];
  const name = guessName(t);
  const location = guessLocation(t, name, type);
  return { type, intent, name, location, why_saved: WHY[intent], useful_details: guessDetails(t, name, location), confidence };
}

export const whyFor = (intent) => WHY[intent] || WHY.other;

export const EDITABLE = ['type', 'intent', 'name', 'location', 'why_saved', 'useful_details'];

// Fields to write for an item given its current text. Fields the user has edited are kept.
export function analyse(item) {
  const ex = extract(item.extracted_text);
  const edited = item.edited_fields || [];
  const patch = {};
  for (const key of [...EDITABLE, 'confidence']) if (!edited.includes(key)) patch[key] = ex[key];
  const intent = patch.intent ?? item.intent;
  if (!edited.includes('why_saved')) patch.why_saved = whyFor(intent);
  // A user-confirmed type or intent is as certain as it gets.
  if (edited.includes('type') || edited.includes('intent')) patch.confidence = 1;
  return patch;
}

// Validates a user edit. Returns a patch, or throws an error with status 400.
export function validateEdit(body) {
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
  if (!body || typeof body !== 'object') throw bad('Invalid body');
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (!EDITABLE.includes(key)) throw bad(`Cannot edit "${key}"`);
    if (key === 'type' && !TYPES.includes(value)) throw bad('Invalid type');
    if (key === 'intent' && !INTENTS.includes(value)) throw bad('Invalid intent');
    if (key === 'useful_details') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw bad('useful_details must be a list of strings');
      patch[key] = value.map((v) => v.trim()).filter(Boolean).slice(0, 20);
    } else {
      if (typeof value !== 'string') throw bad(`${key} must be a string`);
      patch[key] = value.trim().slice(0, 200);
    }
  }
  return patch;
}
