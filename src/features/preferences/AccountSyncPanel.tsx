import {
  Cloud,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  UserRoundPlus,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import type { SyncStatus } from '../../supabase/types';
import { formatDateTime } from '../../i18n/translate';

const STATUS_KEYS: Record<SyncStatus, 'syncStatus.error' | 'syncStatus.idle' | 'syncStatus.offline' | 'syncStatus.pending' | 'syncStatus.syncing'> = {
  error: 'syncStatus.error',
  idle: 'syncStatus.idle',
  offline: 'syncStatus.offline',
  pending: 'syncStatus.pending',
  syncing: 'syncStatus.syncing',
};

export function AccountSyncPanel() {
  const { t, locale } = useI18n();
  const { auth, authControls, sync, syncNow } = useMochiData();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('account.actionError'));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => authControls.signIn(email.trim(), password));
  }

  const isInitializing = auth.status === 'initializing';
  const isSyncing = sync.status === 'syncing';

  return (
    <fieldset className="preferences-section account-sync-section">
      <legend><Cloud aria-hidden="true" size={15} /> {t('account.legend')}</legend>
      {auth.status === 'signed-in' ? (
        <>
          <div className="account-sync__profile">
            <span className="account-sync__avatar">
              <img alt="" src="/brand/mochi-mascot.png" />
            </span>
            <div>
              <strong>{auth.user?.email ?? t('account.defaultName')}</strong>
              <span className="account-sync__status" data-status={sync.status}>
                <i aria-hidden="true" />
                {t(STATUS_KEYS[sync.status])}
              </span>
            </div>
          </div>
          <div className="account-sync__metrics">
            <div>
              <span>{t('account.pendingChanges')}</span>
              <strong>{sync.pendingCount}</strong>
            </div>
            <div>
              <span>{t('account.lastSynced')}</span>
              <strong>{sync.lastSyncedAt ? formatDateTime(locale, sync.lastSyncedAt) : t('account.neverSynced')}</strong>
            </div>
          </div>
          <p className="account-sync__hint">
            {t('account.syncHint')}
          </p>
          <div className="account-sync__actions">
            <Button
              disabled={busy || isSyncing}
              onClick={() => void run(syncNow)}
              size="small"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" className={isSyncing ? 'is-spinning' : undefined} size={14} />
              {isSyncing ? t('account.syncing') : t('account.syncNow')}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void run(authControls.signOut)}
              size="small"
              variant="ghost"
            >
              <LogOut aria-hidden="true" size={14} /> {t('account.signOut')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="account-sync__welcome">
            <span className="account-sync__avatar account-sync__avatar--large">
              <img alt="" src="/brand/mochi-mascot.png" />
            </span>
            <div>
              <strong>{t('account.welcomeTitle')}</strong>
              <p>{t('account.welcomeDescription')}</p>
            </div>
          </div>
          <form className="account-sync__form" onSubmit={submit}>
            <label>
              <span>Email</span>
              <span className="account-sync__input">
                <Mail aria-hidden="true" size={15} />
                <input
                  autoComplete="email"
                  disabled={busy || isInitializing}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ban@example.com"
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            <label>
              <span>{t('account.password')}</span>
              <span className="account-sync__input">
                <ShieldCheck aria-hidden="true" size={15} />
                <input
                  autoComplete="current-password"
                  disabled={busy || isInitializing}
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={t('account.passwordPlaceholder')}
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>
            <Button disabled={busy || isInitializing} type="submit">
              {busy ? t('account.signingIn') : t('account.signIn')}
            </Button>
            <Button
              disabled={busy || isInitializing || !email.trim() || password.length < 6}
              onClick={() => void run(() => authControls.signUp(email.trim(), password))}
              type="button"
              variant="secondary"
            >
              <UserRoundPlus aria-hidden="true" size={15} /> {t('account.signUp')}
            </Button>
          </form>
          <p className="account-sync__hint">
            {t('account.guestMergeHint')}
          </p>
        </>
      )}
      {error || auth.error ? (
        <p className="data-portability-message data-portability-message--error" role="alert">
          {error ?? auth.error}
        </p>
      ) : null}
    </fieldset>
  );
}
