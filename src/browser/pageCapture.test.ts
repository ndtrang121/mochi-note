import { describe, expect, it } from 'vitest';

import { activePageFromTab, isCapturePageMessage } from './pageCapture';

describe('page capture browser contracts', () => {
  it('normalizes complete active-tab metadata', () => {
    expect(activePageFromTab({
      favIconUrl: 'https://example.com/favicon.ico',
      id: 12,
      title: 'Example page',
      url: 'https://example.com/article',
      windowId: 4,
    })).toEqual({
      faviconUrl: 'https://example.com/favicon.ico',
      pageTitle: 'Example page',
      tabId: 12,
      url: 'https://example.com/article',
      windowId: 4,
    });
    expect(activePageFromTab({ id: 12, windowId: 4 })).toBeNull();
  });

  it('validates versioned capture messages and modes', () => {
    expect(isCapturePageMessage({
      mode: 'visible',
      type: 'capture:create',
      version: 1,
    })).toBe(true);
    expect(isCapturePageMessage({
      mode: 'full-page',
      type: 'capture:create',
      version: 1,
    })).toBe(false);
  });
});
