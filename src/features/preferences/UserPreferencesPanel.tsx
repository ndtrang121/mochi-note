import {
  ArchiveRestore,
  Languages,
  LayoutGrid,
  List,
  Moon,
  RotateCcw,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import type { Settings } from '../../db/models';
import { settingsLocaleToAppLocale, toStoredLocale } from '../../i18n/locale';
import { useI18n } from '../../i18n/I18nProvider';
import { DataPortabilityPanel } from '../data-portability/DataPortabilityPanel';
import { DataOverviewPanel } from '../storage/StorageUsagePanel';
import { AccountSyncPanel } from './AccountSyncPanel';

interface UserPreferencesPanelProps {
  onClose: () => void;
}

type PreferenceKey = 'layout' | 'locale' | 'theme';

export function UserPreferencesPanel({ onClose }: UserPreferencesPanelProps) {
  const { t } = useI18n();
  const { resetSettings, settings, updateSettings } = useMochiData();
  const [portabilityOpen, setPortabilityOpen] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [saving, setSaving] = useState<PreferenceKey | 'reset' | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const locale = settingsLocaleToAppLocale(settings?.locale);

  async function changeSetting(changes: Partial<Settings>, key: PreferenceKey) {
    setSaving(key);
    setStatus(null);
    setError(null);
    try {
      await updateSettings(changes);
      setStatus(t('preferences.saved'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('preferences.saveError'));
    } finally {
      setSaving(null);
    }
  }

  async function resetPreferences() {
    setSaving('reset');
    setStatus(null);
    setError(null);
    try {
      await resetSettings();
      setResetPending(false);
      setStatus(t('preferences.resetDone'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('preferences.resetError'));
    } finally {
      setSaving(null);
    }
  }

  if (portabilityOpen) {
    return <DataPortabilityPanel onClose={() => setPortabilityOpen(false)} />;
  }

  return (
    <div
      className="data-portability-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="preferences-heading"
        aria-modal="true"
        className="data-portability-panel preferences-panel"
        role="dialog"
      >
        <header className="data-portability-panel__header">
          <span><Settings2 aria-hidden="true" size={19} /></span>
          <div>
            <h2 id="preferences-heading">{t('preferences.heading')}</h2>
            <p>{t('preferences.description')}</p>
          </div>
          <IconButton aria-label={t('app.closeSettings')} onClick={onClose}>
            <X aria-hidden="true" size={18} />
          </IconButton>
        </header>

        <fieldset className="preferences-section">
          <legend><Sun aria-hidden="true" size={15} /> {t('preferences.theme')}</legend>
          <div className="preferences-choice-grid">
            {[
              { icon: Sun, label: t('preferences.themeLight'), value: 'light' as const },
              { icon: Moon, label: t('preferences.themeDark'), value: 'dark' as const },
              { icon: Settings2, label: t('preferences.themeSystem'), value: 'system' as const },
            ].map(({ icon: Icon, label, value }) => (
              <button
                aria-pressed={settings?.theme === value}
                className="preferences-choice"
                disabled={saving !== null}
                key={value}
                onClick={() => void changeSetting({ theme: value }, 'theme')}
                type="button"
              >
                <Icon aria-hidden="true" size={17} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="preferences-section">
          <legend><LayoutGrid aria-hidden="true" size={15} /> {t('preferences.layout')}</legend>
          <div className="preferences-choice-grid preferences-choice-grid--two">
            <button
              aria-pressed={settings?.layout === 'grid'}
              className="preferences-choice"
              disabled={saving !== null}
              onClick={() => void changeSetting({ layout: 'grid' }, 'layout')}
              type="button"
            >
              <LayoutGrid aria-hidden="true" size={17} /><span>{t('preferences.layoutGrid')}</span>
            </button>
            <button
              aria-pressed={settings?.layout === 'list'}
              className="preferences-choice"
              disabled={saving !== null}
              onClick={() => void changeSetting({ layout: 'list' }, 'layout')}
              type="button"
            >
              <List aria-hidden="true" size={17} /><span>{t('preferences.layoutList')}</span>
            </button>
          </div>
        </fieldset>

        <fieldset className="preferences-section">
          <legend><Languages aria-hidden="true" size={15} /> {t('preferences.language')}</legend>
          <label className="preferences-select">
            <span>{t('preferences.displayLanguage')}</span>
            <select
              aria-label={t('preferences.displayLanguage')}
              disabled={saving !== null}
              onChange={(event) => void changeSetting({ locale: event.target.value === 'vi' ? 'vi' : 'en' }, 'locale')}
              value={settings?.locale ?? toStoredLocale(locale)}
            >
              <option value="vi">{t('preferences.vietnamese')}</option>
              <option value="en">{t('preferences.english')}</option>
            </select>
          </label>
        </fieldset>

        <AccountSyncPanel />
        <DataOverviewPanel />

        <div className="preferences-actions">
          <Button onClick={() => setPortabilityOpen(true)} variant="secondary">
            <ArchiveRestore aria-hidden="true" size={16} /> {t('preferences.backupRestore')}
          </Button>
          {resetPending ? (
            <div className="preferences-reset-confirm">
              <span>{t('preferences.resetQuestion')}</span>
              <Button disabled={saving !== null} onClick={() => void resetPreferences()} size="small" variant="danger">{t('app.confirm')}</Button>
              <Button onClick={() => setResetPending(false)} size="small" variant="ghost">{t('app.cancel')}</Button>
            </div>
          ) : (
            <Button disabled={saving !== null} onClick={() => setResetPending(true)} size="small" variant="ghost">
              <RotateCcw aria-hidden="true" size={14} /> {t('preferences.reset')}
            </Button>
          )}
        </div>

        {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
        {status ? <p className="data-portability-message" role="status">{status}</p> : null}
      </section>
    </div>
  );
}
