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
import type { SyncStatus } from '../../supabase/types';

const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  error: 'Cần kiểm tra',
  idle: 'Đã đồng bộ',
  offline: 'Đang ngoại tuyến',
  pending: 'Đang chờ',
  syncing: 'Đang đồng bộ',
};

function formatLastSyncedAt(value: string | null) {
  if (!value) return 'Chưa đồng bộ';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AccountSyncPanel() {
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
      setError(caught instanceof Error ? caught.message : 'Không thể hoàn tất thao tác tài khoản.');
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
      <legend><Cloud aria-hidden="true" size={15} /> Tài khoản &amp; đồng bộ</legend>
      {auth.status === 'signed-in' ? (
        <>
          <div className="account-sync__profile">
            <span className="account-sync__avatar">
              <img alt="" src="/brand/mochi-mascot.png" />
            </span>
            <div>
              <strong>{auth.user?.email ?? 'Tài khoản MochiNote'}</strong>
              <span
                className="account-sync__status"
                data-status={sync.status}
              >
                <i aria-hidden="true" />
                {SYNC_STATUS_LABELS[sync.status]}
              </span>
            </div>
          </div>
          <div className="account-sync__metrics">
            <div>
              <span>Thay đổi đang chờ</span>
              <strong>{sync.pendingCount}</strong>
            </div>
            <div>
              <span>Đồng bộ gần nhất</span>
              <strong>{formatLastSyncedAt(sync.lastSyncedAt)}</strong>
            </div>
          </div>
          <p className="account-sync__hint">
            Ghi chú, nhiệm vụ, thư mục và cài đặt được đồng bộ. Ảnh đính kèm vẫn chỉ lưu trên thiết bị này.
          </p>
          <div className="account-sync__actions">
            <Button
              disabled={busy || isSyncing}
              onClick={() => void run(syncNow)}
              size="small"
              variant="secondary"
            >
              <RefreshCw aria-hidden="true" className={isSyncing ? 'is-spinning' : undefined} size={14} />
              {isSyncing ? 'Đang đồng bộ' : 'Đồng bộ ngay'}
            </Button>
            <Button
              disabled={busy}
              onClick={() => void run(authControls.signOut)}
              size="small"
              variant="ghost"
            >
              <LogOut aria-hidden="true" size={14} /> Đăng xuất
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
              <strong>Mang MochiNote theo bạn</strong>
              <p>Đăng nhập để đồng bộ dữ liệu an toàn giữa các thiết bị, kể cả khi bạn làm việc offline.</p>
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
              <span>Mật khẩu</span>
              <span className="account-sync__input">
                <ShieldCheck aria-hidden="true" size={15} />
                <input
                  autoComplete="current-password"
                  disabled={busy || isInitializing}
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  required
                  type="password"
                  value={password}
                />
              </span>
            </label>
            <Button disabled={busy || isInitializing} type="submit">
              {busy ? 'Đang xử lý…' : 'Đăng nhập'}
            </Button>
            <Button
              disabled={busy || isInitializing || !email.trim() || password.length < 6}
              onClick={() => void run(() => authControls.signUp(email.trim(), password))}
              type="button"
              variant="secondary"
            >
              <UserRoundPlus aria-hidden="true" size={15} /> Tạo tài khoản
            </Button>
          </form>
          <p className="account-sync__hint">
            Dữ liệu khách trên máy sẽ được nhập an toàn vào tài khoản sau khi đăng nhập lần đầu.
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
