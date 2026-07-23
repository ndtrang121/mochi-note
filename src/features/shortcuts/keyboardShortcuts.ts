import type { MessageKey } from '../../i18n/messages';

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

export const SHORTCUT_ROWS: Array<{ commandKey: MessageKey; keys: string }> = [
  { commandKey: 'shortcut.searchNotes', keys: 'Ctrl/⌘ K' },
  { commandKey: 'shortcut.newNote', keys: 'Ctrl/⌘ N' },
  { commandKey: 'shortcut.openTasks', keys: 'Ctrl/⌘ Shift T' },
  { commandKey: 'shortcut.openFolders', keys: 'Ctrl/⌘ Shift F' },
  { commandKey: 'shortcut.openSticky', keys: 'Ctrl/⌘ Shift S' },
  { commandKey: 'shortcut.help', keys: 'Ctrl/⌘ /' },
  { commandKey: 'shortcut.close', keys: 'Esc' },
];
