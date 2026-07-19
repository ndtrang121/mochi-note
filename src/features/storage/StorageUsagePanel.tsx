import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { Surface } from '../../components/ui/Surface';
import { formatStorageBytes, calculateStorageUsage, usagePercent, type StorageUsage } from './storageUsage';

interface StorageEstimate {
  quota?: number;
  usage?: number;
}

export function StorageUsagePanel() {
  const { repositories } = useMochiData();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [estimate, setEstimate] = useState<StorageEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsage = useCallback(async () => {
    if (!repositories) return;
    setLoading(true);
    setError(null);
    try {
      const [notes, attachments, browserEstimate] = await Promise.all([
        repositories.notes.list(),
        repositories.attachments.list(),
        navigator.storage?.estimate?.() ?? Promise.resolve(null),
      ]);
      setUsage(calculateStorageUsage(notes, attachments));
      setEstimate(browserEstimate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đọc dung lượng local.');
    } finally {
      setLoading(false);
    }
  }, [repositories]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadUsage]);

  async function cleanOrphans() {
    if (!repositories || !usage?.orphanAttachmentIds.length) return;
    setCleaning(true);
    setStatus(null);
    setError(null);
    try {
      await Promise.all(usage.orphanAttachmentIds.map((id) => repositories.attachments.delete(id)));
      setStatus(`Đã dọn ${usage.orphanAttachmentIds.length} tệp mồ côi.`);
      await loadUsage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể dọn tệp mồ côi.');
    } finally {
      setCleaning(false);
    }
  }

  const percent = usagePercent(estimate?.usage ?? usage?.totalBytes ?? 0, estimate?.quota);
  return (
    <fieldset className="preferences-section storage-usage-section">
      <legend><Database aria-hidden="true" size={15} /> Dung lượng local</legend>
      {loading ? <p className="storage-usage__muted">Đang kiểm tra dung lượng…</p> : null}
      {!loading && usage ? (
        <>
          <div className="storage-usage__summary">
            <strong>{formatStorageBytes(usage.totalBytes)}</strong>
            <span>{usage.attachmentCount} tệp · {usage.noteCount} ghi chú</span>
          </div>
          {percent !== null ? (
            <div className="storage-usage__meter">
              <div aria-label={`Đã dùng ${percent}% dung lượng browser`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="storage-usage__meter-bar" role="progressbar"><span style={{ width: `${percent}%` }} /></div>
              <small>{percent}% dung lượng browser · {formatStorageBytes(estimate?.quota ?? 0)} khả dụng</small>
            </div>
          ) : <p className="storage-usage__muted">Dung lượng browser chưa được trình duyệt báo cáo.</p>}
          <div className="storage-usage__actions">
            <Button disabled={cleaning || usage.orphanAttachmentIds.length === 0} onClick={() => void cleanOrphans()} size="small" variant="secondary">
              <Trash2 aria-hidden="true" size={14} /> Dọn tệp mồ côi ({usage.orphanAttachmentIds.length})
            </Button>
            <Button disabled={loading || cleaning} onClick={() => void loadUsage()} size="small" variant="ghost">
              <RefreshCw aria-hidden="true" size={14} /> Làm mới
            </Button>
          </div>
        </>
      ) : null}
      {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
      {status ? <p className="data-portability-message" role="status">{status}</p> : null}
      <Surface className="storage-usage__privacy-note">Chỉ dữ liệu local trong MochiNote được thống kê; không có dữ liệu nào được tải lên.</Surface>
    </fieldset>
  );
}
