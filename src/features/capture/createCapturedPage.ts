import type { Note } from '../../db/models';
import type { ActivePageMetadata } from '../../browser/pageCapture';

interface CapturedPageInput {
  excerpt?: string;
  idFactory?: (prefix: string) => string;
  page: ActivePageMetadata;
  timestamp?: string;
}

function defaultIdFactory(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createCapturedPage({
  excerpt,
  idFactory = defaultIdFactory,
  page,
  timestamp = new Date().toISOString(),
}: CapturedPageInput): Note {
  const noteId = idFactory('note');
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
    color: 'yellow',
    pattern: 'grid',
    pinned: false,
    favorite: true,
    source: {
      capturedAt: timestamp,
      faviconUrl: page.faviconUrl,
      pageTitle: page.pageTitle,
      url: page.url,
    },
    tags: ['đã lưu'],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return note;
}
