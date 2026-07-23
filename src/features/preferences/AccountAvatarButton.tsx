import { UserRound } from 'lucide-react';

import { useMochiData } from '../../app/MochiDataProvider';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/classNames';

interface AccountAvatarButtonProps {
  ariaLabel?: string;
  onClick?: () => void;
}

export function getAccountInitial(email: string | null | undefined) {
  return email?.trim().charAt(0).toLocaleUpperCase('en-US') || null;
}

export function AccountAvatarButton({
  ariaLabel,
  onClick,
}: AccountAvatarButtonProps) {
  const { t } = useI18n();
  const { auth, sync } = useMochiData();
  const signedIn = auth.status === 'signed-in';
  const initial = signedIn ? getAccountInitial(auth.user?.email) : null;
  const needsAttention = signedIn && (sync.status === 'error' || sync.status === 'offline');
  const title = signedIn
    ? t('account.avatarSignedInTitle', { count: sync.pendingCount, email: auth.user?.email ?? t('account.defaultName') })
    : t('account.avatarGuestTitle');

  return (
    <button
      aria-label={ariaLabel ?? t('app.openSettings')}
      className="account-avatar-button"
      onClick={onClick}
      title={title}
      type="button"
    >
      {initial ? (
        <span className="account-avatar-button__initial">{initial}</span>
      ) : (
        <UserRound aria-hidden="true" className="account-avatar-button__guest" size={18} />
      )}
      <span
        aria-hidden="true"
        className={classNames(
          'account-avatar-button__status',
          signedIn && 'account-avatar-button__status--online',
          needsAttention && 'account-avatar-button__status--attention',
        )}
      />
    </button>
  );
}
