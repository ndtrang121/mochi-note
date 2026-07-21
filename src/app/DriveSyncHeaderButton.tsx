import { CircleAlert, Cloud, CloudOff, RefreshCw } from 'lucide-react';

import { IconButton } from '../components/ui/IconButton';
import { useMochiData } from './MochiDataProvider';

type HeaderSyncState = 'error' | 'offline' | 'pending' | 'synced' | 'syncing';

export function DriveSyncHeaderButton() {
  const { driveSync } = useMochiData();
  const connected = driveSync.status === 'ready' || driveSync.status === 'syncing';
  if (!connected) return null;

  const presentation = headerSyncPresentation(driveSync);
  return (
    <IconButton
      aria-label={presentation.label}
      className="drive-sync-header-button"
      data-sync-state={presentation.state}
      disabled={driveSync.status === 'syncing'}
      onClick={() => void driveSync.syncNow()}
      title={presentation.label}
    >
      {presentation.state === 'offline' ? <CloudOff aria-hidden="true" size={18} /> : null}
      {presentation.state === 'error' ? <CircleAlert aria-hidden="true" size={18} /> : null}
      {presentation.state === 'synced' ? <Cloud aria-hidden="true" size={18} /> : null}
      {presentation.state === 'pending' || presentation.state === 'syncing'
        ? <RefreshCw aria-hidden="true" className="drive-sync-header-button__spinner" size={18} />
        : null}
    </IconButton>
  );
}

function headerSyncPresentation(driveSync: ReturnType<typeof useMochiData>['driveSync']): { label: string; state: HeaderSyncState } {
  if (driveSync.status === 'syncing') return { label: 'Đang đồng bộ với Google Drive', state: 'syncing' };
  if (driveSync.errorKind === 'network') return { label: 'Chưa thể đồng bộ vì đang offline. Bấm để thử lại', state: 'offline' };
  if (driveSync.error) return { label: 'Đồng bộ Google Drive gặp lỗi. Bấm để thử lại', state: 'error' };
  if (driveSync.hasPendingChanges) return { label: 'Có thay đổi đang chờ đồng bộ. Bấm để đồng bộ ngay', state: 'pending' };
  return { label: 'Đã đồng bộ với Google Drive. Bấm để đồng bộ ngay', state: 'synced' };
}
