import { describe, expect, it } from 'vitest';

import { nextTaskDate, repeatLabel } from './taskRecurrence';

describe('task recurrence', () => {
  it('advances daily, weekly and monthly dates', () => {
    expect(nextTaskDate('2026-07-20', 'FREQ=DAILY')).toBe('2026-07-21');
    expect(nextTaskDate('2026-07-20', 'FREQ=WEEKLY')).toBe('2026-07-27');
    expect(nextTaskDate('2026-01-31', 'FREQ=MONTHLY')).toBe('2026-02-28');
  });

  it('maps recurrence rules to localized labels', () => {
    expect(repeatLabel('FREQ=DAILY')).toBe('Hàng ngày');
    expect(repeatLabel(null)).toBeNull();
  });

  it('rejects malformed dates', () => {
    expect(nextTaskDate('invalid', 'FREQ=DAILY')).toBeNull();
  });
});
