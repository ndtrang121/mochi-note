import { Image as ImageIcon, Paperclip, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type { Attachment } from '../../db/models';
import { MAX_NOTE_ATTACHMENT_BYTES } from './FileAttachmentPanel';
import { optimizeImageFile } from './imageOptimization';

interface ImageAttachmentPanelProps {
  attachments: Attachment[];
  existingBytes: number;
  noteId: string;
  onAdd: (attachment: Attachment) => void;
  onRemove: (attachment: Attachment) => void;
}

function createAttachmentId() {
  return `attachment-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageAttachment({ attachment, onRemove }: { attachment: Attachment; onRemove: (attachment: Attachment) => void }) {
  const [url] = useState(() => URL.createObjectURL(attachment.blob));
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <figure className="image-attachment-card">
      <img alt="Ảnh đính kèm ghi chú" src={url} />
      <figcaption>
        <span>{attachment.fileName || 'Ảnh'} · {formatSize(attachment.size)}</span>
        <IconButton aria-label="Xóa ảnh đính kèm" onClick={() => onRemove(attachment)}>
          <Trash2 aria-hidden="true" size={16} />
        </IconButton>
      </figcaption>
    </figure>
  );
}

export function ImageAttachmentPanel({ attachments, existingBytes, noteId, onAdd, onRemove }: ImageAttachmentPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError(null);
    setBusy(true);
    const now = new Date().toISOString();
    let totalBytes = existingBytes + attachments.reduce((sum, item) => sum + item.size, 0);
    try {
      for (const file of Array.from(files)) {
        const optimized = await optimizeImageFile(file);
        if (totalBytes + optimized.blob.size > MAX_NOTE_ATTACHMENT_BYTES) {
          throw new Error('Tổng tệp đính kèm của ghi chú không được vượt quá 32 MB.');
        }
        totalBytes += optimized.blob.size;
        onAdd({
          blob: optimized.blob,
          createdAt: now,
          fileName: file.name,
          id: createAttachmentId(),
          kind: 'image',
          mimeType: optimized.blob.type || file.type,
          noteId,
          size: optimized.blob.size,
          updatedAt: now,
        });
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tối ưu ảnh.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface className="image-attachment-panel">
      <div className="image-attachment-panel__heading">
        <span aria-hidden="true"><ImageIcon size={18} /></span>
        <div><strong>Ảnh đính kèm</strong><small>Lưu cục bộ trong ghi chú</small></div>
        <IconButton aria-label="Thêm ảnh đính kèm" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Paperclip aria-hidden="true" size={17} />
        </IconButton>
      </div>
      <input
        accept="image/*"
        aria-label="Chọn ảnh đính kèm"
        className="sr-only"
        onChange={(event) => { void addFiles(event.target.files); event.currentTarget.value = ''; }}
        ref={inputRef}
        type="file"
        multiple
      />
      {busy ? <p className="image-attachment-panel__empty" role="status">Đang tối ưu ảnh…</p> : null}
      {error ? <p className="image-attachment-panel__error" role="alert">{error}</p> : null}
      {attachments.length > 0 ? (
        <div className="image-attachment-grid" aria-label="Ảnh đính kèm">
          {attachments.map((attachment) => <ImageAttachment attachment={attachment} key={attachment.id} onRemove={onRemove} />)}
        </div>
      ) : <p className="image-attachment-panel__empty">Chưa có ảnh đính kèm.</p>}
    </Surface>
  );
}

export function ImageAttachmentList({ attachments, onRemove }: { attachments: Attachment[]; onRemove: (attachment: Attachment) => void }) {
  if (!attachments.length) return null;
  return <div className="note-detail-image-grid" aria-label="Ảnh đính kèm">{attachments.map((attachment) => <ImageAttachment attachment={attachment} key={attachment.id} onRemove={onRemove} />)}</div>;
}
