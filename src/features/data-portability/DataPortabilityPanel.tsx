import { ArchiveRestore, Download, FileJson, ShieldCheck, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import {
  backupPreview,
  backupToJson,
  createBackup,
  parseBackupJson,
  restoreBackup,
  type BackupPreview,
  type MochiBackup,
  type RestoreMode,
} from './backup';

interface DataPortabilityPanelProps { onClose: () => void; }

function downloadJson(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatExportTime(value: string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function DataPortabilityPanel({ onClose }: DataPortabilityPanelProps) {
  const { auth, database, refreshData, repositories } = useMochiData();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<MochiBackup | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function exportData() {
    if (!database) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      const exported = await createBackup(database);
      downloadJson(backupToJson(exported), `mochinote-backup-${exported.exportedAt.slice(0, 10)}.json`);
      setStatus('Đã tạo bản sao lưu. Tệp JSON đã được tải xuống.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xuất dữ liệu.');
    } finally { setBusy(false); }
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setBackup(null); setPreview(null); setFilename(file?.name ?? ''); setError(null); setStatus(null);
    if (!file) return;
    setBusy(true);
    try {
      const parsed = parseBackupJson(await file.text());
      setBackup(parsed); setPreview(backupPreview(parsed));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể đọc bản sao lưu.');
    } finally { setBusy(false); }
  }

  async function importData() {
    if (!database || !backup) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await restoreBackup(database, backup, mode, auth.user ? repositories ?? undefined : undefined);
      await refreshData();
      setStatus(mode === 'replace' ? 'Đã thay thế dữ liệu bằng bản sao lưu.' : 'Đã gộp bản sao lưu với dữ liệu hiện tại.');
      setBackup(null); setPreview(null); setFilename('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể phục hồi dữ liệu.');
    } finally { setBusy(false); }
  }

  return (
    <div className="data-portability-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-labelledby="data-portability-heading" aria-modal="true" className="data-portability-panel" role="dialog">
        <header className="data-portability-panel__header">
          <span><ArchiveRestore aria-hidden="true" size={19} /></span>
          <div><h2 id="data-portability-heading">Sao lưu dữ liệu</h2><p>Xuất hoặc phục hồi dữ liệu cục bộ của MochiNote.</p></div>
          <IconButton aria-label="Đóng cài đặt dữ liệu" onClick={onClose}><X aria-hidden="true" size={18} /></IconButton>
        </header>
        <div className="data-portability-card ui-surface">
          <div className="data-portability-card__heading"><span><Download aria-hidden="true" size={18} /></span><div><strong>Xuất bản sao lưu</strong><small>Tất cả ghi chú, tệp đính kèm, thư mục và nhiệm vụ.</small></div></div>
          <Button disabled={busy || !database} onClick={() => void exportData()} variant="secondary"><FileJson aria-hidden="true" size={16} />Tải file JSON</Button>
        </div>
        <div className="data-portability-card ui-surface">
          <div className="data-portability-card__heading"><span><Upload aria-hidden="true" size={18} /></span><div><strong>Nhập bản sao lưu</strong><small>File được kiểm tra đầy đủ trước khi thay đổi dữ liệu.</small></div></div>
          <label className="data-portability-file" htmlFor="backup-file"><span>Chọn file JSON</span><small>{filename || 'Chưa chọn file'}</small></label>
          <input accept="application/json,.json" className="data-portability-file-input" disabled={busy} id="backup-file" onChange={(event) => void selectFile(event)} ref={fileInputRef} type="file" />
          {preview ? <div className="data-portability-preview" aria-label="Xem trước bản sao lưu"><div><ShieldCheck aria-hidden="true" size={18} /><span><strong>Backup hợp lệ</strong><small>{formatExportTime(preview.exportedAt)}</small></span></div><dl><div><dt>Ghi chú</dt><dd>{preview.notes}</dd></div><div><dt>Thư mục</dt><dd>{preview.folders}</dd></div><div><dt>Nhiệm vụ</dt><dd>{preview.tasks}</dd></div><div><dt>Nhắc nhở</dt><dd>{preview.reminders}</dd></div><div><dt>Tệp</dt><dd>{preview.attachments}</dd></div></dl></div> : null}
          {backup ? <fieldset className="data-portability-modes"><legend>Cách phục hồi</legend><div><input aria-label="Gộp dữ liệu" checked={mode === 'merge'} id="restore-merge" name="restore-mode" onChange={() => setMode('merge')} type="radio" /><span><strong>Gộp dữ liệu</strong><small>Giữ các mục không trùng trong MochiNote.</small></span></div><div><input aria-label="Thay thế toàn bộ" checked={mode === 'replace'} id="restore-replace" name="restore-mode" onChange={() => setMode('replace')} type="radio" /><span><strong>Thay thế toàn bộ</strong><small>Xóa dữ liệu hiện tại rồi phục hồi backup.</small></span></div></fieldset> : null}
          {backup ? <Button disabled={busy} onClick={() => void importData()}>{mode === 'replace' ? 'Xác nhận thay thế' : 'Gộp vào MochiNote'}</Button> : null}
        </div>
        {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
        {status ? <p className="data-portability-message" role="status">{status}</p> : null}
      </section>
    </div>
  );
}
