import { describe, expect, it } from 'vitest';

import { MAX_NOTE_TAGS, normalizeNoteTags, noteTagMatches } from './noteTags';

describe('note tags', () => {
  it('normalizes whitespace, hash prefixes, duplicates, and limits', () => {
    const tags = normalizeNoteTags([
      '  #Công việc  ',
      'công   việc',
      'Kế hoạch',
      ...Array.from({ length: 12 }, (_value, index) => `tag ${index}`),
    ]);

    expect(tags.slice(0, 2)).toEqual(['Công việc', 'Kế hoạch']);
    expect(tags).toHaveLength(MAX_NOTE_TAGS);
  });

  it('matches tags without accents or casing differences', () => {
    expect(noteTagMatches('Khách hàng', 'khach hang')).toBe(true);
    expect(noteTagMatches('Cá nhân', 'công việc')).toBe(false);
  });
});
