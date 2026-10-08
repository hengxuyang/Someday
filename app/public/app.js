const $ = (id) => document.getElementById(id);
let items = [];
let current = null;

async function load() {
  items = await (await fetch('/api/items')).json();
  render();
}

function render() {
  $('empty').hidden = items.length > 0;
  $('grid').replaceChildren(...items.map((item) => {
    const btn = document.createElement('button');
    const img = document.createElement('img');
    img.src = `/${item.image_path}`;
    img.alt = item.original_filename;
    img.loading = 'lazy';
    btn.append(img);
    btn.addEventListener('click', () => openDetail(item));
    return btn;
  }));
}

function openDetail(item) {
  current = item;
  $('detail-img').src = `/${item.image_path}`;
  $('detail-meta').textContent = `${item.original_filename} · added ${new Date(item.created_at).toLocaleDateString()}`;
  $('detail').showModal();
}

$('delete').addEventListener('click', async () => {
  if (!current || !confirm('Delete this from Someday? Your original is not affected.')) return;
  await fetch(`/api/items/${current.id}`, { method: 'DELETE' });
  $('detail').close();
  await load();
});

async function upload(files) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  let added = 0, dupes = 0, failed = 0;
  for (const [i, file] of images.entries()) {
    $('status').textContent = `Importing ${i + 1} / ${images.length}…`;
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'X-Filename': encodeURIComponent(file.name) },
        body: file,
      });
      if (!res.ok) throw new Error(res.statusText);
      (await res.json()).duplicate ? dupes++ : added++;
    } catch { failed++; }
  }
  const parts = [`✓ ${added} added`];
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
