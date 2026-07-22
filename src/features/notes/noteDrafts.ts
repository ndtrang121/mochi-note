import type { Note } from '../../db/models';

const DRAFT_PREFIX = 'mochi-note:draft:';

export interface NoteDraftSnapshot {
  capturedAt: string;
  note: Note;
}

function draftKey(noteId: string | null) {
  return `${DRAFT_PREFIX}${noteId ?? 'new-note'}`;
}

export function loadNoteDraft(noteId: string | null): NoteDraftSnapshot | null {
  try {
    const raw = window.localStorage.getItem(draftKey(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NoteDraftSnapshot>;
    if (!parsed.note || typeof parsed.capturedAt !== 'string') return null;
    return parsed as NoteDraftSnapshot;
  } catch {
    return null;
  }
}

export function saveNoteDraft(noteId: string | null, note: Note): NoteDraftSnapshot | null {
  const snapshot: NoteDraftSnapshot = {
    capturedAt: new Date().toISOString(),
    note,
  };
  try {
    window.localStorage.setItem(draftKey(noteId), JSON.stringify(snapshot));
    return snapshot;
  } catch {
    return null;
  }
}

export function clearNoteDraft(noteId: string | null) {
  try {
    window.localStorage.removeItem(draftKey(noteId));
  } catch {
    // Draft recovery is best effort; the canonical IndexedDB save remains authoritative.
  }
}
