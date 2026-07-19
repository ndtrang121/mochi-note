import { describe, expect, it } from 'vitest';

import { resolveKeyboardCommand } from './keyboardShortcuts';

function shortcut(key: string, values: Partial<KeyboardEvent> = {}) {
  return resolveKeyboardCommand({
    altKey: false,
    ctrlKey: true,
    key,
    metaKey: false,
    shiftKey: false,
    target: document.body,
    ...values,
  });
}

describe('keyboard shortcuts', () => {
  it('maps note and navigation commands', () => {
    expect(shortcut('k')).toBe('notes-search');
    expect(shortcut('n')).toBe('new-note');
    expect(shortcut('t', { shiftKey: true })).toBe('tasks');
    expect(shortcut('f', { shiftKey: true })).toBe('folders');
    expect(shortcut('s', { shiftKey: true })).toBe('sticky');
    expect(shortcut('/')).toBe('help');
  });

  it('supports Escape and macOS command keys', () => {
    expect(shortcut('Escape', { ctrlKey: false })).toBe('close');
    expect(shortcut('k', { ctrlKey: false, metaKey: true })).toBe('notes-search');
  });

  it('does not hijack typing inside editable controls', () => {
    const input = document.createElement('input');
    expect(shortcut('k', { target: input })).toBeNull();
    expect(shortcut('k', { altKey: true })).toBeNull();
    expect(shortcut('x')).toBeNull();
  });
});
