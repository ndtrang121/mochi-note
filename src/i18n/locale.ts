import type { Settings } from '../db/models';
import type { AppLocale } from './messages';

export type StoredLocale = Settings['locale'];

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  return value?.toLowerCase().startsWith('vi') ? 'vi' : 'en-US';
}

export function toStoredLocale(locale: AppLocale): StoredLocale {
  return locale === 'vi' ? 'vi' : 'en';
}

export function detectBrowserLocale(): AppLocale {
  const browserLanguage = typeof browser !== 'undefined' && browser.i18n?.getUILanguage
    ? browser.i18n.getUILanguage()
    : undefined;
  const language = browserLanguage
    ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
  return normalizeAppLocale(language);
}

export function detectStoredLocale(): StoredLocale {
  return toStoredLocale(detectBrowserLocale());
}

export function settingsLocaleToAppLocale(locale: StoredLocale | null | undefined): AppLocale {
  return normalizeAppLocale(locale);
}

