import { describe, expect, it, vi } from 'vitest';

import { createDefaultSettings } from './seed';
import { detectBrowserLocale, normalizeAppLocale, settingsLocaleToAppLocale, toStoredLocale } from '../i18n/locale';

describe('settings locale defaults', () => {
  it('maps browser locales to the supported app and stored locales', () => {
    expect(normalizeAppLocale('vi-VN')).toBe('vi');
    expect(normalizeAppLocale('en-GB')).toBe('en-US');
    expect(toStoredLocale('en-US')).toBe('en');
    expect(settingsLocaleToAppLocale('en')).toBe('en-US');
  });

  it('defaults settings to the browser locale when no saved settings exist', () => {
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(createDefaultSettings('2026-07-23T00:00:00.000Z').locale).toBe('en');
    expect(detectBrowserLocale()).toBe('en-US');
  });
});
