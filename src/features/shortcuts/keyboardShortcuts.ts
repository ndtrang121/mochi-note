export type KeyboardCommand = 'close' | 'folders' | 'help' | 'new-note' | 'notes-search' | 'sticky' | 'tasks';

interface ShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

export function resolveKeyboardCommand(event: ShortcutEvent): KeyboardCommand | null {
  if (event.key === 'Escape') return 'close';
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.altKey || isEditableTarget(event.target)) return null;
  const key = event.key.toLocaleLowerCase();
  if (key === 'k' && !event.shiftKey) return 'notes-search';
  if (key === 'n' && !event.shiftKey) return 'new-note';
  if (key === '/' && !event.shiftKey) return 'help';
  if (event.shiftKey && key === 't') return 'tasks';
  if (event.shiftKey && key === 'f') return 'folders';
  if (event.shiftKey && key === 's') return 'sticky';
  return null;
}

export const SHORTCUT_ROWS = [
  { command: 'Tìm ghi chú', keys: 'Ctrl/⌘ K' },
  { command: 'Ghi chú mới', keys: 'Ctrl/⌘ N' },
  { command: 'Mở Tasks', keys: 'Ctrl/⌘ Shift T' },
  { command: 'Mở Folders', keys: 'Ctrl/⌘ Shift F' },
  { command: 'Mở Sticky', keys: 'Ctrl/⌘ Shift S' },
  { command: 'Trợ giúp phím tắt', keys: 'Ctrl/⌘ /' },
  { command: 'Đóng màn hình/overlay', keys: 'Esc' },
] as const;
