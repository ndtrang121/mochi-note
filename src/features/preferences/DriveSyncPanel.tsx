import {
  Check,
  Clock3,
  Cloud,
  CloudOff,
  HardDrive,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unplug,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import type { SyncRevision } from '../../sync/syncTypes';

type PendingDangerAction = 'all' | 'local' | 'remote' | null;

export function DriveSyncPanel() {
  const { driveSync } = useMochiData();
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction>(null);
  const busy = driveSync.status === 'authorizing' || driveSync.status === 'syncing';
  const needsPassphrase = driveSync.status === 'locked' || driveSync.status === 'needs-new-passphrase';
  const ready = driveSync.status === 'ready' || driveSync.status === 'syncing';

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

      <ol className="drive-sync-wizard" aria-label="Tiến trình kết nối Google Drive">
        <WizardStep complete={driveSync.status !== 'disconnected' && driveSync.status !== 'unconfigured' && driveSync.status !== 'authorizing'} icon={<Cloud size={13} />} label="Google" />
        <WizardStep complete={ready} icon={<KeyRound size={13} />} label="Vault" />
        <WizardStep complete={driveSync.lastSyncedAt !== null} icon={<RefreshCw size={13} />} label="Đồng bộ" />
      </ol>

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

      {ready ? (
        <div className="drive-sync-actions">
          <Button disabled={busy} onClick={() => void driveSync.syncNow()} size="small">
            <RefreshCw aria-hidden="true" size={15} /> Sync ngay
          </Button>
          <Button disabled={busy} onClick={() => void driveSync.disconnect()} size="small" variant="ghost">
            <Unplug aria-hidden="true" size={15} /> Tắt trên máy này
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
          <DangerAction
            action="local"
            disabled={busy || !driveSync.canDeleteLocal}
            icon={<HardDrive size={14} />}
            label="Tải lại dữ liệu từ Drive"
            pending={pendingDangerAction}
            setPending={setPendingDangerAction}
            onConfirm={runDangerAction}
          />
          <DangerAction
            action="remote"
            disabled={busy}
            icon={<CloudOff size={14} />}
            label="Xóa bản sao trên Drive"
            pending={pendingDangerAction}
            setPending={setPendingDangerAction}
            onConfirm={runDangerAction}
          />
          <DangerAction
            action="all"
            disabled={busy || !driveSync.canDeleteAll}
            icon={<Trash2 size={14} />}
            label="Xóa toàn bộ"
            pending={pendingDangerAction}
            setPending={setPendingDangerAction}
            onConfirm={runDangerAction}
          />
          {driveSync.legacyDevices.length > 0 ? (
            <p className="drive-sync-note">Cần cập nhật hoặc loại thiết bị cũ trước khi xóa toàn bộ.</p>
          ) : null}
        </details>
      ) : null}

      {!driveSync.supportsBackgroundRefresh && driveSync.status !== 'unconfigured' ? (
        <p className="drive-sync-note">Edge đồng bộ khi MochiNote đang mở hoặc khi bấm Sync ngay.</p>
      ) : null}
      {formError ? <p className="data-portability-message data-portability-message--error" role="alert">{formError}</p> : null}
      {driveSync.error ? <p className="data-portability-message data-portability-message--error" role="alert">{driveSync.error}</p> : null}
    </fieldset>
  );
}

function WizardStep({ complete, icon, label }: { complete: boolean; icon: React.ReactNode; label: string }) {
  return (
    <li data-complete={complete}>
      <span>{complete ? <Check aria-hidden="true" size={13} /> : icon}</span>
      {label}
    </li>
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
  return (
    <Button disabled={disabled} onClick={() => setPending(action)} size="small" variant="ghost">
      {icon} {label}
    </Button>
  );
}

function statusLabel(status: ReturnType<typeof useMochiData>['driveSync']['status']) {
  switch (status) {
    case 'authorizing': return 'Đang kết nối Google Drive';
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