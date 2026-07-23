import {
  Cloud,
  KeyRound,
  LogOut,
  Mail,
  RefreshCw,
  Rocket,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../i18n/I18nProvider';
import type { SyncStatus } from '../../supabase/types';
import { formatDateTime } from '../../i18n/translate';

const STATUS_KEYS: Record<SyncStatus, 'syncStatus.blockedQuota' | 'syncStatus.error' | 'syncStatus.idle' | 'syncStatus.offline' | 'syncStatus.pending' | 'syncStatus.syncing'> = {
  blocked_quota: 'syncStatus.blockedQuota',
  error: 'syncStatus.error',
  idle: 'syncStatus.idle',
  offline: 'syncStatus.offline',
  pending: 'syncStatus.pending',
  syncing: 'syncStatus.syncing',
};

function formatMegabytes(bytes: number) {
  return `${(bytes / 1_048_576).toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: bytes > 0 && bytes < 1_048_576 ? 1 : 0 })} MB`;
}

export function AccountSyncPanel() {
  const { t, locale } = useI18n();
  const { auth, authControls, sync, syncNow } = useMochiData();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('account.actionError'));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (otpRequested) {
      void run(() => authControls.verifyEmailOtp(email.trim(), otp));
      return;
    }
    void run(async () => {
      await authControls.requestEmailOtp(email.trim(), locale === 'vi' ? 'vi' : 'en');
      setOtpRequested(true);
    });
  }

  const isInitializing = auth.status === 'initializing';
  const isSyncing = sync.status === 'syncing';
  const cloudStorage = sync.cloudStorage;
  const storagePercent = cloudStorage?.limitBytes
    ? Math.min(100, Math.round((cloudStorage.usedBytes / cloudStorage.limitBytes) * 100))
    : 0;
  const storageTone = cloudStorage?.status === 'full' || cloudStorage?.status === 'over_limit'
    ? 'full'
    : cloudStorage?.status === 'warning' ? 'warning' : 'ok';

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
          {cloudStorage ? (
            <section className="cloud-storage" aria-label={t('storage.label')} data-tone={storageTone}>
              <div className="cloud-storage__header">
                <div>
                  <span>{t('storage.label')}</span>
                  <strong>
                    {cloudStorage.limitBytes
                      ? t('storage.usedOfLimit', {
                          limit: formatMegabytes(cloudStorage.limitBytes),
                          used: formatMegabytes(cloudStorage.usedBytes),
                        })
                      : t('storage.usedUnlimited', { used: formatMegabytes(cloudStorage.usedBytes) })}
                  </strong>
                </div>
                <Button onClick={() => setUpgradeOpen(true)} size="small" type="button" variant="secondary">
                  <Rocket aria-hidden="true" size={14} />
                  {t('storage.upgrade')}
                </Button>
              </div>
              {cloudStorage.limitBytes ? (
                <div
                  aria-label={t('storage.progressLabel', { percent: storagePercent })}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={storagePercent}
                  className="cloud-storage__progress"
                  role="progressbar"
                >
                  <span style={{ width: `${storagePercent}%` }} />
                </div>
              ) : null}
              <p className="cloud-storage__message">
                {storageTone === 'full'
                  ? t('storage.fullHelp', { count: sync.pendingCount })
                  : storageTone === 'warning' ? t('storage.warningHelp') : t('storage.normalHelp')}
              </p>
            </section>
          ) : null}
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
                  disabled={busy || isInitializing || otpRequested}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t('account.emailPlaceholder')}
                  required
                  type="email"
                  value={email}
                />
              </span>
            </label>
            {otpRequested ? (
              <>
                <p className="account-sync__hint" role="status">
                  {t('account.otpSent', { email: email.trim() })}
                </p>
                <label>
                  <span>{t('account.otp')}</span>
                  <span className="account-sync__input">
                    <KeyRound aria-hidden="true" size={15} />
                    <input
                      autoComplete="one-time-code"
                      disabled={busy || isInitializing}
                      inputMode="numeric"
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))}
                      placeholder={t('account.otpPlaceholder')}
                      required
                      value={otp}
                    />
                  </span>
                </label>
              </>
            ) : null}
            <Button disabled={busy || isInitializing} type="submit">
              {busy
                ? t('account.signingIn')
                : otpRequested ? t('account.verifyOtp') : t('account.sendOtp')}
            </Button>
            {otpRequested ? (
              <Button
                disabled={busy || isInitializing}
                onClick={() => {
                  setOtp('');
                  setOtpRequested(false);
                  setError(null);
                }}
                type="button"
                variant="secondary"
              >
                {t('account.changeEmail')}
              </Button>
            ) : null}
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
      {upgradeOpen ? (
        <div aria-modal="true" className="cloud-storage-dialog" role="dialog">
          <div className="cloud-storage-dialog__panel">
            <strong>{t('storage.upgradeDialogTitle')}</strong>
            <p>{t('storage.upgradeDialogBody')}</p>
            <Button onClick={() => setUpgradeOpen(false)} size="small" type="button">
              {t('app.confirm')}
            </Button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
