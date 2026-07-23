import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { openSidePanel } from '../browser/openSidePanel';
import { requestReminderReconciliation } from '../browser/reminders';
import type { MochiDatabase } from '../db/database';
import type { Folder, Note, Reminder } from '../db/models';
import { NoteEditor, type FolderOption } from '../features/notes/NotesScreen';
import { clearNoteDraft } from '../features/notes/noteDrafts';
import { type ReminderDraft } from '../features/notes/ReminderFields';
import { I18nProvider, useI18n } from '../i18n/I18nProvider';
import { settingsLocaleToAppLocale } from '../i18n/locale';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

interface PopupAppProps {
  databaseInitializer?: (database: MochiDatabase) => Promise<void | boolean>;
  databaseName?: string;
}

function createEntityId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function folderOptions(folders: Folder[]): FolderOption[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const parentId = folder.parentId ?? null;
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), folder]);
  }

  const result: FolderOption[] = [];
  const visited = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    const siblings = [...(byParent.get(parentId) ?? [])].sort(
      (first, second) => first.position - second.position,
    );
    for (const folder of siblings) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      result.push({ depth, folder });
      visit(folder.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

function PopupContentInner() {
  const { t } = useI18n();
  const { dataRevision, errorMessage, repositories, settings, status: dataStatus } = useMochiData();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null | undefined>(undefined);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const editorSessionRef = useRef(0);
  const selectionInitializedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [panelStatus, setPanelStatus] = useState<string | null>(null);
  const options = useMemo(() => folderOptions(folders), [folders]);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    void Promise.all([repositories.folders.listOrdered(), repositories.notes.listRecent(4)]).then(([storedFolders, storedNotes]) => {
      if (!active) return;
      setFolders(storedFolders);
      setRecentNotes(storedNotes);
      if (!selectionInitializedRef.current) {
        const latestNote = storedNotes[0] ?? null;
        // Keep waiting when the account cache is initially empty so the first cloud pull can restore the latest Sticky.
        selectionInitializedRef.current = Boolean(latestNote);
        setActiveNote(latestNote);
        setEditingNoteId(latestNote?.id ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [dataRevision, repositories]);

  async function showSidePanel() {
    if (saving) return;
    setPanelStatus(null);
    try {
      const opened = await openSidePanel();
      if (!opened) {
        setPanelStatus(t('popup.sidePanelUnsupported'));
        return;
      }
      window.close();
    } catch {
      setPanelStatus(t('popup.sidePanelOpenError'));
    }
  }

  const persistSticky = useCallback(async (
    note: Note,
    reminderDraft: ReminderDraft,
    closeAfterSave: boolean,
    session: number,
  ) => {
    if (!repositories || (closeAfterSave && saving)) return;
    if (closeAfterSave) setSaving(true);
    try {
      const reminderTime = Date.parse(reminderDraft.localDateTime);
      if (
        reminderDraft.enabled
        && (!reminderDraft.localDateTime || !Number.isFinite(reminderTime) || reminderTime <= Date.now())
      ) {
        throw new Error(t('popup.reminderFutureRequired'));
      }

      if (reminderDraft.enabled) {
        const now = new Date().toISOString();
        const reminder: Reminder = {
          id: createEntityId('reminder'),
          ownerId: note.id,
          ownerType: 'note',
          scheduledAt: new Date(reminderTime).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
          repeatRule: reminderDraft.repeatRule,
          enabled: true,
          createdAt: now,
          updatedAt: now,
        };
        await Promise.all([repositories.notes.put(note), repositories.reminders.put(reminder)]);
      } else {
        await repositories.notes.put(note);
      }
      setRecentNotes(await repositories.notes.listRecent(4));
      if (session === editorSessionRef.current) setEditingNoteId(note.id);
      void requestReminderReconciliation();
      if (closeAfterSave) window.close();
    } finally {
      if (closeAfterSave) setSaving(false);
    }
  }, [repositories, saving, t]);

  const saveSticky = useCallback(async (note: Note, reminderDraft: ReminderDraft) => {
    await persistSticky(note, reminderDraft, true, editorSessionRef.current);
  }, [persistSticky]);

  const handleAutoSave = useCallback(async (note: Note, reminderDraft: ReminderDraft) => {
    await persistSticky(note, reminderDraft, false, editorSession);
  }, [editorSession, persistSticky]);
  const selectedNote = activeNote ?? null;
  const recentItems = recentNotes.filter((note) => note.id !== editingNoteId).slice(0, 3);

  function startEditorSession() {
    editorSessionRef.current += 1;
    setEditorSession(editorSessionRef.current);
  }

  return (
    <main className="popup-sticky-app" data-theme={settings?.theme ?? 'system'}>
      {repositories && activeNote !== undefined ? (
        <NoteEditor
          autoSave
          compact
          showFullBrand
          folders={options}
          newNoteHeading={t('popup.newSticky')}
          note={selectedNote}
          onBack={() => window.close()}
          onCreateNew={() => {
            clearNoteDraft(null);
            selectionInitializedRef.current = true;
            setActiveNote(null);
            setEditingNoteId(null);
            startEditorSession();
          }}
          onAutoSave={handleAutoSave}
          onOpenSidePanel={() => void showSidePanel()}
          onSave={saveSticky}
          reminder={null}
          key={`${selectedNote?.id ?? 'new-note'}-${editorSession}`}
        />
      ) : (
        <p className="popup-status" role="status">
          {dataStatus === 'error' ? errorMessage ?? t('app.loadError') : t('app.loading')}
        </p>
      )}
      {saving ? <p className="popup-status" role="status">{t('popup.creatingSticky')}</p> : null}
      {panelStatus ? <p className="popup-status" role="status">{panelStatus}</p> : null}
      <section className="popup-recent-notes" aria-labelledby="popup-recent-heading">
        <h2 id="popup-recent-heading">{t('popup.recentHeading')}</h2>
        {recentItems.length > 0 ? (
          <div className="popup-recent-notes__list">
            {recentItems.map((note) => (
              <button
                className="popup-recent-note"
                key={note.id}
                onClick={() => {
                  selectionInitializedRef.current = true;
                  setActiveNote(note);
                  setEditingNoteId(note.id);
                  startEditorSession();
                }}
                type="button"
              >
                <span aria-hidden="true" className={`popup-recent-note__dot popup-recent-note__dot--${note.color}`} />
                <span className="popup-recent-note__content">
                  <strong>{note.title || t('app.untitledSticky')}</strong>
                  <small>{note.plainText.split('\n').filter(Boolean).slice(1, 2).join(' ') || t('app.noContent')}</small>
                </span>
                <time dateTime={note.updatedAt}>{relativeNoteTime(note.updatedAt, t)}</time>
              </button>
            ))}
          </div>
        ) : <p className="popup-recent-notes__empty">{t('popup.emptyRecent')}</p>}
      </section>
    </main>
  );
}

function relativeNoteTime(timestamp: string, t: ReturnType<typeof useI18n>['t']) {
  const elapsed = Date.now() - Date.parse(timestamp);
  if (elapsed < 60_000) return t('app.justNow');
  if (elapsed < 3_600_000) return t('app.minuteShort', { count: Math.floor(elapsed / 60_000) });
  if (elapsed < 86_400_000) return t('app.hourShort', { count: Math.floor(elapsed / 3_600_000) });
  return t('app.dayShort', { count: Math.floor(elapsed / 86_400_000) });
}

function PopupContent() {
  const { settings } = useMochiData();
  return (
    <I18nProvider locale={settingsLocaleToAppLocale(settings?.locale)}>
      <PopupContentInner />
    </I18nProvider>
  );
}

export function PopupApp({ databaseInitializer, databaseName }: PopupAppProps) {
  return (
    <MochiDataProvider databaseInitializer={databaseInitializer} databaseName={databaseName}>
      <PopupContent />
    </MochiDataProvider>
  );
}
