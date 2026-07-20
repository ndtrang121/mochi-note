import { Cloud, CloudOff, LockKeyhole, RefreshCw, Trash2, Unplug } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';

export function DriveSyncPanel() {
  const { driveSync } = useMochiData();
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const busy = driveSync.status === 'authorizing' || driveSync.status === 'syncing';
  const needsPassphrase = driveSync.status === 'locked' || driveSync.status === 'needs-new-passphrase';

  async function submitPassphrase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passphrase.length < 12) {
      setFormError('Passphrase phải có ít nhất 12 ký tự.');
      return;
    }
    if (driveSync.status === 'needs-new-passphrase' && passphrase !== confirmation) {
      setFormError('Passphrase xác nhận không khớp.');
      return;
    }
    setFormError(null);
    await driveSync.submitPassphrase(passphrase);
    setPassphrase('');
    setConfirmation('');
  }

  return (
    <fieldset className="preferences-section drive-sync-section">
      <legend><Cloud aria-hidden="true" size={15} /> Google Drive Sync</legend>

      <div className="drive-sync-status" data-status={driveSync.status}>
        {driveSync.status === 'ready' || driveSync.status === 'syncing'
          ? <Cloud aria-hidden="true" size={18} />
          : <CloudOff aria-hidden="true" size={18} />}
        <span>
          <strong>{statusLabel(driveSync.status)}</strong>
          <small>{lastSyncLabel(driveSync.lastSyncedAt)}</small>
        </span>
      </div>

      {driveSync.status === 'unconfigured' ? (
        <p className="drive-sync-note">Build chưa có Google OAuth Client ID.</p>
      ) : null}

      {driveSync.status === 'disconnected' ? (
        <Button disabled={busy} onClick={() => void driveSync.connect()}>
          <Cloud aria-hidden="true" size={16} /> Kết nối Google Drive
        </Button>
      ) : null}

      {needsPassphrase ? (
        <form className="drive-sync-passphrase" onSubmit={(event) => void submitPassphrase(event)}>
          <label>
            <span>{driveSync.status === 'locked' ? 'Mở khóa đồng bộ' : 'Tạo passphrase đồng bộ'}</span>
            <input
              autoComplete={driveSync.status === 'locked' ? 'current-password' : 'new-password'}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Passphrase"
              type="password"
              value={passphrase}
            />
          </label>
          {driveSync.status === 'needs-new-passphrase' ? (
            <label>
              <span>Xác nhận passphrase</span>
              <input
                autoComplete="new-password"
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Nhập lại passphrase"
                type="password"
                value={confirmation}
              />
            </label>
          ) : null}
          <Button disabled={busy} type="submit">
            <LockKeyhole aria-hidden="true" size={16} />
            {driveSync.status === 'locked' ? 'Mở khóa' : 'Bật đồng bộ'}
          </Button>
        </form>
      ) : null}

      {driveSync.status === 'ready' || driveSync.status === 'syncing' || driveSync.status === 'error' ? (
        <div className="drive-sync-actions">
          <Button disabled={busy} onClick={() => void driveSync.syncNow()} size="small">
            <RefreshCw aria-hidden="true" size={15} /> Sync ngay
          </Button>
          <Button disabled={busy} onClick={() => void driveSync.disconnect()} size="small" variant="ghost">
            <Unplug aria-hidden="true" size={15} /> Ngắt kết nối
          </Button>
          {resetPending ? (
            <div className="drive-sync-reset-confirm">
              <span>Xóa vault trên Google Drive? Dữ liệu trên máy vẫn được giữ.</span>
              <Button disabled={busy} onClick={() => void driveSync.resetRemote()} size="small" variant="danger">Xóa vault</Button>
              <Button onClick={() => setResetPending(false)} size="small" variant="ghost">Hủy</Button>
            </div>
          ) : (
            <Button disabled={busy} onClick={() => setResetPending(true)} size="small" variant="ghost">
              <Trash2 aria-hidden="true" size={14} /> Xóa dữ liệu Drive
            </Button>
          )}
        </div>
      ) : null}

      {!driveSync.supportsBackgroundRefresh && driveSync.status !== 'unconfigured' ? (
        <p className="drive-sync-note">Edge đồng bộ khi MochiNote đang mở hoặc khi bấm Sync ngay.</p>
      ) : null}
      {formError ? <p className="data-portability-message data-portability-message--error" role="alert">{formError}</p> : null}
      {driveSync.error ? <p className="data-portability-message data-portability-message--error" role="alert">{driveSync.error}</p> : null}
    </fieldset>
  );
}

function statusLabel(status: ReturnType<typeof useMochiData>['driveSync']['status']) {
  switch (status) {
    case 'authorizing': return 'Đang kết nối Google Drive';
    case 'error': return 'Đồng bộ gặp lỗi';
    case 'locked': return 'Vault cần mở khóa';
    case 'needs-new-passphrase': return 'Sẵn sàng tạo vault';
    case 'ready': return 'Đồng bộ đã bật';
    case 'syncing': return 'Đang đồng bộ';
    case 'unconfigured': return 'Google Drive chưa được cấu hình';
    default: return 'Chưa kết nối';
  }
}

function lastSyncLabel(lastSyncedAt: string | null) {
  return lastSyncedAt
    ? `Lần cuối: ${new Date(lastSyncedAt).toLocaleString('vi-VN')}`
    : 'Chưa có lần đồng bộ thành công';
}
