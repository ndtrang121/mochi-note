export const MAX_NOTE_TAGS = 8;
export const MAX_NOTE_TAG_LENGTH = 24;

function tagKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi');
}

export function normalizeNoteTag(value: string) {
  return value
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_NOTE_TAG_LENGTH)
    .trim();
}

export function normalizeNoteTags(values: readonly string[]) {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normalizeNoteTag(value);
    const key = tagKey(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_NOTE_TAGS) break;
  }
  return tags;
}

export function noteTagMatches(tag: string, query: string) {
  return tagKey(tag) === tagKey(query);
}
