import { describe, expect, it } from 'vitest';

import { messages } from './messages';
import { translate } from './translate';

describe('runtime localization catalogs', () => {
  it('keep the Vietnamese and English message key sets in sync', () => {
    expect(Object.keys(messages.vi).sort()).toEqual(Object.keys(messages['en-US']).sort());
  });

  it('interpolates translated values', () => {
    expect(translate('en-US', 'backup.files')).toBe('Files');
    expect(translate('vi', 'tasks.countJobs', { count: 3 })).toBe('3 việc');
    expect(translate('en-US', 'tasks.countJobs', { count: 3 })).toBe('3 tasks');
  });
});
