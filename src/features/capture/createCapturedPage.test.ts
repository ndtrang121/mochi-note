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
  it('creates a text-only metadata bookmark', () => {
    const note = createCapturedPage({
      excerpt: 'Selected paragraph',
      idFactory: (prefix) => `${prefix}-test`,
      page,
      timestamp: '2026-07-19T04:00:00.000Z',
    });

    expect(note).toMatchObject({
      favorite: true,
      id: 'note-test',
      plainText: 'Selected paragraph\nExample article\nhttps://example.com/article',
      source: { pageTitle: page.pageTitle, url: page.url },
    });
  });
});
