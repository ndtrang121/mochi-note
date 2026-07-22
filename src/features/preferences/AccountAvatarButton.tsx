import { useMochiData } from '../../app/MochiDataProvider';
import { classNames } from '../../utils/classNames';

interface AccountAvatarButtonProps {
  ariaLabel?: string;
  onClick?: () => void;
}

export function AccountAvatarButton({
  ariaLabel = 'Cài đặt',
  onClick,
}: AccountAvatarButtonProps) {
  const { auth, sync } = useMochiData();
  const signedIn = auth.status === 'signed-in';
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
      <img alt="" src="/brand/mochi-mascot.png" />
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
