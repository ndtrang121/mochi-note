import { describe, expect, it } from 'vitest';

import type { Attachment, Note } from '../../db/models';
import { calculateStorageUsage, formatStorageBytes, usagePercent } from './storageUsage';

const note = (id: string): Note => ({
  color: 'yellow', content: '', createdAt: '2026-07-19T00:00:00.000Z', deletedAt: null, favorite: false,
  folderId: null, id, pattern: 'plain', pinned: false, plainText: id, source: null, tags: [],
  title: id, updatedAt: '2026-07-19T00:00:00.000Z',
});

const attachment = (id: string, noteId: string, size: number): Attachment => ({
  blob: new Blob(['x']), createdAt: '2026-07-19T00:00:00.000Z', id, kind: 'file', mimeType: 'text/plain', noteId, size,
  updatedAt: '2026-07-19T00:00:00.000Z',
});

describe('storage usage', () => {
  it('totals attachments and identifies orphan blobs', () => {
    const result = calculateStorageUsage([note('note-1')], [attachment('file-1', 'note-1', 1024), attachment('orphan', 'missing', 2048)]);
    expect(result).toMatchObject({ attachmentBytes: 3072, attachmentCount: 2, noteCount: 1, totalBytes: 3072 });
    expect(result.orphanAttachmentIds).toEqual(['orphan']);
  });

  it('formats bytes and clamps quota percentage', () => {
    expect(formatStorageBytes(1024 * 1024)).toBe('1.0 MB');
    expect(usagePercent(150, 100)).toBe(100);
    expect(usagePercent(10, 0)).toBeNull();
  });
});
