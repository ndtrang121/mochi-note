import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';

import type { AppLocale, MessageKey } from './messages';
import { detectBrowserLocale } from './locale';
import { formatDate, formatDateTime, localeCompare, translate } from './translate';

interface I18nValue {
  compare: (first: string, second: string) => number;
  date: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  dateTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  locale: AppLocale;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, locale }: { children: ReactNode; locale?: AppLocale }) {
  const resolvedLocale = locale ?? detectBrowserLocale();

  useEffect(() => {
    document.documentElement.lang = resolvedLocale;
  }, [resolvedLocale]);

  const value = useMemo<I18nValue>(() => ({
    compare: (first, second) => localeCompare(resolvedLocale, first, second),
    date: (input, options) => formatDate(resolvedLocale, input, options),
    dateTime: (input, options) => formatDateTime(resolvedLocale, input, options),
    locale: resolvedLocale,
    t: (key, params) => translate(resolvedLocale, key, params),
  }), [resolvedLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used inside I18nProvider.');
  }
  return value;
}

