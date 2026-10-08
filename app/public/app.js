const $ = (id) => document.getElementById(id);

const INTENTS = {
  eat: ['🍜', 'Eat'], visit: ['📍', 'Visit'], buy: ['🛒', 'Buy'], experience: ['🎟', 'Experience'],
  learn: ['📚', 'Learn'], reference: ['📌', 'Reference'], other: ['💡', 'Other'],
};
const TYPES = ['food', 'place', 'product', 'event', 'info', 'other'];

let items = [];
let current = null;
let intent = '';

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function load() {
  const params = new URLSearchParams({ q: $('q').value.trim() });
  if (intent) params.set('intent', intent);
  items = await api(`/api/items?${params}`);
  render(params.get('q'));
  renderChips();
}

// Chip counts come from an unfiltered-by-intent fetch so they don't collapse when one is selected.
async function renderChips() {
  const all = await api(`/api/items?q=${encodeURIComponent($('q').value.trim())}`);
  const counts = {};
  for (const i of all) counts[i.intent || 'other'] = (counts[i.intent || 'other'] || 0) + 1;
  const chip = (key, label, n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(intent === key));
    b.append(label);
    if (n) { const s = document.createElement('small'); s.textContent = n; b.append(s); }
    b.addEventListener('click', () => { intent = key; load(); });
    return b;
  };
  $('chips').replaceChildren(
    chip('', 'All', all.length),
    ...Object.entries(INTENTS).filter(([k]) => counts[k] || intent === k).map(([k, [icon, name]]) => chip(k, `${icon} ${name}`, counts[k])),
  );
}

let timer;
$('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 200); });

function render(q = '') {
  $('empty').hidden = items.length > 0;
  $('empty').textContent = q || intent ? 'Nothing matches.' : 'Nothing here yet. Drop some screenshots anywhere to begin.';
  $('grid').replaceChildren(...items.map((item) => {
    const btn = document.createElement('button');
    btn.className = 'card';
    const img = document.createElement('img');
    img.src = `/${item.image_path}`;
    img.alt = item.name || item.original_filename;
    img.loading = 'lazy';
    const cap = document.createElement('div');
    cap.className = 'cap';
    const title = document.createElement('b');
    title.textContent = `${(INTENTS[item.intent] || [''])[0]} ${item.name || item.original_filename}`.trim();
    const sub = document.createElement('span');
    sub.textContent = item.location || item.why_saved || '';
    cap.append(title, sub);
    btn.append(img, cap);
    btn.addEventListener('click', () => openDetail(item));
    return btn;
  }));
}

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

function openDetail(item) {
  current = item;
  $('detail-img').src = `/${item.image_path}`;
  $('detail-meta').textContent = `${item.original_filename} · added ${new Date(item.created_at).toLocaleDateString()}`;
  fillForm(item);
  showText(item);
  $('detail').showModal();
}

function showText(item) {
  $('detail-text').textContent =
    item.ocr_status === 'failed' ? `OCR failed: ${item.ocr_error}`
    : item.ocr_status === 'done' ? (item.extracted_text || '(no text found)')
    : 'Not scanned yet.';
}

function setCurrent(item) {
  current = item;
  fillForm(item);
  showText(item);
  return load();
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
  await setCurrent((await api(`/api/items/${current.id}/reprocess`, { method: 'POST' })).item);
});

$('reocr').addEventListener('click', async () => {
  $('detail-text').textContent = 'Scanning…';
  await setCurrent((await api(`/api/items/${current.id}/ocr`, { method: 'POST' })).item);
});

$('delete').addEventListener('click', async () => {
  if (!current || !confirm('Delete this from Someday? Your original is not affected.')) return;
  await api(`/api/items/${current.id}`, { method: 'DELETE' });
  $('detail').close();
  await load();
});

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
  await load();
}

$('add').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', (e) => { upload(e.target.files); e.target.value = ''; });

let depth = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); depth++; $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('drop').hidden = true; } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', (e) => { e.preventDefault(); depth = 0; $('drop').hidden = true; upload(e.dataTransfer.files); });

load();
