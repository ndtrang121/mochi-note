import { describe, expect, it } from 'vitest';

import { noteMatchesDateFilter } from './noteDateFilter';

describe('note creation date filters', () => {
  const now = new Date('2026-07-22T15:00:00+07:00');

  it('matches today, current week and current month in local time', () => {
    expect(noteMatchesDateFilter('2026-07-22T08:00:00+07:00', 'today', now)).toBe(true);
    expect(noteMatchesDateFilter('2026-07-20T08:00:00+07:00', 'week', now)).toBe(true);
    expect(noteMatchesDateFilter('2026-07-01T08:00:00+07:00', 'month', now)).toBe(true);
    expect(noteMatchesDateFilter('2026-06-30T23:59:00+07:00', 'month', now)).toBe(false);
  });

  it('returns all for the default filter and rejects malformed dates', () => {
    expect(noteMatchesDateFilter('not-a-date', 'all', now)).toBe(true);
    expect(noteMatchesDateFilter('not-a-date', 'today', now)).toBe(false);
  });
});
