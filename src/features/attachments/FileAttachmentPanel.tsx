import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type { Attachment } from '../../db/models';
import { createStableId } from '../../db/stableId';

export const MAX_ATTACHMENT_BYTES = 16 * 1024 * 1024;
export const MAX_NOTE_ATTACHMENT_BYTES = 32 * 1024 * 1024;
const BLOCKED_EXTENSIONS = /\.(?:bat|cmd|com|exe|htm|html|js|msi|ps1|svg)$/i;

interface FileAttachmentPanelProps {
  attachments: Attachment[];
  existingBytes: number;
  noteId: string;
  onAdd: (attachment: Attachment) => void;
  onRemove: (attachment: Attachment) => void;
}

function attachmentId() {
  return createStableId('attachment-file');
}

export function formatAttachmentSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileAttachmentRow({ attachment, onRemove }: { attachment: Attachment; onRemove?: (attachment: Attachment) => void }) {
  const [url] = useState(() => URL.createObjectURL(attachment.blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="file-attachment-row">
      <span aria-hidden="true"><FileText size={17} /></span>
      <div>
        <strong>{attachment.fileName || 'Tệp đính kèm'}</strong>
        <small>{formatAttachmentSize(attachment.size)} · {attachment.mimeType || 'application/octet-stream'}</small>
      </div>
      <a aria-label={`Tải xuống ${attachment.fileName || 'tệp đính kèm'}`} download={attachment.fileName || 'attachment'} href={url}>
        <Download aria-hidden="true" size={16} />
      </a>
      {onRemove ? (
        <IconButton aria-label={`Xóa ${attachment.fileName || 'tệp đính kèm'}`} onClick={() => onRemove(attachment)}>
          <Trash2 aria-hidden="true" size={16} />
        </IconButton>
      ) : null}
    </div>
  );
}

export function FileAttachmentList({ attachments, onRemove }: { attachments: Attachment[]; onRemove?: (attachment: Attachment) => void }) {
  if (!attachments.length) return null;
  return <div className="file-attachment-list" aria-label="Tệp đính kèm">{attachments.map((attachment) => <FileAttachmentRow attachment={attachment} key={attachment.id} onRemove={onRemove} />)}</div>;
}

export function FileAttachmentPanel({ attachments, existingBytes, noteId, onAdd, onRemove }: FileAttachmentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    let totalBytes = existingBytes + attachments.reduce((sum, item) => sum + item.size, 0);
    const now = new Date().toISOString();
    for (const file of Array.from(files)) {
      if (BLOCKED_EXTENSIONS.test(file.name)) {
        setError(`Không hỗ trợ loại tệp ${file.name}.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} vượt giới hạn 16 MB.`);
        continue;
      }
      if (totalBytes + file.size > MAX_NOTE_ATTACHMENT_BYTES) {
        setError('Tổng tệp đính kèm của ghi chú không được vượt quá 32 MB.');
        break;
      }
      totalBytes += file.size;
      onAdd({
        blob: file,
        createdAt: now,
        fileName: file.name,
        id: attachmentId(),
        kind: 'file',
        mimeType: file.type || 'application/octet-stream',
        noteId,
        size: file.size,
        updatedAt: now,
      });
    }
  }

  return (
    <Surface className="file-attachment-panel">
      <div className="file-attachment-panel__heading">
        <span aria-hidden="true"><FileText size={18} /></span>
        <div><strong>Tệp đính kèm</strong><small>Tối đa 16 MB mỗi tệp · 32 MB mỗi ghi chú</small></div>
        <IconButton aria-label="Thêm tệp đính kèm" onClick={() => inputRef.current?.click()}>
          <Paperclip aria-hidden="true" size={17} />
        </IconButton>
      </div>
      <input aria-label="Chọn tệp đính kèm" className="sr-only" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ''; }} ref={inputRef} type="file" />
      {error ? <p className="file-attachment-panel__error" role="alert">{error}</p> : null}
      {attachments.length ? <FileAttachmentList attachments={attachments} onRemove={onRemove} /> : <p className="file-attachment-panel__empty">Chưa có tệp đính kèm.</p>}
    </Surface>
  );
}
