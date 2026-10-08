const $ = (id) => document.getElementById(id);

// [icon, label, noun used in counts: "32 places", "1 thing"]
const INTENTS = {
  eat: ['🍜', 'Eat', 'place'], visit: ['📍', 'Visit', 'place'], buy: ['🛒', 'Buy', 'thing'],
  experience: ['🎟', 'Experience', 'thing'], learn: ['📚', 'Learn', 'thing'],
  reference: ['📌', 'Reference', 'thing'], other: ['💡', 'Other', 'thing'],
};
const TYPES = ['food', 'place', 'product', 'event', 'info', 'other'];
const STATUS_LABELS = { new: 'New', keep: 'Keep', maybe: 'Maybe', done: 'Done' };

let current = null;
let intent = '';
let view = 'home';
let reviewQueue = [];
let reviewIndex = 0;
let shownPicks = [];

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c != null));
  return node;
}
const button = (label, onClick, props = {}) => el('button', { type: 'button', textContent: label, onclick: onClick, ...props });
const iconOf = (item) => (INTENTS[item.intent] || INTENTS.other)[0];
const titleOf = (item) => `${iconOf(item)} ${item.name || item.original_filename}`;
const thumb = (item, props = {}) => el('img', { src: `/${item.image_path}`, alt: item.name || item.original_filename, loading: 'lazy', ...props });

// ---------- routing ----------

function route() {
  const name = location.hash.replace(/^#\//, '');
  view = ['library', 'review'].includes(name) ? name : 'home';
  for (const section of document.querySelectorAll('main > section')) section.hidden = section.dataset.view !== view;
  for (const a of document.querySelectorAll('#nav a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  refresh();
}
addEventListener('hashchange', route);
function go(name, filter = '') {
  intent = filter;
  const target = name === 'home' ? '#/' : `#/${name}`;
  // Setting an unchanged hash fires no event, so re-render ourselves in that case.
  if (location.hash === target || (name === 'home' && !location.hash)) route();
  else location.hash = target;
}

async function refresh() {
  if (view === 'home') await renderHome();
  else if (view === 'library') await renderLibrary();
  else await startReview();
}

// ---------- home ----------

async function renderHome() {
  const all = await api('/api/items');
  const active = all.filter((i) => i.status !== 'done');
  $('home-empty').hidden = all.length > 0;
  $('review-cta').hidden = !active.some((i) => !i.status || i.status === 'new');

  const counts = {};
  for (const i of active) counts[i.intent || 'other'] = (counts[i.intent || 'other'] || 0) + 1;
  $('tiles').replaceChildren(...Object.entries(INTENTS).filter(([k]) => counts[k]).map(([k, [icon, name, noun]]) =>
    el('button', { type: 'button', onclick: () => go('library', k) },
      el('span', { className: 'icon', textContent: icon }),
      el('b', { textContent: name }),
      el('span', { textContent: `${counts[k]} ${noun}${counts[k] === 1 ? '' : 's'}` }))));

  $('recent').hidden = active.length === 0;
  $('recent-row').replaceChildren(...active.slice(0, 8).map((i) => el('button', { type: 'button', title: i.name || '', onclick: () => openDetail(i) }, thumb(i))));

  $('discover').hidden = active.length === 0;
  if (active.length) await loadPicks(true);
}

async function loadPicks(fresh) {
  const exclude = fresh ? '' : shownPicks.map((i) => i.id).join(',');
  let picks = await api(`/api/discover?n=3&exclude=${exclude}`);
  if (!picks.length) picks = await api('/api/discover?n=3'); // fewer than 3 things in total: show them again
  shownPicks = picks;
  $('picks').replaceChildren(...picks.map(pickCard));
  $('more').hidden = !picks.length;
}

function pickCard(item) {
  const card = el('div', { className: 'pick' }, thumb(item),
    el('div', {},
      el('b', { textContent: titleOf(item) }),
      item.location && el('p', { textContent: item.location }),
      el('p', { textContent: item.why_saved || '' }),
      el('div', { className: 'row' },
        button('View', () => { post(`/api/items/${item.id}/review`, { action: 'viewed' }); openDetail(item); }),
        button('Maybe later', async () => { await post(`/api/items/${item.id}/review`, { action: 'later' }); card.remove(); }))));
  return card;
}
$('more').addEventListener('click', () => loadPicks(false));
$('start-review').addEventListener('click', () => go('review'));

// ---------- library ----------

async function renderLibrary() {
  const q = $('q').value.trim();
  const params = new URLSearchParams({ q });
  if (intent) params.set('intent', intent);
  const [items, all] = await Promise.all([api(`/api/items?${params}`), api(`/api/items?q=${encodeURIComponent(q)}`)]);

  const counts = {};
  for (const i of all) counts[i.intent || 'other'] = (counts[i.intent || 'other'] || 0) + 1;
  const chip = (key, label, n) => {
    const b = button(label, () => { intent = key; renderLibrary(); });
    b.setAttribute('aria-pressed', String(intent === key));
    if (n) b.append(el('small', { textContent: n }));
    return b;
  };
  $('chips').replaceChildren(chip('', 'All', all.length),
    ...Object.entries(INTENTS).filter(([k]) => counts[k] || intent === k).map(([k, [icon, name]]) => chip(k, `${icon} ${name}`, counts[k])));

  $('empty').hidden = items.length > 0;
  $('empty').textContent = q || intent ? 'Nothing matches.' : 'Nothing here yet. Drop some screenshots anywhere to begin.';
  $('grid').replaceChildren(...items.map((item) => {
    const card = el('button', { className: `card${item.status === 'done' ? ' done' : ''}`, onclick: () => openDetail(item) },
      thumb(item),
      item.status === 'done' && el('span', { className: 'badge', textContent: '✓ Done' }),
      el('div', { className: 'cap' }, el('b', { textContent: titleOf(item) }), el('span', { textContent: item.location || item.why_saved || '' })));
    return card;
  }));
}

let timer;
$('q').addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => (view === 'library' ? renderLibrary() : go('library')), 200);
});

// ---------- review ----------

async function startReview() {
  reviewQueue = await api('/api/review/queue?limit=5');
  reviewIndex = 0;
  renderReview();
}

function renderReview() {
  const card = $('review-card');
  const item = reviewQueue[reviewIndex];
  if (!item) {
    card.replaceChildren(el('h3', { textContent: reviewQueue.length ? 'That’s enough for now.' : 'Nothing needs a look right now.' }),
      el('p', { textContent: 'Everything else can wait. Come back whenever you like.' }),
      el('div', { className: 'row' }, button('Back home', () => go('home'))));
    return;
  }
  const act = async (action) => { await post(`/api/items/${item.id}/review`, { action }); reviewIndex++; renderReview(); };
  card.replaceChildren(
    thumb(item),
    el('h3', { textContent: titleOf(item) }),
    item.location && el('p', { textContent: item.location }),
    el('p', { textContent: item.why_saved || '' }),
    ...(item.useful_details || []).slice(0, 3).map((d) => el('p', { textContent: d })),
    el('div', { className: 'row' }, button('Keep', () => act('keep')), button('Maybe', () => act('maybe')), button('Done', () => act('done'))),
    el('p', { className: 'hint', textContent: 'Keys: K keep · M maybe · D done' }),
    el('div', { className: 'row' }, button('Edit details', () => openDetail(item)), button('Stop for now', () => go('home'), { className: 'stop' })));
}

addEventListener('keydown', (e) => {
  if (view !== 'review' || $('detail').open || e.metaKey || e.ctrlKey || e.target.matches('input, textarea, select')) return;
  const action = { k: 'keep', m: 'maybe', d: 'done' }[e.key.toLowerCase()];
  const item = reviewQueue[reviewIndex];
  if (action && item) post(`/api/items/${item.id}/review`, { action }).then(() => { reviewIndex++; renderReview(); });
});

// ---------- detail ----------

const form = $('edit');
form.type.replaceChildren(...TYPES.map((t) => new Option(t, t)));
form.intent.replaceChildren(...Object.entries(INTENTS).map(([k, [icon, name]]) => new Option(`${icon} ${name}`, k)));

function fillForm(item) {
  form.name.value = item.name || '';
  form.location.value = item.location || '';
  form.type.value = item.type || 'other';
  form.intent.value = item.intent || 'other';
  form.why_saved.value = item.why_saved || '';
  form.useful_details.value = (item.useful_details || []).join('\n');
  const c = $('confidence');
  const unsure = item.type && item.confidence < 0.5;
  c.className = unsure ? 'unsure' : '';
  c.textContent = !item.type ? 'Not analysed yet.'
    : unsure ? 'Not sure about this one. Worth a quick check.'
    : item.confidence === 1 ? 'Confirmed by you.' : 'Filled in automatically.';
}

function fillStatus(item) {
  const status = item.status || 'new';
  $('detail-status').replaceChildren(...['keep', 'maybe', 'done'].map((s) => {
    const b = button(STATUS_LABELS[s], async () => setCurrent((await post(`/api/items/${item.id}/review`, { action: status === s ? 'reset' : s })).item));
    b.setAttribute('aria-pressed', String(status === s));
    return b;
  }));
}

function openDetail(item) {
  current = item;
  $('detail-img').src = `/${item.image_path}`;
  $('detail-meta').textContent = `${item.original_filename} · added ${new Date(item.created_at).toLocaleDateString()}`;
  fillForm(item);
  fillStatus(item);
  showText(item);
  $('detail').showModal();
}

const ENGINES = { vision: 'Apple Vision', tesseract: 'Tesseract' };

function showText(item) {
  $('detail-engine').textContent = item.ocr_status === 'done' ? `· read with ${ENGINES[item.ocr_engine] || item.ocr_engine || 'unknown engine'}` : '';
  $('detail-text').textContent =
    item.ocr_status === 'failed' ? `OCR failed: ${item.ocr_error}`
    : item.ocr_status === 'done' ? (item.extracted_text || '(no text found)')
    : 'Not scanned yet.';
}

function setCurrent(item) {
  current = item;
  fillForm(item);
  fillStatus(item);
  showText(item);
  return refresh();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: form.name.value, location: form.location.value, type: form.type.value, intent: form.intent.value,
    why_saved: form.why_saved.value, useful_details: form.useful_details.value.split('\n'),
  };
  // Only send what changed, so untouched fields stay automatic.
  const changed = Object.fromEntries(Object.entries(body).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(current[k] ?? (k === 'useful_details' ? [] : ''))));
  if (!Object.keys(changed).length) return;
  await setCurrent((await api(`/api/items/${current.id}`, { method: 'PATCH', body: JSON.stringify(changed) })).item);
});

$('reprocess').addEventListener('click', async () => {
  await setCurrent((await post(`/api/items/${current.id}/reprocess`, {})).item);
});

$('reocr').addEventListener('click', async () => {
  $('detail-text').textContent = 'Scanning…';
  await setCurrent((await post(`/api/items/${current.id}/ocr`, {})).item);
});

$('delete').addEventListener('click', async () => {
  if (!current || !confirm('Delete this from Someday? Your original is not affected.')) return;
  await api(`/api/items/${current.id}`, { method: 'DELETE' });
  $('detail').close();
  await refresh();
});

// ---------- import ----------

async function upload(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  let added = 0, dupes = 0, failed = 0, noOcr = 0;
  for (const [i, file] of images.entries()) {
    $('status').textContent = `Importing and reading ${i + 1} / ${images.length}…`;
    try {
      const { item, duplicate } = await api('/api/items', {
        method: 'POST',
        headers: { 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      if (duplicate) dupes++;
      else { added++; if (item.ocr_status === 'failed') noOcr++; }
    } catch { failed++; }
  }
  const parts = [`✓ ${added} added`];
  if (noOcr) parts.push(`${noOcr} could not be read (OCR unavailable)`);
  if (dupes) parts.push(`${dupes} already in Someday`);
  if (failed) parts.push(`${failed} failed`);
  $('status').textContent = images.length ? parts.join(' · ') : '';
  await refresh();
}

$('add').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { upload(e.target.files); e.target.value = ''; });

let depth = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); depth++; $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('drop').hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); depth = 0; $('drop').hidden = true; upload(e.dataTransfer.files); });

route();
