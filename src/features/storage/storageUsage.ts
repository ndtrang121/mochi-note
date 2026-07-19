import type { Attachment, Note } from '../../db/models';

export interface StorageUsage {
  attachmentBytes: number;
  attachmentCount: number;
  noteCount: number;
  orphanAttachmentIds: string[];
  totalBytes: number;
}

export function calculateStorageUsage(notes: Note[], attachments: Attachment[]): StorageUsage {
  const noteIds = new Set(notes.map((note) => note.id));
  const orphanAttachmentIds = attachments
    .filter((attachment) => !noteIds.has(attachment.noteId))
    .map((attachment) => attachment.id);
  const attachmentBytes = attachments.reduce((total, attachment) => total + Math.max(0, attachment.size), 0);
  return {
    attachmentBytes,
    attachmentCount: attachments.length,
    noteCount: notes.length,
    orphanAttachmentIds,
    totalBytes: attachmentBytes,
  };
}

export function formatStorageBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function usagePercent(usedBytes: number, quotaBytes?: number) {
  if (!quotaBytes || quotaBytes <= 0) return null;
  return Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
}
