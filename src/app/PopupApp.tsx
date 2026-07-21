import { useEffect, useMemo, useRef, useState } from 'react';

import { openSidePanel } from '../browser/openSidePanel';
import { requestReminderReconciliation } from '../browser/reminders';
import { requestDriveSyncSoon } from '../sync/syncRuntime';
import type { MochiDatabase } from '../db/database';
import type { Folder, Note, Reminder } from '../db/models';
import { NoteEditor, type FolderOption } from '../features/notes/NotesScreen';
import { clearNoteDraft } from '../features/notes/noteDrafts';
import { type ReminderDraft } from '../features/notes/ReminderFields';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

interface PopupAppProps {
  databaseInitializer?: (database: MochiDatabase) => Promise<void>;
  driveSyncScheduler?: () => Promise<void>;
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

function PopupContent({ driveSyncScheduler }: Required<Pick<PopupAppProps, 'driveSyncScheduler'>>) {
  const { driveSync, errorMessage, repositories, settings, status: dataStatus } = useMochiData();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null | undefined>(undefined);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const editorSessionRef = useRef(0);
  const selectionInitializedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [panelStatus, setPanelStatus] = useState<string | null>(null);
  const [quickSyncStatus, setQuickSyncStatus] = useState<QuickNoteSyncStatus>('idle');
  const options = useMemo(() => folderOptions(folders), [folders]);

  useEffect(() => {
    if (quickSyncStatus !== 'queued' && quickSyncStatus !== 'syncing') return;
    if (driveSync.status === 'syncing') {
      setQuickSyncStatus('syncing');
      return;
    }
    if (driveSync.status === 'ready' && driveSync.lastSyncedAt) {
      setQuickSyncStatus('synced');
      return;
    }
    if (driveSync.error) setQuickSyncStatus('error');
  }, [driveSync.error, driveSync.lastSyncedAt, driveSync.status, quickSyncStatus]);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    void Promise.all([repositories.folders.listOrdered(), repositories.notes.listRecent(4)]).then(([storedFolders, storedNotes]) => {
      if (!active) return;
      setFolders(storedFolders);
      setRecentNotes(storedNotes);
      if (!selectionInitializedRef.current) {
        const latestNote = storedNotes[0] ?? null;
        selectionInitializedRef.current = true;
        setActiveNote(latestNote);
        setEditingNoteId(latestNote?.id ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, [repositories]);

  async function showSidePanel() {
    if (saving) return;
    setPanelStatus(null);
    try {
      const opened = await openSidePanel();
      if (!opened) {
        setPanelStatus('Trình duyệt này chưa hỗ trợ Side Panel.');
        return;
      }
      window.close();
    } catch {
      setPanelStatus('Không thể mở Side Panel. Hãy thử lại.');
    }
  }

  async function persistSticky(note: Note, reminderDraft: ReminderDraft, closeAfterSave: boolean, session: number) {
    if (!repositories || (closeAfterSave && saving)) return;
    if (closeAfterSave) setSaving(true);
    setQuickSyncStatus('saving-local');
    try {
      const reminderTime = Date.parse(reminderDraft.localDateTime);
      if (
        reminderDraft.enabled
        && (!reminderDraft.localDateTime || !Number.isFinite(reminderTime) || reminderTime <= Date.now())
      ) {
        throw new Error('Hãy chọn ngày và giờ nhắc nhở trong tương lai.');
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
      // The popup may close immediately, so persist the background alarm before allowing teardown.
      await driveSyncScheduler();
      setQuickSyncStatus(driveSync.status === 'ready' || driveSync.status === 'syncing' || driveSync.lastStableStatus === 'ready' ? 'queued' : 'local-saved');
      setRecentNotes(await repositories.notes.listRecent(4));
      if (session === editorSessionRef.current) setEditingNoteId(note.id);
      void requestReminderReconciliation();
      if (closeAfterSave) window.close();
    } finally {
      if (closeAfterSave) setSaving(false);
    }
  }

  async function saveSticky(note: Note, reminderDraft: ReminderDraft) {
    await persistSticky(note, reminderDraft, true, editorSessionRef.current);
  }

  async function autoSaveSticky(note: Note, reminderDraft: ReminderDraft, session: number) {
    await persistSticky(note, reminderDraft, false, session);
  }

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
          newNoteHeading="Sticky mới"
          note={selectedNote}
          onBack={() => window.close()}
          onCreateNew={() => {
            clearNoteDraft(null);
            selectionInitializedRef.current = true;
            setActiveNote(null);
            setEditingNoteId(null);
            startEditorSession();
          }}
          onAutoSave={(note, draft) => autoSaveSticky(note, draft, editorSession)}
          onOpenSidePanel={() => void showSidePanel()}
          onSave={saveSticky}
          reminder={null}
          key={`${selectedNote?.id ?? 'new-note'}-${editorSession}`}
        />
      ) : (
        <p className="popup-status" role="status">
          {dataStatus === 'error' ? errorMessage ?? 'Không thể tải MochiNote.' : 'Đang chuẩn bị Sticky...'}
        </p>
      )}
      {quickSyncStatus !== 'idle' ? (
        <p className={`popup-sync-status popup-sync-status--${quickSyncStatus}`} role="status">
          {quickSyncStatusLabel(quickSyncStatus)}
        </p>
      ) : null}
      {saving ? <p className="popup-status" role="status">Đang tạo Sticky...</p> : null}
      {panelStatus ? <p className="popup-status" role="status">{panelStatus}</p> : null}
      <section className="popup-recent-notes" aria-labelledby="popup-recent-heading">
        <h2 id="popup-recent-heading">Sticky cập nhật gần đây</h2>
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
                  <strong>{note.title || 'Sticky chưa có tiêu đề'}</strong>
                  <small>{note.plainText.split('\n').filter(Boolean).slice(1, 2).join(' ') || 'Chưa có nội dung'}</small>
                </span>
                <time dateTime={note.updatedAt}>{relativeNoteTime(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        ) : <p className="popup-recent-notes__empty">Chưa có sticky khác.</p>}
      </section>
    </main>
  );
}

function quickSyncStatusLabel(status: QuickNoteSyncStatus) {
  switch (status) {
    case 'saving-local':
      return 'Đang lưu cục bộ...';
    case 'local-saved':
      return 'Đã lưu cục bộ';
    case 'queued':
      return 'Đã lưu cục bộ, đang chờ đồng bộ Drive';
    case 'syncing':
      return 'Đang đồng bộ Drive...';
    case 'synced':
      return 'Đã đồng bộ Drive';
    case 'error':
      return 'Đã lưu cục bộ, đồng bộ Drive lỗi';
    default:
      return '';
  }
}

function relativeNoteTime(timestamp: string) {
  const elapsed = Date.now() - Date.parse(timestamp);
  if (elapsed < 60_000) return 'Vừa xong';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} phút`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} giờ`;
  return `${Math.floor(elapsed / 86_400_000)} ngày`;
}

export function PopupApp({
  databaseInitializer,
  databaseName,
  driveSyncScheduler = requestDriveSyncSoon,
}: PopupAppProps) {
  return (
    <MochiDataProvider databaseInitializer={databaseInitializer} databaseName={databaseName}>
      <PopupContent driveSyncScheduler={driveSyncScheduler} />
    </MochiDataProvider>
  );
}
