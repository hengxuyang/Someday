// Case-insensitive search: every word in the query must appear somewhere in the item.
// Phase 3 will add name/location/type/details to the searchable fields.
const FIELDS = ['original_filename', 'extracted_text'];

export function search(items, query) {
  const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((item) => {
    const haystack = FIELDS.map((f) => item[f] || '').join('\n').toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}
