import { describe, expect, it } from 'vitest';

import { isQuickCaptureCommand, QUICK_CAPTURE_COMMAND } from './commands';

describe('browser command contract', () => {
  it('recognizes only the quick capture command', () => {
    expect(isQuickCaptureCommand(QUICK_CAPTURE_COMMAND)).toBe(true);
    expect(isQuickCaptureCommand('other-command')).toBe(false);
  });
});
