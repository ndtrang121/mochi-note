import type { Attachment, Note } from '../../db/models';
import type { ActivePageMetadata, PageCaptureMode } from '../../browser/pageCapture';
import { createStableId } from '../../db/stableId';

interface CapturedPageInput {
  excerpt?: string;
  idFactory?: (prefix: string) => string;
  mode: PageCaptureMode;
  page: ActivePageMetadata;
  screenshot?: Blob;
  timestamp?: string;
}

interface CapturedPageRecords {
  attachment: Attachment | null;
  note: Note;
}

function defaultIdFactory(prefix: string) {
  return createStableId(prefix);
}

export function createCapturedPage({
  excerpt,
  idFactory = defaultIdFactory,
  mode,
  page,
  screenshot,
  timestamp = new Date().toISOString(),
}: CapturedPageInput): CapturedPageRecords {
  const noteId = idFactory('note');
  const attachmentId = screenshot ? idFactory('attachment') : null;
  const trimmedExcerpt = excerpt?.trim() ?? '';
  const note: Note = {
    id: noteId,
    title: page.pageTitle,
    content: {
      type: 'captured-page',
      excerpt: trimmedExcerpt,
      url: page.url,
    },
    deletedAt: null,
    plainText: [trimmedExcerpt, page.pageTitle, page.url].filter(Boolean).join('\n'),
    folderId: null,
    color: mode === 'visible' ? 'blue' : 'yellow',
    pattern: mode === 'visible' ? 'plain' : 'grid',
    pinned: false,
    favorite: mode === 'bookmark',
    source: {
      capturedAt: timestamp,
      faviconUrl: page.faviconUrl,
      pageTitle: page.pageTitle,
      screenshotAttachmentId: attachmentId ?? undefined,
      url: page.url,
    },
    tags: ['đã lưu'],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    note,
    attachment: screenshot && attachmentId
      ? {
          id: attachmentId,
          noteId,
          kind: 'capture',
          mimeType: screenshot.type || 'image/png',
          blob: screenshot,
          size: screenshot.size,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
      : null,
  };
}
