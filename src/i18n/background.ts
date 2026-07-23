import type { MochiRepositories } from '../db/repositories';
import { detectBrowserLocale, settingsLocaleToAppLocale } from './locale';
import { translate } from './translate';
import type { AppLocale, MessageKey } from './messages';

export interface LocaleChangedMessage {
  locale: AppLocale;
  type: 'i18n:locale-changed';
  version: 1;
}

export function createLocaleChangedMessage(locale: AppLocale): LocaleChangedMessage {
  return { locale, type: 'i18n:locale-changed', version: 1 };
}

export function isLocaleChangedMessage(message: unknown): message is LocaleChangedMessage {
  const candidate = message as Partial<LocaleChangedMessage>;
  return Boolean(candidate) && candidate.type === 'i18n:locale-changed' && candidate.version === 1;
}

export async function readRepositoryLocale(repositories: Pick<MochiRepositories, 'settings'>): Promise<AppLocale> {
  const settings = await repositories.settings.get();
  return settings ? settingsLocaleToAppLocale(settings.locale) : detectBrowserLocale();
}

export function tBackground(locale: AppLocale, key: MessageKey, params?: Record<string, string | number>) {
  return translate(locale, key, params);
}

