import { afterEach, describe, expect, it } from 'vitest';

import type { Note } from '../../db/models';
import { clearNoteDraft, loadNoteDraft, saveNoteDraft } from './noteDrafts';

const note: Note = {
  id: 'note-draft-test',
  title: 'Draft test',
  content: { type: 'note-document', body: 'Remember this', format: {}, checklist: [] },
  plainText: 'Draft test\nRemember this',
  color: 'yellow',
  pattern: 'plain',
  folderId: null,
  pinned: false,
  favorite: false,
  source: null,
  tags: [],
  deletedAt: null,
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:01:00.000Z',
};

describe('sticky draft recovery', () => {
  afterEach(() => window.localStorage.clear());

  it('round-trips a draft snapshot and clears it after canonical save', () => {
    const snapshot = saveNoteDraft(null, note);

    expect(snapshot?.note).toEqual(note);
    expect(loadNoteDraft(null)?.note).toEqual(note);

    clearNoteDraft(null);
    expect(loadNoteDraft(null)).toBeNull();
  });

  it('keeps drafts isolated by note id', () => {
    saveNoteDraft(null, note);
    saveNoteDraft(note.id, { ...note, title: 'Existing note draft' });

    expect(loadNoteDraft(null)?.note.title).toBe('Draft test');
    expect(loadNoteDraft(note.id)?.note.title).toBe('Existing note draft');
  });
});
