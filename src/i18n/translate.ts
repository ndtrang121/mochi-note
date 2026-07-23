import { messages, type AppLocale, type MessageKey } from './messages';

type Params = Record<string, string | number>;

export function translate(locale: AppLocale, key: MessageKey, params?: Params) {
  const template = messages[locale][key] ?? messages.vi[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function formatDateTime(locale: AppLocale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function formatDate(locale: AppLocale, value: string | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options ?? { dateStyle: 'medium' }).format(new Date(value));
}

export function localeCompare(locale: AppLocale, first: string, second: string) {
  return first.localeCompare(second, locale);
}

