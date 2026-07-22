import { UserRound } from 'lucide-react';

import { useMochiData } from '../../app/MochiDataProvider';
import { classNames } from '../../utils/classNames';

interface AccountAvatarButtonProps {
  ariaLabel?: string;
  onClick?: () => void;
}

export function getAccountInitial(email: string | null | undefined) {
  return email?.trim().charAt(0).toLocaleUpperCase('vi-VN') || null;
}

export function AccountAvatarButton({
  ariaLabel = 'Cài đặt',
  onClick,
}: AccountAvatarButtonProps) {
  const { auth, sync } = useMochiData();
  const signedIn = auth.status === 'signed-in';
  const initial = signedIn ? getAccountInitial(auth.user?.email) : null;
  const needsAttention = signedIn && (sync.status === 'error' || sync.status === 'offline');
  const title = signedIn
    ? `${auth.user?.email ?? 'Tài khoản MochiNote'} · ${sync.pendingCount} thay đổi chờ đồng bộ`
    : 'Đăng nhập để đồng bộ dữ liệu';

  return (
    <button
      aria-label={ariaLabel}
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
