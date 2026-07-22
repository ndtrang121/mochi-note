import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bell,
  Bold,
  CalendarClock,
  Check,
  Copy,
  Italic,
  Link2,
  List,
  Pencil,
  PanelRightOpen,
  Pin,
  Plus,
  Settings,
  Share2,
  SlidersHorizontal,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent, FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { requestReminderReconciliation } from '../../browser/reminders';
import { useTransientStatus } from '../../components/hooks/useTransientStatus';
import { Brand } from '../../components/ui/Brand';
import { Button } from '../../components/ui/Button';
import { ColorSwatch } from '../../components/ui/ColorSwatch';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import { TagEditor } from '../../components/ui/TagEditor';
import type {
  Folder,
  JsonValue,
  Note,
  NoteColor,
  NotePattern,
  Reminder,
} from '../../db/models';
import { noteTagMatches } from '../../db/noteTags';
import { clearNoteDraft, loadNoteDraft, saveNoteDraft } from './noteDrafts';
import { CapturedSourceCard } from '../capture/CapturedSourceCard';
import {
  EMPTY_NOTE_FILTERS,
  NoteSearchSheet,
  type NoteFilters,
} from './NoteSearchSheet';
import {
  ReminderFields,
  reminderToDraft,
  type ReminderDraft,
} from './ReminderFields';
import { noteMatchesDateFilter } from './noteDateFilter';
import type { KeyboardCommand } from '../shortcuts/keyboardShortcuts';

const NOTE_COLORS: ReadonlyArray<{ color: NoteColor; hex: string; label: string }> = [
  { color: 'yellow', hex: '#fff0b8', label: 'Vàng' },
  { color: 'peach', hex: '#ffd8ba', label: 'Cam đào' },
  { color: 'blush', hex: '#ffcfd2', label: 'Hồng' },
  { color: 'lilac', hex: '#ead7f8', label: 'Tím' },
  { color: 'blue', hex: '#cfe3fa', label: 'Xanh lam' },
  { color: 'sage', hex: '#dcebc9', label: 'Xanh lá' },
];

const NOTE_PATTERNS: ReadonlyArray<{ label: string; pattern: NotePattern }> = [
  { pattern: 'plain', label: 'Trơn' },
  { pattern: 'grid', label: 'Ô vuông' },
  { pattern: 'dots', label: 'Chấm bi' },
  { pattern: 'lined', label: 'Dòng kẻ' },
  { pattern: 'hearts', label: 'Trái tim' },
  { pattern: 'stars', label: 'Ngôi sao' },
  { pattern: 'stripes', label: 'Sọc chéo' },
];

interface NoteFormat {
  bold: boolean;
  italic: boolean;
  list: boolean;
  underline: boolean;
}

interface ChecklistItem {
  checked: boolean;
  id: string;
  text: string;
}

interface EditableNoteDocument {
  body: string;
  checklist: ChecklistItem[];
  format: NoteFormat;
}

export interface FolderOption {
  depth: number;
  folder: Folder;
}

type NotesView =
  | { kind: 'detail'; note: Note }
  | { kind: 'editor'; note: Note | null }
  | { kind: 'list' };

interface NotesScreenProps {
  copyText?: (text: string) => Promise<void>;
  navigationTarget?: Note | null;
  onImmersiveChange: (immersive: boolean) => void;
  onOpenSettings?: () => void;
  onReturnToFolder?: () => void;
  shortcutCommand?: { command: KeyboardCommand; nonce: number } | null;
}

export interface NoteEditorProps {
  autoSave?: boolean;
  compact?: boolean;
  showFullBrand?: boolean;
  recoverDraft?: boolean;
  onOpenSidePanel?: () => void;
  onCreateNew?: () => void;
  onAutoSave?: (
    note: Note,
    reminder: ReminderDraft,
  ) => Promise<void>;
  folders: FolderOption[];
  newNoteHeading?: string;
  note: Note | null;
  onBack: () => void;
  onSave: (
    note: Note,
    reminder: ReminderDraft,
  ) => Promise<void>;
  reminder: Reminder | null;
}

interface NoteDetailProps {
  copyText: (text: string) => Promise<void>;
  folderName: string;
  note: Note;
  onBack: () => void;
  onDeletePermanently: (note: Note) => Promise<void>;
  onEdit: (note: Note) => void;
  onMoveToTrash: (note: Note) => Promise<void>;
  onRestore: (note: Note) => Promise<void>;
  onUpdate: (note: Note) => Promise<void>;
  reminder: Reminder | null;
}

const EMPTY_FORMAT: NoteFormat = {
  bold: false,
  italic: false,
  list: false,
  underline: false,
};

function createEntityId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSearchText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi');
}

function isJsonObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readBoolean(value: JsonValue | undefined) {
  return typeof value === 'boolean' ? value : false;
}

function readDocument(note: Note | null): EditableNoteDocument {
  if (!note) {
    return { body: '', checklist: [], format: { ...EMPTY_FORMAT } };
  }

  const content = note.content;
  if (isJsonObject(content) && content.type === 'note-document') {
    const rawFormat = isJsonObject(content.format) ? content.format : {};
    const checklist = Array.isArray(content.checklist)
      ? content.checklist.flatMap((item, index) => {
          if (!isJsonObject(item) || typeof item.text !== 'string') {
            return [];
          }
          return [
            {
              checked: readBoolean(item.checked),
              id: typeof item.id === 'string' ? item.id : `item-${index}`,
              text: item.text,
            },
          ];
        })
      : [];

    return {
      body: typeof content.body === 'string' ? content.body : '',
      checklist,
      format: {
        bold: readBoolean(rawFormat.bold),
        italic: readBoolean(rawFormat.italic),
        list: readBoolean(rawFormat.list),
        underline: readBoolean(rawFormat.underline),
      },
    };
  }

  if (isJsonObject(content) && content.type === 'checklist' && Array.isArray(content.items)) {
    return {
      body: '',
      checklist: content.items.flatMap((item, index) =>
        typeof item === 'string'
          ? [{ checked: false, id: `legacy-${index}`, text: item }]
          : [],
      ),
      format: { ...EMPTY_FORMAT },
    };
  }

  return {
    body: note.plainText,
    checklist: [],
    format: { ...EMPTY_FORMAT, list: isJsonObject(content) && content.type === 'bullet-list' },
  };
}

function serializeDocument(document: EditableNoteDocument): JsonValue {
  return {
    type: 'note-document',
    body: document.body,
    format: { ...document.format },
    checklist: document.checklist.map((item) => ({ ...item })),
  };
}

function notePlainText(title: string, document: EditableNoteDocument) {
  return [title, document.body, ...document.checklist.map((item) => item.text)]
    .filter(Boolean)
    .join('\n');
}

function noteBodyHeight(value: string) {
  const estimatedLines = Math.max(value.split(/\r?\n/).length, Math.ceil(value.length / 48));
  return Math.min(Math.max(estimatedLines * 20 + 16, 160), 320);
}

function resizeNoteBody(element: HTMLTextAreaElement, value: string) {
  element.style.height = 'auto';
  element.style.height = `${Math.min(Math.max(element.scrollHeight, noteBodyHeight(value)), 320)}px`;
}

function noteShareText(note: Note) {
  const document = readDocument(note);
  const checklist = document.checklist.map((item) => `${item.checked ? '☑' : '☐'} ${item.text}`);
  const tags = note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : '';
  return [note.title, tags, document.body, ...checklist].filter(Boolean).join('\n');
}

function renderBodyWithLinks(body: string) {
  return body.split(/(https?:\/\/[^\s]+)/g).map((part, index) =>
    /^https?:\/\//.test(part)
      ? <a href={part} key={`${part}-${index}`} rel="noreferrer noopener" target="_blank">{part}</a>
      : <span key={`${part}-${index}`}>{part}</span>,
  );
}

function folderOptions(folders: Folder[]) {
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
      if (visited.has(folder.id)) {
        continue;
      }
      visited.add(folder.id);
      result.push({ depth, folder });
      visit(folder.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

function relativeDate(timestamp: string) {
  const value = new Date(timestamp);
  const now = new Date();
  const difference = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()) /
      86_400_000,
  );
  if (difference <= 0) return 'Hôm nay';
  if (difference === 1) return 'Hôm qua';
  return `${difference} ngày trước`;
}

function notePreviewLines(note: Note) {
  const document = readDocument(note);
  return [
    ...document.body.split('\n'),
    ...document.checklist.map((item) => item.text),
  ]
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
}

async function defaultCopyText(text: string) {
  if (!navigator.clipboard) {
    throw new Error('Clipboard unavailable');
  }
  await navigator.clipboard.writeText(text);
}

export function NotesScreen({ copyText = defaultCopyText, navigationTarget, onImmersiveChange, onOpenSettings, onReturnToFolder, shortcutCommand }: NotesScreenProps) {
  const { errorMessage, repositories, settings, status: dataStatus } = useMochiData();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<NotesView>({ kind: 'list' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_NOTE_FILTERS);
  const [pendingDeletion, setPendingDeletion] = useState<Note | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const deferredQuery = useDeferredValue(query);
  const listLayout = settings?.layout === 'list';

  useEffect(() => {
    if (!repositories) {
      return;
    }
    let active = true;
    Promise.all([
      repositories.notes.listRecent(),
      repositories.notes.listDeleted(),
      repositories.folders.listOrdered(),
      repositories.reminders.list(),
    ])
      .then(([storedNotes, deletedNotes, storedFolders, storedReminders]) => {
        if (active) {
          setNotes([...storedNotes, ...deletedNotes]);
          setFolders(storedFolders);
          setReminders(storedReminders);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repositories]);

  useEffect(() => () => {
    if (undoTimerRef.current !== null) window.clearTimeout(undoTimerRef.current);
  }, []);

  const options = useMemo(() => folderOptions(folders), [folders]);
  const folderNames = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );
  const availableTags = useMemo(
    () => [...new Set(notes.flatMap((note) => note.tags))].sort((first, second) =>
      first.localeCompare(second, 'vi'),
    ),
    [notes],
  );
  const filteredNotes = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery.trim());
    return notes.filter((note) => {
      if (filters.trashed) {
        if (!note.deletedAt) return false;
      } else {
        if (note.deletedAt) return false;
        if (filters.archived ? !note.archivedAt : Boolean(note.archivedAt)) return false;
      }
      if (
        normalizedQuery &&
        !normalizeSearchText(`${note.title} ${note.plainText} ${note.tags.join(' ')}`).includes(normalizedQuery)
      ) {
        return false;
      }
      if (filters.folderId === 'none' && note.folderId) return false;
      if (filters.folderId && filters.folderId !== 'none' && note.folderId !== filters.folderId) {
        return false;
      }
      if (filters.color !== 'all' && note.color !== filters.color) return false;
      if (filters.tag && !note.tags.some((tag) => noteTagMatches(tag, filters.tag))) return false;
      if (!noteMatchesDateFilter(note.createdAt, filters.created)) return false;
      if (filters.pinned && !note.pinned) return false;
      return true;
    }).toSorted((first, second) => Number(second.pinned) - Number(first.pinned));
  }, [deferredQuery, filters, notes]);
  const hasActiveSearch = Boolean(
    query.trim() ||
    filters.archived ||
    filters.folderId ||
    filters.color !== 'all' ||
    filters.created !== 'all' ||
    filters.pinned ||
    filters.tag ||
    filters.trashed,
  );

  function showList() {
    setView({ kind: 'list' });
    onImmersiveChange(false);
  }

  function showEditor(note: Note | null) {
    setView({ kind: 'editor', note });
    onImmersiveChange(true);
  }

  function showDetail(note: Note) {
    setView({ kind: 'detail', note });
    onImmersiveChange(true);
  }

  useEffect(() => {
    if (!navigationTarget) return;
    const timer = window.setTimeout(() => {
      setView({ kind: 'detail', note: navigationTarget });
      onImmersiveChange(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [navigationTarget, onImmersiveChange]);

  useEffect(() => {
    if (!shortcutCommand) return;
    const timer = window.setTimeout(() => {
      if (shortcutCommand.command === 'notes-search') setSearchOpen(true);
      if (shortcutCommand.command === 'new-note') {
        setView({ kind: 'editor', note: null });
        onImmersiveChange(true);
      }
      if (shortcutCommand.command === 'close') {
        setSearchOpen(false);
        setView({ kind: 'list' });
        onImmersiveChange(false);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [shortcutCommand, onImmersiveChange]);

  async function saveNote(
    note: Note,
    reminderDraft: ReminderDraft,
  ) {
    if (!repositories) return;
    const currentReminder = reminders.find(
      (item) => item.ownerType === 'note' && item.ownerId === note.id,
    ) ?? null;
    let nextReminder: Reminder | null = null;

    if (reminderDraft.enabled && reminderDraft.localDateTime) {
      const now = new Date().toISOString();
      const scheduledTime = Date.parse(reminderDraft.localDateTime);
      if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
        throw new Error('Thời gian nhắc nhở phải ở tương lai.');
      }
      nextReminder = {
        id: currentReminder?.id ?? createEntityId('reminder'),
        ownerId: note.id,
        ownerType: 'note',
        scheduledAt: new Date(scheduledTime).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        repeatRule: reminderDraft.repeatRule,
        enabled: true,
        createdAt: currentReminder?.createdAt ?? now,
        updatedAt: now,
      };
      await Promise.all([
        repositories.notes.put(note),
        repositories.reminders.put(nextReminder),
      ]);
    } else {
      await Promise.all([
        repositories.notes.put(note),
        ...(currentReminder ? [repositories.reminders.delete(currentReminder.id)] : []),
      ]);
    }

    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    setReminders((current) => [
      ...(nextReminder ? [nextReminder] : []),
      ...current.filter((item) => item.id !== currentReminder?.id),
    ]);
    void requestReminderReconciliation();
    showDetail(note);
  }

  async function autoSaveNote(note: Note, reminderDraft: ReminderDraft) {
    if (!repositories) return;
    const currentReminder = reminders.find(
      (item) => item.ownerType === 'note' && item.ownerId === note.id,
    ) ?? null;
    const reminderTime = Date.parse(reminderDraft.localDateTime);
    const reminderIsValid = reminderDraft.enabled
      && Boolean(reminderDraft.localDateTime)
      && Number.isFinite(reminderTime)
      && reminderTime > Date.now();
    let nextReminder = currentReminder;
    if (reminderIsValid) {
      const now = new Date().toISOString();
      nextReminder = {
        id: currentReminder?.id ?? createEntityId('reminder'),
        ownerId: note.id,
        ownerType: 'note',
        scheduledAt: new Date(reminderTime).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        repeatRule: reminderDraft.repeatRule,
        enabled: true,
        createdAt: currentReminder?.createdAt ?? now,
        updatedAt: now,
      };
    } else if (!reminderDraft.enabled) {
      nextReminder = null;
    }

    await repositories.notes.put(note);
    if (nextReminder && nextReminder !== currentReminder) {
      await repositories.reminders.put(nextReminder);
    } else if (!nextReminder && currentReminder) {
      await repositories.reminders.delete(currentReminder.id);
    }
    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    setReminders((current) => [
      ...(nextReminder ? [nextReminder] : []),
      ...current.filter((item) => item.id !== currentReminder?.id),
    ]);
    void requestReminderReconciliation();
  }

  async function updateNote(note: Note) {
    if (!repositories) return;
    await repositories.notes.put(note);
    setNotes((current) => current.map((item) => (item.id === note.id ? note : item)));
    setView({ kind: 'detail', note });
  }

  function clearPendingDeletion(noteId?: string) {
    if (noteId && pendingDeletion?.id !== noteId) return;
    if (undoTimerRef.current !== null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setPendingDeletion(null);
  }

  function offerUndo(note: Note) {
    clearPendingDeletion();
    setPendingDeletion(note);
    undoTimerRef.current = window.setTimeout(() => {
      setPendingDeletion(null);
      undoTimerRef.current = null;
    }, 8_000);
  }

  async function moveNoteToTrash(note: Note) {
    if (!repositories) return;
    const trashedNote = {
      ...note,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await repositories.notes.put(trashedNote);
    setNotes((current) => current.map((item) => item.id === note.id ? trashedNote : item));
    offerUndo(trashedNote);
    void requestReminderReconciliation();
    showList();
  }

  async function restoreNote(note: Note, openDetail = true) {
    if (!repositories) return;
    const now = new Date();
    const restoredNote = { ...note, deletedAt: null, updatedAt: now.toISOString() };
    const ownerReminders = reminders.filter(
      (reminder) => reminder.ownerType === 'note' && reminder.ownerId === note.id,
    );
    const restoredReminders = ownerReminders.map((reminder) =>
      reminder.enabled && Date.parse(reminder.scheduledAt) <= now.getTime()
        ? { ...reminder, enabled: false, updatedAt: now.toISOString() }
        : reminder,
    );
    await Promise.all([
      repositories.notes.put(restoredNote),
      ...restoredReminders
        .filter((reminder, index) => reminder !== ownerReminders[index])
        .map((reminder) => repositories.reminders.put(reminder)),
    ]);
    const reminderUpdates = new Map(restoredReminders.map((reminder) => [reminder.id, reminder]));
    setReminders((current) => current.map((reminder) => reminderUpdates.get(reminder.id) ?? reminder));
    setNotes((current) => current.map((item) => item.id === note.id ? restoredNote : item));
    clearPendingDeletion(note.id);
    void requestReminderReconciliation();
    if (openDetail) showDetail(restoredNote);
  }

  async function deleteNotePermanently(note: Note) {
    if (!repositories) return;
    const linkedReminders = reminders.filter(
      (reminder) => reminder.ownerType === 'note' && reminder.ownerId === note.id,
    );
    const linkedAttachments = await repositories.attachments.listByNote(note.id);
    await Promise.all([
      repositories.notes.delete(note.id),
      ...linkedReminders.map((reminder) => repositories.reminders.delete(reminder.id)),
      ...linkedAttachments.map((attachment) => repositories.attachments.delete(attachment.id)),
    ]);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setReminders((current) => current.filter((item) => item.ownerId !== note.id));
    clearPendingDeletion(note.id);
    void requestReminderReconciliation();
    showList();
  }

  if (view.kind === 'editor') {
    return (
      <NoteEditor
        autoSave
        folders={options}
        key={view.note?.id ?? 'new-note'}
        note={view.note}
        onBack={view.note ? () => showDetail(view.note as Note) : showList}
        onAutoSave={autoSaveNote}
        onSave={saveNote}
        reminder={view.note
          ? reminders.find((item) => item.ownerType === 'note' && item.ownerId === view.note?.id) ?? null
          : null}
      />
    );
  }

  if (view.kind === 'detail') {
    return (
      <NoteDetail
        copyText={copyText}
        folderName={view.note.folderId ? (folderNames.get(view.note.folderId) ?? 'Không có') : 'Không có'}
        note={view.note}
        onBack={navigationTarget ? onReturnToFolder ?? showList : showList}
        onDeletePermanently={deleteNotePermanently}
        onEdit={showEditor}
        onMoveToTrash={moveNoteToTrash}
        onRestore={(note) => restoreNote(note)}
        onUpdate={updateNote}
        reminder={reminders.find(
          (item) => item.ownerType === 'note' && item.ownerId === view.note.id,
        ) ?? null}
      />
    );
  }

  return (
    <section className="preview-screen preview-screen--sticky notes-screen" aria-labelledby="sticky-heading">
      <header className="preview-header">
        <div className="preview-header__title">
          <Brand compact />
          <h1 className="sr-only" id="sticky-heading">Ghi chú Sticker</h1>
        </div>
        <div className="preview-header__actions">
          <IconButton aria-label="Lọc ghi chú" onClick={() => setSearchOpen(true)}>
            <SlidersHorizontal aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Cài đặt Sticker" onClick={onOpenSettings}>
            <Settings aria-hidden="true" size={18} />
          </IconButton>
        </div>
      </header>
      <p className="notes-preview-label">
        {filters.trashed
          ? `${filteredNotes.length} ghi chú trong thùng rác`
          : hasActiveSearch ? `${filteredNotes.length} kết quả` : 'Gần đây'}
      </p>
      <div className="notes-screen__list-region">
        {loading && dataStatus !== 'error' ? (
          <p className="data-screen-state">Đang tải ghi chú...</p>
        ) : null}
        {dataStatus === 'error' ? (
          <p className="data-screen-state data-screen-state--error" role="alert">
            {errorMessage ?? 'Không thể tải ghi chú.'}
          </p>
        ) : null}
        {listLayout ? (
          <div className="note-preview-list" data-testid="sticky-list">
            {filteredNotes.map((note) => (
              <button className="note-preview-row note-preview-row--button" key={note.id} onClick={() => showDetail(note)} type="button">
                <span className={`note-preview-row__dot note-preview-row__dot--${note.color}`} />
                <span className="note-preview-row__content">
                  <strong>{note.title}</strong>
                  <span>{notePreviewLines(note).join(' · ') || (note.folderId ? (folderNames.get(note.folderId) ?? 'Không có') : 'Không có')}</span>
                  {note.tags.length > 0 ? (
                    <span className="note-preview-row__tags">
                      {note.tags.slice(0, 3).map((tag) => <span className="note-tag" key={tag}>#{tag}</span>)}
                    </span>
                  ) : null}
                </span>
                <time>{relativeDate(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        ) : (
          <div className="sticky-grid" data-testid="sticky-grid">
            {filteredNotes.map((note) => (
              <button
                className={`sticky-card sticky-card--button sticky-card--${note.color}`}
                data-testid="sticky-card"
                key={note.id}
                onClick={() => showDetail(note)}
                type="button"
              >
                <span className="sticky-card__tape" aria-hidden="true" />
                {note.pinned ? <Pin className="sticky-card__pin" aria-hidden="true" fill="currentColor" size={15} /> : null}
                <h2>{note.title}</h2>
                <ul>
                  {notePreviewLines(note).map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                </ul>
                <span className="sticky-card__category">
                  {note.deletedAt ? 'Đã xóa' : note.folderId ? (folderNames.get(note.folderId) ?? 'Không có') : 'Không có'}
                </span>
                {note.tags.length > 0 ? (
                  <span className="sticky-card__tags" aria-label="Thẻ ghi chú">
                    {note.tags.slice(0, 3).map((tag) => <span className="note-tag" key={tag}>#{tag}</span>)}
                  </span>
                ) : null}
                <time>{relativeDate(note.updatedAt)}</time>
              </button>
            ))}
          </div>
        )}
        {!loading && filteredNotes.length === 0 ? (
          <p className="data-screen-state">
            {hasActiveSearch
              ? 'Không tìm thấy ghi chú phù hợp.'
              : 'Chưa có ghi chú. Hãy tạo ghi chú đầu tiên.'}
          </p>
        ) : null}
      </div>
      {searchOpen ? (
        <NoteSearchSheet
          filters={filters}
          folders={folders}
          tags={availableTags}
          onClose={() => setSearchOpen(false)}
          onFiltersChange={setFilters}
          onQueryChange={setQuery}
          query={query}
          resultCount={filteredNotes.length}
        />
      ) : null}
      {pendingDeletion ? (
        <div className="note-trash-undo" role="status">
          <span>Đã chuyển “{pendingDeletion.title}” vào thùng rác.</span>
          <button onClick={() => void restoreNote(pendingDeletion, false)} type="button">Hoàn tác</button>
        </div>
      ) : null}
      {filters.trashed ? null : <FloatingActionButton aria-label="Thêm ghi chú" onClick={() => showEditor(null)} />}
    </section>
  );
}

export function NoteEditor({ autoSave = false, compact = false, showFullBrand = false, folders, onOpenSidePanel, onCreateNew, newNoteHeading = 'Ghi chú mới', note, onBack, onAutoSave, onSave, recoverDraft = compact, reminder }: NoteEditorProps) {
  const recoveredDraft = useState(() => {
    if (!recoverDraft) return null;
    const draft = loadNoteDraft(note?.id ?? null);
    if (!draft) return null;
    if (note && draft.capturedAt <= note.updatedAt) return null;
    return draft.note;
  })[0];
  const sourceNote = recoveredDraft ?? note;
  const initialDocument = readDocument(sourceNote);
  const [draftNoteId] = useState(() => sourceNote?.id ?? createEntityId('note'));
  const [title, setTitle] = useState(sourceNote?.title ?? '');
  const [body, setBody] = useState(initialDocument.body);
  const [format, setFormat] = useState(initialDocument.format);
  const [checklist, setChecklist] = useState(initialDocument.checklist);
  const [color, setColor] = useState<NoteColor>(sourceNote?.color ?? 'yellow');
  const [pattern, setPattern] = useState<NotePattern>(sourceNote?.pattern ?? 'grid');
  const [folderId, setFolderId] = useState(sourceNote?.folderId ?? '');
  const [pinned, setPinned] = useState(sourceNote?.pinned ?? false);
  const [tags, setTags] = useState(sourceNote?.tags ?? []);
  const [reminderDraft, setReminderDraft] = useState(() => reminderToDraft(reminder));
  const [formError, setFormError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'dirty' | 'saving' | 'saved' | 'error'>('saved');
  const saveTimerRef = useRef<number | null>(null);
  const pendingAutoSaveRef = useRef<(() => void) | null>(null);
  const firstRenderRef = useRef(true);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function buildNote(timestamp = new Date().toISOString()): Note {
    const document = {
      body,
      checklist: checklist.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() })),
      format,
    };
    return {
      id: draftNoteId,
      title: title.trim(),
      content: serializeDocument(document),
      deletedAt: sourceNote?.deletedAt ?? null,
      plainText: notePlainText(title.trim(), document),
      folderId: folderId || null,
      color,
      pattern,
      pinned,
      favorite: sourceNote?.favorite ?? false,
      source: sourceNote?.source ?? null,
      tags,
      createdAt: sourceNote?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  useEffect(() => {
    if (!bodyRef.current) return;
    resizeNoteBody(bodyRef.current, body);
  }, [body]);

  useEffect(() => {
    if (!autoSave || !onAutoSave) return;
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }
    const currentNote = buildNote();
    if (!sourceNote?.id && !currentNote.plainText.trim()) return;
    saveNoteDraft(note?.id ?? null, currentNote);
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    pendingAutoSaveRef.current = () => {
      pendingAutoSaveRef.current = null;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      setSaveState('saving');
      void onAutoSave(currentNote, reminderDraft)
        .then(() => {
          clearNoteDraft(note?.id ?? null);
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    };
    saveTimerRef.current = window.setTimeout(() => pendingAutoSaveRef.current?.(), 600);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  // buildNote intentionally stays outside the dependency list so the debounce is not reset by each render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSave, body, checklist, color, folderId, format, onAutoSave, pattern, pinned, reminderDraft, sourceNote, tags, title]);

  useEffect(() => {
    if (!autoSave) return;
    const flushPendingSave = () => pendingAutoSaveRef.current?.();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushPendingSave();
    };
    window.addEventListener('pagehide', flushPendingSave);
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.removeEventListener('pagehide', flushPendingSave);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      flushPendingSave();
    };
  }, [autoSave]);
  function toggleFormat(key: keyof NoteFormat) {
    if (autoSave) setSaveState('dirty');
    setFormat((current) => ({ ...current, [key]: !current[key] }));
  }

  function addChecklistItem() {
    if (autoSave) setSaveState('dirty');
    setChecklist((current) => [
      ...current,
      { checked: false, id: createEntityId('item'), text: '' },
    ]);
  }

  function updateChecklistItem(id: string, value: Partial<ChecklistItem>) {
    if (autoSave) setSaveState('dirty');
    setChecklist((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );
  }

  function removeChecklistItem(id: string) {
    if (autoSave) setSaveState('dirty');
    setChecklist((current) => current.filter((item) => item.id !== id));
  }

  function importChecklistPaste(itemId: string, event: ReactClipboardEvent<HTMLInputElement>) {
    const pastedText = event.clipboardData.getData('text');
    if (!/[\r\n]/.test(pastedText)) return;

    event.preventDefault();
    if (autoSave) setSaveState('dirty');
    const selectionStart = event.currentTarget.selectionStart ?? event.currentTarget.value.length;
    const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
    setChecklist((current) => {
      const itemIndex = current.findIndex((item) => item.id === itemId);
      if (itemIndex < 0) return current;

      // Merge the selected input range before splitting so paste also preserves nearby text.
      const currentItem = current[itemIndex];
      const mergedText = `${currentItem.text.slice(0, selectionStart)}${pastedText}${currentItem.text.slice(selectionEnd)}`;
      const importedTexts = mergedText
        .split(/\r\n|\r|\n/)
        .map((text) => text.trim())
        .filter(Boolean);
      if (importedTexts.length === 0) return current;

      const importedItems = importedTexts.map((text, index) =>
        index === 0
          ? { ...currentItem, text }
          : { checked: false, id: createEntityId('item'), text },
      );
      return [
        ...current.slice(0, itemIndex),
        ...importedItems,
        ...current.slice(itemIndex + 1),
      ];
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const noteTitle = title.trim();
    if (!noteTitle) return;
    const reminderTime = Date.parse(reminderDraft.localDateTime);
    if (
      reminderDraft.enabled &&
      (!reminderDraft.localDateTime || !Number.isFinite(reminderTime) || reminderTime <= Date.now())
    ) {
      setFormError('Hãy chọn ngày và giờ nhắc nhở trong tương lai.');
      return;
    }
    setFormError(null);
    const nextNote = buildNote();
    try {
      await onSave(nextNote, reminderDraft);
      clearNoteDraft(note?.id ?? null);
      setSaveState('saved');
    } catch {
      setFormError('Không thể lưu ghi chú hoặc nhắc nhở. Hãy thử lại.');
    }
  }

  return (
    <section className="note-editor-screen" aria-labelledby="note-editor-heading">
      <header className="note-editor-header">
        {compact ? (
          <>
            <Brand compact={!showFullBrand} />
            <div className="note-editor-header__actions">
              {onCreateNew ? (
                <IconButton aria-label="Tạo sticky mới" onClick={onCreateNew} type="button">
                  <Plus aria-hidden="true" size={19} />
                </IconButton>
              ) : null}
              {autoSave ? (
                <IconButton
            aria-label="Lưu ghi chú"
            title={saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu' : saveState === 'error' ? 'Lưu lỗi, thử lại' : 'Chưa lưu'}
            className={`note-editor-save-status note-editor-save-status--${saveState}`}
            form="note-editor-form"
            onClick={() => {
              if (saveState === 'error') setSaveState('dirty');
            }}
            type="submit"
                >
                  <span aria-hidden="true" className="note-editor-save-status__icon"><Check size={21} /></span>
                </IconButton>
              ) : null}
              {onOpenSidePanel ? (
                <IconButton aria-label="Mở MochiNote trong Side Panel" onClick={onOpenSidePanel} type="button">
                  <PanelRightOpen aria-hidden="true" size={18} />
                </IconButton>
              ) : null}
            </div>
          </>
        ) : (
          <IconButton aria-label="Quay lại danh sách ghi chú" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={20} />
          </IconButton>
        )}
        <h1 className={compact ? 'sr-only' : undefined} id="note-editor-heading">{note ? 'Sửa ghi chú' : newNoteHeading}</h1>
        {!compact && autoSave ? (
          <IconButton
            aria-label="Lưu ghi chú"
            title={saveState === 'saved' ? 'Đã lưu' : saveState === 'saving' ? 'Đang lưu' : saveState === 'error' ? 'Lưu lỗi, thử lại' : 'Chưa lưu'}
            className={`note-editor-save-status note-editor-save-status--${saveState}`}
            form="note-editor-form"
            onClick={() => {
              if (saveState === 'error') setSaveState('dirty');
            }}
            type="submit"
          >
            <span aria-hidden="true" className="note-editor-save-status__icon"><Check size={21} /></span>
          </IconButton>
        ) : !compact ? (
          <IconButton aria-label="Lưu ghi chú" form="note-editor-form" type="submit">
            <Check aria-hidden="true" size={21} />
          </IconButton>
        ) : null}
      </header>
      {compact ? (
        <div className="popup-capture-intro">
          <p className="popup-capture-intro__title">{note ? 'Chỉnh sửa Sticky' : newNoteHeading}</p>
          <p>Lưu ý tưởng trước khi nó vụt mất.</p>
        </div>
      ) : null}
      <form id="note-editor-form" onSubmit={(event) => void submit(event)}>
        {!compact ? <div className="note-editor-colors" aria-label="Chọn màu ghi chú">
          {NOTE_COLORS.map((item) => (
            <ColorSwatch
              color={item.hex}
              key={item.color}
              label={`Màu ${item.label}`}
              onClick={() => { if (autoSave) setSaveState('dirty'); setColor(item.color); }}
              selected={color === item.color}
            />
          ))}
        </div> : null}
        {!compact ? <div className="note-editor-toolbar" aria-label="Định dạng ghi chú">
          <IconButton aria-label="Đậm" aria-pressed={format.bold} onClick={() => toggleFormat('bold')}>
            <Bold aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Nghiêng" aria-pressed={format.italic} onClick={() => toggleFormat('italic')}>
            <Italic aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Gạch chân" aria-pressed={format.underline} onClick={() => toggleFormat('underline')}>
            <Underline aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Danh sách" aria-pressed={format.list} onClick={() => toggleFormat('list')}>
            <List aria-hidden="true" size={18} />
          </IconButton>
            <IconButton aria-label="Thêm liên kết" onClick={() => { if (autoSave) setSaveState('dirty'); setBody((current) => `${current}${current ? '\\n' : ''}https://`); }}>
            <Link2 aria-hidden="true" size={18} />
          </IconButton>
        </div> : null}
        <div className={`note-editor-paper note-paper--${color} note-pattern--${pattern}`}>
          <label className="sr-only" htmlFor="note-title">Tiêu đề ghi chú</label>
          <input id="note-title" onChange={(event) => { if (autoSave) setSaveState('dirty'); setTitle(event.target.value); }} placeholder="Tiêu đề ghi chú" required value={title} />
          <label className="sr-only" htmlFor="note-body">Nội dung ghi chú</label>
          <textarea
            className={`note-body-format${format.bold ? ' note-body-format--bold' : ''}${format.italic ? ' note-body-format--italic' : ''}${format.underline ? ' note-body-format--underline' : ''}`}
            id="note-body"
            onInput={(event) => resizeNoteBody(event.currentTarget, event.currentTarget.value)}
            ref={bodyRef}
            onChange={(event) => { if (autoSave) setSaveState('dirty'); setBody(event.target.value); }}
            placeholder="Bắt đầu viết..."
            rows={4}
            style={{ height: `${noteBodyHeight(body)}px` }}
            value={body}
          />
          <div className="note-checklist-editor">
            {checklist.map((item) => (
              <div className="note-checklist-editor__row" key={item.id}>
                <input
                  aria-label={`Hoàn thành ${item.text || 'mục mới'}`}
                  checked={item.checked}
                  onChange={(event) => updateChecklistItem(item.id, { checked: event.target.checked })}
                  type="checkbox"
                />
                <input
                  aria-label="Nội dung mục checklist"
                  onChange={(event) => updateChecklistItem(item.id, { text: event.target.value })}
                  onPaste={(event) => importChecklistPaste(item.id, event)}
                  placeholder="Mục checklist"
                  value={item.text}
                />
                <IconButton aria-label={`Xóa mục ${item.text || 'mới'}`} onClick={() => removeChecklistItem(item.id)}>
                  <X aria-hidden="true" size={15} />
                </IconButton>
              </div>
            ))}
            <button className="note-add-checklist" onClick={addChecklistItem} type="button">
              <Plus aria-hidden="true" size={16} /> Thêm mục checklist
            </button>
          </div>
        </div>
        {!compact ? <Surface className="note-editor-metadata">
          <label>
            <span>Thư mục</span>
            <select onChange={(event) => { if (autoSave) setSaveState('dirty'); setFolderId(event.target.value); }} value={folderId}>
              <option value="">Không có</option>
              {folders.map(({ depth, folder }) => (
                <option key={folder.id} value={folder.id}>
                  {`${'— '.repeat(Math.min(depth + 1, 6))}${folder.name}`}
                </option>
              ))}
            </select>
          </label>
          <TagEditor onChange={(nextTags) => { if (autoSave) setSaveState('dirty'); setTags(nextTags); }} tags={tags} />
          <div className="note-editor-flags">
            <button aria-pressed={pinned} onClick={() => { if (autoSave) setSaveState('dirty'); setPinned((value) => !value); }} type="button">
              <Pin aria-hidden="true" size={17} /> Ghim
            </button>
          </div>
        </Surface> : null}
        {!compact ? <ReminderFields draft={reminderDraft} onChange={(nextDraft) => { if (autoSave) setSaveState('dirty'); setReminderDraft(nextDraft); }} /> : null}
        {formError ? <p className="note-editor-error" role="alert">{formError}</p> : null}
        {!compact ? <Surface className="note-pattern-picker">
          <strong>Họa tiết</strong>
          <div>
            {NOTE_PATTERNS.map((item) => (
              <button
                aria-label={`Họa tiết ${item.label}`}
                aria-pressed={pattern === item.pattern}
                className={`note-pattern-option note-pattern--${item.pattern}`}
                key={item.pattern}
                onClick={() => { if (autoSave) setSaveState('dirty'); setPattern(item.pattern); }}
                type="button"
              />
            ))}
          </div>
        </Surface> : null}
      </form>
    </section>
  );
}

function NoteDetail({
  copyText,
  folderName,
  note,
  onBack,
  onDeletePermanently,
  onEdit,
  onMoveToTrash,
  onRestore,
  onUpdate,
  reminder,
}: NoteDetailProps) {
  const [status, setStatus] = useTransientStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const document = readDocument(note);

  async function updateFlags(values: Partial<Pick<Note, 'pinned'>>) {
    const updated = { ...note, ...values, updatedAt: new Date().toISOString() };
    await onUpdate(updated);
  }

  async function toggleChecklist(itemId: string) {
    const nextDocument = {
      ...document,
      checklist: document.checklist.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item,
      ),
    };
    await onUpdate({
      ...note,
      content: serializeDocument(nextDocument),
      plainText: notePlainText(note.title, nextDocument),
      updatedAt: new Date().toISOString(),
    });
  }

  async function copyNote(label = 'Đã sao chép ghi chú') {
    try {
      await copyText(noteShareText(note));
      setStatus(label);
    } catch {
      setStatus('Không thể sao chép ghi chú');
    }
  }

  async function shareNote() {
    if (navigator.share) {
      try {
        await navigator.share({ title: note.title, text: noteShareText(note) });
        setStatus('Đã mở bảng chia sẻ');
        return;
      } catch {
        setStatus('Đã hủy chia sẻ');
        return;
      }
    }
    await copyNote('Đã sao chép nội dung để chia sẻ');
  }

  async function toggleArchive() {
    await onUpdate({
      ...note,
      archivedAt: note.archivedAt ? null : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    onBack();
  }

  const ArchiveIcon = note.archivedAt ? ArchiveRestore : Archive;
  return (
    <section className="note-detail-screen" aria-labelledby="note-detail-heading" data-note-id={note.id}>
      <header className="note-detail-header">
        <IconButton aria-label="Quay lại danh sách ghi chú" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={20} />
        </IconButton>
        <h1 id="note-detail-heading">Chi tiết ghi chú</h1>
        {note.deletedAt ? <span className="note-detail-header__trash">Thùng rác</span> : (
          <div>
            <IconButton aria-label={`Sửa ${note.title}`} onClick={() => onEdit(note)}>
              <Pencil aria-hidden="true" size={18} />
            </IconButton>
          </div>
        )}
      </header>
      {note.deletedAt ? (
        <Surface className="note-trash-banner">
          <Trash2 aria-hidden="true" size={18} />
          <div>
            <strong>Ghi chú đang ở trong thùng rác</strong>
            <span>Đã xóa lúc {new Date(note.deletedAt).toLocaleString('vi-VN')}</span>
          </div>
        </Surface>
      ) : null}
      <article className={`note-detail-paper note-paper--${note.color} note-pattern--${note.pattern}`}>
        <span className="note-detail-paper__tape" aria-hidden="true" />
        <h2>{note.title}</h2>
        {document.body ? (
          <p className={`note-detail-body${document.format.bold ? ' note-body-format--bold' : ''}${document.format.italic ? ' note-body-format--italic' : ''}${document.format.underline ? ' note-body-format--underline' : ''}${document.format.list ? ' note-detail-body--list' : ''}`}>
            {renderBodyWithLinks(document.body)}
          </p>
        ) : null}
        <div className="note-detail-checklist">
          {document.checklist.map((item) => (
            <button aria-pressed={item.checked} disabled={Boolean(note.deletedAt)} key={item.id} onClick={() => void toggleChecklist(item.id)} type="button">
              <span>{item.checked ? <Check aria-hidden="true" size={14} /> : null}</span>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      </article>
      <CapturedSourceCard note={note} />
      <div className="note-detail-meta">
        <span>{folderName}</span>
        <p>Được tạo: {new Date(note.createdAt).toLocaleString('vi-VN')}</p>
        <p>Cập nhật: {new Date(note.updatedAt).toLocaleString('vi-VN')}</p>
      </div>
      {note.tags.length > 0 ? (
        <div className="note-detail-tags" aria-label="Thẻ ghi chú">
          {note.tags.map((tag) => <span className="note-tag" key={tag}>#{tag}</span>)}
        </div>
      ) : null}
      {reminder?.enabled ? (
        <Surface className="note-detail-reminder">
          <Bell aria-hidden="true" size={20} />
          <div>
            <span>Nhắc nhở</span>
            <strong>{new Date(reminder.scheduledAt).toLocaleString('vi-VN')}</strong>
            <small>
              <CalendarClock aria-hidden="true" size={13} />
              {reminder.repeatRule === 'FREQ=DAILY'
                ? 'Hằng ngày'
                : reminder.repeatRule === 'FREQ=WEEKLY'
                  ? 'Hằng tuần'
                  : 'Không lặp'}
            </small>
          </div>
        </Surface>
      ) : null}
      {confirmDelete ? (
        <Surface className="note-delete-confirm" raised>
          <strong>{note.deletedAt ? 'Xóa vĩnh viễn ghi chú này?' : 'Chuyển ghi chú vào thùng rác?'}</strong>
          <p>{note.deletedAt ? 'Ghi chú, nhắc nhở và tệp đính kèm sẽ bị xóa vĩnh viễn.' : 'Bạn có thể khôi phục ghi chú từ thùng rác.'}</p>
          <div>
            <Button
              onClick={() => void (note.deletedAt ? onDeletePermanently(note) : onMoveToTrash(note))}
              size="small"
              variant="danger"
            >
              {note.deletedAt ? 'Xóa vĩnh viễn' : 'Chuyển vào thùng rác'}
            </Button>
            <Button onClick={() => setConfirmDelete(false)} size="small" variant="ghost">Hủy</Button>
          </div>
        </Surface>
      ) : null}
      {status ? <p className="data-operation-status" role="status">{status}</p> : null}
      <nav className="note-detail-actions" aria-label="Thao tác ghi chú">
        {note.deletedAt ? (
          <>
            <button onClick={() => void onRestore(note)} type="button"><ArchiveRestore aria-hidden="true" size={19} /><span>Khôi phục</span></button>
            <button onClick={() => void copyNote()} type="button"><Copy aria-hidden="true" size={19} /><span>Sao chép</span></button>
            <button onClick={() => setConfirmDelete(true)} type="button"><Trash2 aria-hidden="true" size={19} /><span>Xóa vĩnh viễn</span></button>
          </>
        ) : (
          <>
            <button onClick={() => void toggleArchive()} type="button"><ArchiveIcon aria-hidden="true" size={19} /><span>{note.archivedAt ? 'Khôi phục' : 'Lưu trữ'}</span></button>
            <button aria-pressed={note.pinned} onClick={() => void updateFlags({ pinned: !note.pinned })} type="button"><Pin aria-hidden="true" size={19} /><span>Ghim</span></button>
            <button onClick={() => void copyNote()} type="button"><Copy aria-hidden="true" size={19} /><span>Sao chép</span></button>
            <button onClick={() => void shareNote()} type="button"><Share2 aria-hidden="true" size={19} /><span>Chia sẻ</span></button>
            <button onClick={() => setConfirmDelete(true)} type="button"><Trash2 aria-hidden="true" size={19} /><span>Xóa</span></button>
          </>
        )}
      </nav>
    </section>
  );
}
