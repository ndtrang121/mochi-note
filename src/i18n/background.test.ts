import { describe, expect, it } from 'vitest';

import { createLocaleChangedMessage, isLocaleChangedMessage, tBackground } from './background';

describe('background localization helpers', () => {
  it('creates and detects locale change messages', () => {
    const message = createLocaleChangedMessage('en-US');
    expect(isLocaleChangedMessage(message)).toBe(true);
    expect(message.locale).toBe('en-US');
  });

  it('translates background copy by locale', () => {
    expect(tBackground('vi', 'background.context.capturePage')).toBe('Lưu trang vào MochiNote');
    expect(tBackground('en-US', 'background.context.capturePage')).toBe('Save page to MochiNote');
  });
});
