import { describe, expect, it } from 'vitest';

import { createCapturedPage } from './createCapturedPage';

const page = {
  faviconUrl: 'https://example.com/favicon.ico',
  pageTitle: 'Example article',
  tabId: 12,
  url: 'https://example.com/article',
  windowId: 4,
};

describe('createCapturedPage', () => {
  it('creates a lightweight metadata bookmark', () => {
    const records = createCapturedPage({
      idFactory: (prefix) => `${prefix}-test`,
      mode: 'bookmark',
      page,
      timestamp: '2026-07-19T04:00:00.000Z',
    });

    expect(records.attachment).toBeNull();
    expect(records.note).toMatchObject({
      id: 'note-test',
      favorite: true,
      source: { pageTitle: page.pageTitle, url: page.url },
    });
  });

  it('links a visible-viewport PNG attachment to the captured note', () => {
    const screenshot = new Blob(['png'], { type: 'image/png' });
    let sequence = 0;
    const records = createCapturedPage({
      excerpt: 'Selected paragraph',
      idFactory: (prefix) => `${prefix}-${sequence++}`,
      mode: 'visible',
      page,
      screenshot,
      timestamp: '2026-07-19T04:00:00.000Z',
    });

    expect(records.note.source?.screenshotAttachmentId).toBe('attachment-1');
    expect(records.note.plainText).toContain('Selected paragraph');
    expect(records.attachment).toMatchObject({
      id: 'attachment-1',
      kind: 'capture',
      mimeType: 'image/png',
      noteId: 'note-0',
      size: 3,
    });
    expect(records.note.source?.screenshotAttachmentId).toBe(records.attachment?.id);
  });
});
