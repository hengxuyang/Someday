// Case-insensitive search: every word in the query must appear somewhere in the item.
const FIELDS = ['original_filename', 'extracted_text', 'name', 'location', 'type', 'intent', 'why_saved'];

export function search(items, query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const haystack = FIELDS.map((f) => item[f] || '').concat(item.useful_details || []).join('\n').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
