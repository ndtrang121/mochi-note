export type PageCaptureMode = 'bookmark' | 'visible';

export interface ActivePageMetadata {
  faviconUrl?: string;
  pageTitle: string;
  tabId: number;
  url: string;
  windowId: number;
}

export interface CapturePageMessage {
  mode: PageCaptureMode;
  type: 'capture:create';
  version: 1;
}

export type CapturePageResult =
  | { noteId: string; ok: true }
  | { error: string; ok: false };

export function isCapturePageMessage(value: unknown): value is CapturePageMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Partial<CapturePageMessage>;
  return (
    message.type === 'capture:create' &&
    message.version === 1 &&
    (message.mode === 'bookmark' || message.mode === 'visible')
  );
}

export function activePageFromTab(tab: {
  favIconUrl?: string;
  id?: number;
  title?: string;
  url?: string;
  windowId?: number;
}): ActivePageMetadata | null {
  if (
    typeof tab.id !== 'number' ||
    typeof tab.windowId !== 'number' ||
    !tab.url ||
    !tab.title
  ) {
    return null;
  }

  return {
    faviconUrl: tab.favIconUrl,
    pageTitle: tab.title,
    tabId: tab.id,
    url: tab.url,
    windowId: tab.windowId,
  };
}

export async function getActivePageMetadata() {
  if (typeof browser === 'undefined' || !browser.tabs) {
    return null;
  }

  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab ? activePageFromTab(tab) : null;
}

export async function requestPageCapture(mode: PageCaptureMode): Promise<CapturePageResult> {
  if (typeof browser === 'undefined' || !browser.runtime?.id) {
    return { error: 'Chụp trang chỉ hoạt động khi mở MochiNote extension.', ok: false };
  }

  try {
    const message: CapturePageMessage = { mode, type: 'capture:create', version: 1 };
    return await browser.runtime.sendMessage(message);
  } catch {
    return { error: 'Chưa thể chụp trang hiện tại.', ok: false };
  }
}
