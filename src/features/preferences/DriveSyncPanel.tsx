import {
  Clock3,
  Cloud,
  CloudOff,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import type { SyncRevision } from '../../sync/syncTypes';

type PendingDangerAction = 'all' | 'local' | 'remote' | null;

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
    if (action === 'local') await driveSync.deleteLocal();
    if (action === 'remote') await driveSync.deleteRemote();
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

      {driveSync.status === 'unconfigured' ? (
        <p className="drive-sync-note">Build chưa có Google OAuth Client ID.</p>
      ) : null}

      {driveSync.status === 'disconnected' ? (
        <div className="drive-sync-connect-card">
          <p>Sao lưu và đồng bộ Sticky, Tasks, Folders trên các thiết bị.</p>
          <Button disabled={busy} onClick={() => void driveSync.connect()}>
            <Cloud aria-hidden="true" size={16} /> Kết nối Google Drive
          </Button>
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
            <Button disabled={busy} onClick={() => void driveSync.disconnect()} size="small" variant="ghost">
              <Unplug aria-hidden="true" size={15} /> Giữ local và bỏ qua
            </Button>
          </div>
        </div>
      ) : null}

      {ready ? (
        <div className="drive-sync-actions">
          <Button disabled={busy} onClick={() => void driveSync.syncNow()} size="small">
            <RefreshCw aria-hidden="true" size={15} /> Đồng bộ ngay
          </Button>
          <Button disabled={busy} onClick={() => void driveSync.disconnect()} size="small" variant="ghost">
            <Unplug aria-hidden="true" size={15} /> Ngắt kết nối
          </Button>
        </div>
      ) : null}

      {driveSync.lastResult ? (
        <dl className="drive-sync-result" aria-label="Kết quả đồng bộ gần nhất">
          <div><dt>Thắng</dt><dd>{driveSync.lastResult.recordWinners}</dd></div>
          <div><dt>Bỏ qua</dt><dd>{driveSync.lastResult.skippedRecords}</dd></div>
          <div><dt>Lịch sử</dt><dd>{driveSync.lastResult.revisionsCreated}</dd></div>
          <div><dt>Truyền</dt><dd>{formatBytes(driveSync.lastResult.transferredBytes)}</dd></div>
        </dl>
      ) : null}

      {ready && driveSync.revisions.length > 0 ? (
        <details className="drive-sync-history">
          <summary><Clock3 aria-hidden="true" size={14} /> Lịch sử đồng bộ <span>{driveSync.revisions.length}</span></summary>
          <ul>
            {driveSync.revisions.map((revision) => (
              <li key={revisionId(revision)}>
                <span>
                  <strong>{revisionLabel(revision)}</strong>
                  <small>{new Date(revision.replacedAt).toLocaleString('vi-VN')} · {revision.originDeviceId}</small>
                </span>
                <Button
                  aria-label={`Khôi phục ${revisionLabel(revision)}`}
                  disabled={busy}
                  onClick={() => void driveSync.restoreRevision(revisionId(revision))}
                  size="small"
                  title="Khôi phục"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" size={14} />
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {ready ? (
        <details className="drive-sync-danger">
          <summary><Trash2 aria-hidden="true" size={14} /> Quản lý dữ liệu</summary>
          <DangerAction action="local" disabled={busy || !driveSync.canDeleteLocal} icon={<HardDrive size={14} />} label="Tải lại dữ liệu từ Drive" pending={pendingDangerAction} setPending={setPendingDangerAction} onConfirm={runDangerAction} />
          <DangerAction action="remote" disabled={busy} icon={<CloudOff size={14} />} label="Xóa bản sao trên Drive" pending={pendingDangerAction} setPending={setPendingDangerAction} onConfirm={runDangerAction} />
          <DangerAction action="all" disabled={busy || !driveSync.canDeleteAll} icon={<Trash2 size={14} />} label="Xóa toàn bộ" pending={pendingDangerAction} setPending={setPendingDangerAction} onConfirm={runDangerAction} />
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

function revisionId(revision: SyncRevision) {
  return `${revision.entityType}:${revision.id}:${revision.clock.wallTimeMs}:${revision.clock.counter}:${revision.clock.deviceId}`;
}

function revisionLabel(revision: SyncRevision) {
  const value = revision.value;
  if (value && typeof value.title === 'string') return value.title;
  if (value && typeof value.name === 'string') return value.name;
  return `${revision.entityType} · ${revision.id}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
