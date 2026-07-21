import {
  Cloud,
  CloudOff,
  RefreshCw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';

type PendingDangerAction = 'all' | 'disconnect' | 'local' | null;

export function DriveSyncPanel() {
  const { driveSync } = useMochiData();
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction>(null);
  const busy = driveSync.status === 'authorizing' || driveSync.status === 'syncing';
  const ready = driveSync.status === 'ready' || driveSync.status === 'syncing';
  const recoverable = driveSync.status === 'remote-missing'
    || driveSync.status === 'locked'
    || driveSync.status === 'needs-new-passphrase';

  async function runDangerAction(action: Exclude<PendingDangerAction, null>) {
    setPendingDangerAction(null);
    if (action === 'local') await driveSync.deleteLocalOnly();
    if (action === 'disconnect') await driveSync.disconnect();
    if (action === 'all') await driveSync.deleteAll();
  }

  return (
    <fieldset className="preferences-section drive-sync-section">
      <legend><Cloud aria-hidden="true" size={15} /> Google Drive Sync</legend>

      <div className="drive-sync-status" data-status={driveSync.status}>
        {ready ? <Cloud aria-hidden="true" size={18} /> : <CloudOff aria-hidden="true" size={18} />}
        <span>
          <strong>{statusLabel(driveSync.status)}</strong>
          <small>{lastSyncLabel(driveSync.lastSyncedAt)}</small>
        </span>
      </div>
          <small>{driveSync.accountEmail ?? (ready ? 'Tài khoản Google đã kết nối' : '')}</small>

      {driveSync.status === 'unconfigured' ? (
        <p className="drive-sync-note">Build chưa có Google OAuth Client ID.</p>
      ) : null}

      {driveSync.status === 'disconnected' ? (
        <div className="drive-sync-connect-card">
          <p>Sao lưu và đồng bộ Sticky, Tasks, Folders trên các thiết bị.</p>
          <Button disabled={busy} onClick={() => void driveSync.connect()}>
            <Cloud aria-hidden="true" size={16} /> Kết nối Google Drive
          </Button>
          <DangerAction action="local" disabled={busy} icon={<Trash2 size={14} />} label="Xóa dữ liệu trên thiết bị" pending={pendingDangerAction} setPending={setPendingDangerAction} onConfirm={runDangerAction} />
        </div>
      ) : null}

      {recoverable ? (
        <div className="drive-sync-recovery" role="status">
          <strong>Bản đồng bộ trên Google Drive không còn tồn tại.</strong>
          <p>Dữ liệu trên thiết bị này vẫn an toàn. Tạo lại bản cloud từ dữ liệu local hiện tại.</p>
          <div className="drive-sync-actions">
            <Button disabled={busy} onClick={() => void driveSync.rebuildRemote()} size="small">
              <RefreshCw aria-hidden="true" size={15} /> Tạo lại đồng bộ trên Drive
            </Button>
          </div>
        </div>
      ) : null}

      {ready ? (
        <div className="drive-sync-actions">
          <Button disabled={busy} onClick={() => void driveSync.syncNow()} size="small">
            <RefreshCw aria-hidden="true" size={15} /> Đồng bộ ngay
          </Button>
          <DangerAction action="disconnect" disabled={busy} icon={<Unplug size={15} />} label="Ngắt kết nối và xóa khỏi thiết bị" pending={pendingDangerAction} setPending={setPendingDangerAction} onConfirm={runDangerAction} />
        </div>
      ) : null}

      {ready ? (
        <details className="drive-sync-danger">
          <summary><Trash2 aria-hidden="true" size={14} /> Quản lý dữ liệu</summary>
          <DangerAction action="all" disabled={busy || !driveSync.canDeleteAll} icon={<Trash2 size={14} />} label="Xóa tất cả dữ liệu MochiNote" pending={pendingDangerAction} setPending={setPendingDangerAction} onConfirm={runDangerAction} />
        </details>
      ) : null}

      {!driveSync.supportsBackgroundRefresh && driveSync.status !== 'unconfigured' ? (
        <p className="drive-sync-note">Edge đồng bộ khi MochiNote đang mở hoặc khi bấm Đồng bộ ngay.</p>
      ) : null}
      <p className="drive-sync-note">Dữ liệu cloud được bảo vệ bằng quyền truy cập Google Account và lưu trong appDataFolder; giao thức mới không dùng passphrase.</p>
      {driveSync.error ? <p className="data-portability-message data-portability-message--error" role="alert">{driveSync.error}</p> : null}
    </fieldset>
  );
}

interface DangerActionProps {
  action: Exclude<PendingDangerAction, null>;
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onConfirm: (action: Exclude<PendingDangerAction, null>) => Promise<void>;
  pending: PendingDangerAction;
  setPending: (action: PendingDangerAction) => void;
}

function DangerAction({ action, disabled, icon, label, onConfirm, pending, setPending }: DangerActionProps) {
  if (pending === action) {
    return (
      <div className="drive-sync-danger-confirm">
        <span>Xác nhận {label.toLocaleLowerCase('vi-VN')}?</span>
        <Button disabled={disabled} onClick={() => void onConfirm(action)} size="small" variant="danger">Xóa</Button>
        <Button onClick={() => setPending(null)} size="small" variant="ghost">Hủy</Button>
      </div>
    );
  }
  return <Button disabled={disabled} onClick={() => setPending(action)} size="small" variant="ghost">{icon} {label}</Button>;
}

function statusLabel(status: ReturnType<typeof useMochiData>['driveSync']['status']) {
  switch (status) {
    case 'authorizing': return 'Đang kết nối Google Drive';
    case 'locked':
    case 'needs-new-passphrase': return 'Cần tạo vùng đồng bộ mới';
    case 'remote-missing': return 'Bản đồng bộ Drive đã bị xóa';
    case 'error': return 'Đồng bộ gặp lỗi';
    case 'ready': return 'Đồng bộ đã bật';
    case 'syncing': return 'Đang đồng bộ…';
    case 'unconfigured': return 'Google Drive chưa được cấu hình';
    default: return 'Chưa kết nối';
  }
}

function lastSyncLabel(lastSyncedAt: string | null) {
  return lastSyncedAt
    ? `Lần cuối: ${new Date(lastSyncedAt).toLocaleString('vi-VN')}`
    : 'Chưa có lần đồng bộ thành công';
}
