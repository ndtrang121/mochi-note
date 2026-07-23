import { ArchiveRestore, Download, FileJson, ShieldCheck, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { useI18n } from '../../i18n/I18nProvider';
import { formatDateTime } from '../../i18n/translate';
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

export function DataPortabilityPanel({ onClose }: DataPortabilityPanelProps) {
  const { t, locale } = useI18n();
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
      setStatus(t('backup.exportDone'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('backup.exportError'));
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
      setError(caught instanceof Error ? caught.message : t('backup.readError'));
    } finally { setBusy(false); }
  }

  async function importData() {
    if (!database || !backup) return;
    setBusy(true); setError(null); setStatus(null);
    try {
      await restoreBackup(database, backup, mode, auth.user ? repositories ?? undefined : undefined);
      await refreshData();
      setStatus(mode === 'replace' ? t('backup.replaceDone') : t('backup.mergeDone'));
      setBackup(null); setPreview(null); setFilename('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('backup.restoreError'));
    } finally { setBusy(false); }
  }

  return (
    <div className="data-portability-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} role="presentation">
      <section aria-labelledby="data-portability-heading" aria-modal="true" className="data-portability-panel" role="dialog">
        <header className="data-portability-panel__header">
          <span><ArchiveRestore aria-hidden="true" size={19} /></span>
          <div><h2 id="data-portability-heading">{t('backup.heading')}</h2><p>{t('backup.description')}</p></div>
          <IconButton aria-label={t('backup.close')} onClick={onClose}><X aria-hidden="true" size={18} /></IconButton>
        </header>
        <div className="data-portability-card ui-surface">
          <div className="data-portability-card__heading"><span><Download aria-hidden="true" size={18} /></span><div><strong>{t('backup.exportTitle')}</strong><small>{t('backup.exportDescription')}</small></div></div>
          <Button disabled={busy || !database} onClick={() => void exportData()} variant="secondary"><FileJson aria-hidden="true" size={16} />{t('backup.downloadJson')}</Button>
        </div>
        <div className="data-portability-card ui-surface">
          <div className="data-portability-card__heading"><span><Upload aria-hidden="true" size={18} /></span><div><strong>{t('backup.importTitle')}</strong><small>{t('backup.importDescription')}</small></div></div>
          <label className="data-portability-file" htmlFor="backup-file"><span>{t('backup.chooseJson')}</span><small>{filename || t('backup.noFile')}</small></label>
          <input accept="application/json,.json" className="data-portability-file-input" disabled={busy} id="backup-file" onChange={(event) => void selectFile(event)} ref={fileInputRef} type="file" />
          {preview ? <div className="data-portability-preview" aria-label={t('backup.previewLabel')}><div><ShieldCheck aria-hidden="true" size={18} /><span><strong>{t('backup.valid')}</strong><small>{formatDateTime(locale, preview.exportedAt)}</small></span></div><dl><div><dt>{t('backup.notes')}</dt><dd>{preview.notes}</dd></div><div><dt>{t('backup.folders')}</dt><dd>{preview.folders}</dd></div><div><dt>{t('backup.tasks')}</dt><dd>{preview.tasks}</dd></div><div><dt>{t('backup.reminders')}</dt><dd>{preview.reminders}</dd></div><div><dt>{t('backup.files')}</dt><dd>{preview.attachments}</dd></div></dl></div> : null}
          {backup ? <fieldset className="data-portability-modes"><legend>{t('backup.restoreMode')}</legend><div><input aria-label={t('backup.mergeData')} checked={mode === 'merge'} id="restore-merge" name="restore-mode" onChange={() => setMode('merge')} type="radio" /><span><strong>{t('backup.mergeData')}</strong><small>{t('backup.mergeHelp')}</small></span></div><div><input aria-label={t('backup.replaceData')} checked={mode === 'replace'} id="restore-replace" name="restore-mode" onChange={() => setMode('replace')} type="radio" /><span><strong>{t('backup.replaceData')}</strong><small>{t('backup.replaceHelp')}</small></span></div></fieldset> : null}
          {backup ? <Button disabled={busy} onClick={() => void importData()}>{mode === 'replace' ? t('backup.confirmReplace') : t('backup.mergeInto')}</Button> : null}
        </div>
        {error ? <p className="data-portability-message data-portability-message--error" role="alert">{error}</p> : null}
        {status ? <p className="data-portability-message" role="status">{status}</p> : null}
      </section>
    </div>
  );
}
