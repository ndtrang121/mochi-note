import {
  ArrowLeft,
  Bell,
  Bold,
  CalendarClock,
  Check,
  Copy,
  FileText,
  Folder as FolderIcon,
  Italic,
  List,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Star,
  Trash2,
  Underline,
  X,
} from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { requestReminderReconciliation } from '../../browser/reminders';
import { Button } from '../../components/ui/Button';
import { ColorSwatch } from '../../components/ui/ColorSwatch';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type {
  Folder,
  JsonValue,
  Note,
  NoteColor,
  NotePattern,
  Reminder,
} from '../../db/models';
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

interface FolderOption {
  depth: number;
  folder: Folder;
}

type NotesView =
  | { kind: 'detail'; note: Note }
  | { kind: 'editor'; note: Note | null }
  | { kind: 'list' };

interface NotesScreenProps {
  copyText?: (text: string) => Promise<void>;
  onImmersiveChange: (immersive: boolean) => void;
}

interface NoteEditorProps {
  folders: FolderOption[];
  note: Note | null;
  onBack: () => void;
  onSave: (note: Note, reminder: ReminderDraft) => Promise<void>;
  reminder: Reminder | null;
}

interface NoteDetailProps {
  copyText: (text: string) => Promise<void>;
  folderName: string;
  note: Note;
  onBack: () => void;
  onDelete: (note: Note) => Promise<void>;
  onEdit: (note: Note) => void;
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

function noteShareText(note: Note) {
  const document = readDocument(note);
  const checklist = document.checklist.map((item) => `${item.checked ? '☑' : '☐'} ${item.text}`);
  return [note.title, document.body, ...checklist].filter(Boolean).join('\n');
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

async function defaultCopyText(text: string) {
  if (!navigator.clipboard) {
    throw new Error('Clipboard unavailable');
  }
  await navigator.clipboard.writeText(text);
}

export function NotesScreen({ copyText = defaultCopyText, onImmersiveChange }: NotesScreenProps) {
  const { errorMessage, repositories, status: dataStatus } = useMochiData();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<NotesView>({ kind: 'list' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<NoteFilters>(EMPTY_NOTE_FILTERS);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!repositories) {
      return;
    }
    let active = true;
    Promise.all([
      repositories.notes.listRecent(),
      repositories.folders.listOrdered(),
      repositories.reminders.list(),
    ])
      .then(([storedNotes, storedFolders, storedReminders]) => {
        if (active) {
          setNotes(storedNotes);
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

  const options = useMemo(() => folderOptions(folders), [folders]);
  const folderNames = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );
  const filteredNotes = useMemo(() => {
    const normalizedQuery = normalizeSearchText(deferredQuery.trim());
    return notes.filter((note) => {
      if (
        normalizedQuery &&
        !normalizeSearchText(`${note.title} ${note.plainText}`).includes(normalizedQuery)
      ) {
        return false;
      }
      if (filters.folderId === 'none' && note.folderId) return false;
      if (filters.folderId && filters.folderId !== 'none' && note.folderId !== filters.folderId) {
        return false;
      }
      if (filters.color !== 'all' && note.color !== filters.color) return false;
      if (filters.pinned && !note.pinned) return false;
      if (filters.favorite && !note.favorite) return false;
      return true;
    });
  }, [deferredQuery, filters, notes]);
  const hasActiveSearch = Boolean(
    query.trim() ||
    filters.folderId ||
    filters.color !== 'all' ||
    filters.pinned ||
    filters.favorite,
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

  async function saveNote(note: Note, reminderDraft: ReminderDraft) {
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
      await repositories.notes.put(note);
      if (currentReminder) {
        await repositories.reminders.delete(currentReminder.id);
      }
    }

    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    setReminders((current) => [
      ...(nextReminder ? [nextReminder] : []),
      ...current.filter((item) => item.id !== currentReminder?.id),
    ]);
    void requestReminderReconciliation();
    showDetail(note);
  }

  async function updateNote(note: Note) {
    if (!repositories) return;
    await repositories.notes.put(note);
    setNotes((current) => current.map((item) => (item.id === note.id ? note : item)));
    setView({ kind: 'detail', note });
  }

  async function deleteNote(note: Note) {
    if (!repositories) return;
    const linkedReminders = reminders.filter(
      (reminder) => reminder.ownerType === 'note' && reminder.ownerId === note.id,
    );
    await Promise.all([
      repositories.notes.delete(note.id),
      ...linkedReminders.map((reminder) => repositories.reminders.delete(reminder.id)),
    ]);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setReminders((current) => current.filter((item) => item.ownerId !== note.id));
    void requestReminderReconciliation();
    showList();
  }

  if (view.kind === 'editor') {
    return (
      <NoteEditor
        folders={options}
        key={view.note?.id ?? 'new-note'}
        note={view.note}
        onBack={view.note ? () => showDetail(view.note as Note) : showList}
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
        onBack={showList}
        onDelete={deleteNote}
        onEdit={showEditor}
        onUpdate={updateNote}
        reminder={reminders.find(
          (item) => item.ownerType === 'note' && item.ownerId === view.note.id,
        ) ?? null}
      />
    );
  }

  return (
    <section className="preview-screen notes-screen" aria-labelledby="notes-heading">
      <header className="preview-header">
        <div className="preview-header__title">
          <span className="notes-heading-icon">
            <FileText aria-hidden="true" size={19} />
          </span>
          <h1 id="notes-heading">Ghi chú</h1>
        </div>
        <div className="preview-header__actions">
          <IconButton aria-label="Tìm kiếm ghi chú" onClick={() => setSearchOpen(true)}>
            <Search aria-hidden="true" size={19} />
          </IconButton>
          <IconButton aria-label="Lọc ghi chú" onClick={() => setSearchOpen(true)}>
            <SlidersHorizontal aria-hidden="true" size={18} />
          </IconButton>
        </div>
      </header>
      <button
        className="notes-search-preview"
        onClick={() => setSearchOpen(true)}
        type="button"
      >
        <Search aria-hidden="true" size={17} />
        <span>{query.trim() || 'Tìm kiếm ghi chú...'}</span>
        {hasActiveSearch ? <strong>{filteredNotes.length}</strong> : null}
      </button>
      <p className="notes-preview-label">
        {hasActiveSearch ? `${filteredNotes.length} kết quả` : 'Gần đây'}
      </p>
      {loading && dataStatus !== 'error' ? (
        <p className="data-screen-state">Đang tải ghi chú...</p>
      ) : null}
      {dataStatus === 'error' ? (
        <p className="data-screen-state data-screen-state--error" role="alert">
          {errorMessage ?? 'Không thể tải ghi chú.'}
        </p>
      ) : null}
      <div className="note-preview-list">
        {filteredNotes.map((note) => (
          <button className="note-preview-row note-preview-row--button" key={note.id} onClick={() => showDetail(note)} type="button">
            <span className={`note-preview-row__dot note-preview-row__dot--${note.color}`} />
            <span className="note-preview-row__content">
              <strong>{note.title}</strong>
              <span>{note.folderId ? (folderNames.get(note.folderId) ?? 'Không có') : 'Không có'}</span>
            </span>
            <time>{relativeDate(note.updatedAt)}</time>
          </button>
        ))}
      </div>
      {!loading && filteredNotes.length === 0 ? (
        <p className="data-screen-state">
          {hasActiveSearch
            ? 'Không tìm thấy ghi chú phù hợp.'
            : 'Chưa có ghi chú. Hãy tạo ghi chú đầu tiên.'}
        </p>
      ) : null}
      {searchOpen ? (
        <NoteSearchSheet
          filters={filters}
          folders={folders}
          onClose={() => setSearchOpen(false)}
          onFiltersChange={setFilters}
          onQueryChange={setQuery}
          query={query}
          resultCount={filteredNotes.length}
        />
      ) : null}
      <FloatingActionButton aria-label="Thêm ghi chú" onClick={() => showEditor(null)} />
    </section>
  );
}

function NoteEditor({ folders, note, onBack, onSave, reminder }: NoteEditorProps) {
  const initialDocument = readDocument(note);
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(initialDocument.body);
  const [format, setFormat] = useState(initialDocument.format);
  const [checklist, setChecklist] = useState(initialDocument.checklist);
  const [color, setColor] = useState<NoteColor>(note?.color ?? 'yellow');
  const [pattern, setPattern] = useState<NotePattern>(note?.pattern ?? 'grid');
  const [folderId, setFolderId] = useState(note?.folderId ?? '');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [favorite, setFavorite] = useState(note?.favorite ?? false);
  const [reminderDraft, setReminderDraft] = useState(() => reminderToDraft(reminder));
  const [formError, setFormError] = useState<string | null>(null);

  function toggleFormat(key: keyof NoteFormat) {
    setFormat((current) => ({ ...current, [key]: !current[key] }));
  }

  function addChecklistItem() {
    setChecklist((current) => [
      ...current,
      { checked: false, id: createEntityId('item'), text: '' },
    ]);
  }

  function updateChecklistItem(id: string, value: Partial<ChecklistItem>) {
    setChecklist((current) =>
      current.map((item) => (item.id === id ? { ...item, ...value } : item)),
    );
  }

  function removeChecklistItem(id: string) {
    setChecklist((current) => current.filter((item) => item.id !== id));
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
    const now = new Date().toISOString();
    const document = {
      body: body.trim(),
      checklist: checklist.filter((item) => item.text.trim()).map((item) => ({ ...item, text: item.text.trim() })),
      format,
    };
    try {
      await onSave({
        id: note?.id ?? createEntityId('note'),
        title: noteTitle,
        content: serializeDocument(document),
        plainText: notePlainText(noteTitle, document),
        folderId: folderId || null,
        color,
        pattern,
        pinned,
        favorite,
        source: note?.source ?? null,
        createdAt: note?.createdAt ?? now,
        updatedAt: now,
      }, reminderDraft);
    } catch {
      setFormError('Không thể lưu ghi chú hoặc nhắc nhở. Hãy thử lại.');
    }
  }

  return (
    <section className="note-editor-screen" aria-labelledby="note-editor-heading">
      <header className="note-editor-header">
        <IconButton aria-label="Quay lại danh sách ghi chú" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={20} />
        </IconButton>
        <h1 id="note-editor-heading">{note ? 'Sửa ghi chú' : 'Ghi chú mới'}</h1>
        <IconButton aria-label="Lưu ghi chú" form="note-editor-form" type="submit">
          <Check aria-hidden="true" size={21} />
        </IconButton>
      </header>
      <form id="note-editor-form" onSubmit={(event) => void submit(event)}>
        <div className="note-editor-colors" aria-label="Chọn màu ghi chú">
          {NOTE_COLORS.map((item) => (
            <ColorSwatch
              color={item.hex}
              key={item.color}
              label={`Màu ${item.label}`}
              onClick={() => setColor(item.color)}
              selected={color === item.color}
            />
          ))}
        </div>
        <div className="note-editor-toolbar" aria-label="Định dạng ghi chú">
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
        </div>
        <div className={`note-editor-paper note-paper--${color} note-pattern--${pattern}`}>
          <label className="sr-only" htmlFor="note-title">Tiêu đề ghi chú</label>
          <input id="note-title" onChange={(event) => setTitle(event.target.value)} placeholder="Tiêu đề ghi chú" required value={title} />
          <label className="sr-only" htmlFor="note-body">Nội dung ghi chú</label>
          <textarea
            className={`note-body-format${format.bold ? ' note-body-format--bold' : ''}${format.italic ? ' note-body-format--italic' : ''}${format.underline ? ' note-body-format--underline' : ''}`}
            id="note-body"
            onChange={(event) => setBody(event.target.value)}
            placeholder="Bắt đầu viết..."
            rows={4}
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
        <Surface className="note-editor-metadata">
          <label>
            <span>Thư mục</span>
            <select onChange={(event) => setFolderId(event.target.value)} value={folderId}>
              <option value="">Không có</option>
              {folders.map(({ depth, folder }) => (
                <option key={folder.id} value={folder.id}>
                  {`${'— '.repeat(Math.min(depth + 1, 6))}${folder.name}`}
                </option>
              ))}
            </select>
          </label>
          <div className="note-editor-flags">
            <button aria-pressed={pinned} onClick={() => setPinned((value) => !value)} type="button">
              <Pin aria-hidden="true" size={17} /> Ghim
            </button>
            <button aria-pressed={favorite} onClick={() => setFavorite((value) => !value)} type="button">
              <Star aria-hidden="true" fill={favorite ? 'currentColor' : 'none'} size={17} /> Yêu thích
            </button>
          </div>
        </Surface>
        <ReminderFields draft={reminderDraft} onChange={setReminderDraft} />
        {formError ? <p className="note-editor-error" role="alert">{formError}</p> : null}
        <Surface className="note-pattern-picker">
          <strong>Họa tiết</strong>
          <div>
            {NOTE_PATTERNS.map((item) => (
              <button
                aria-label={`Họa tiết ${item.label}`}
                aria-pressed={pattern === item.pattern}
                className={`note-pattern-option note-pattern--${item.pattern}`}
                key={item.pattern}
                onClick={() => setPattern(item.pattern)}
                type="button"
              />
            ))}
          </div>
        </Surface>
      </form>
    </section>
  );
}

function NoteDetail({
  copyText,
  folderName,
  note,
  onBack,
  onDelete,
  onEdit,
  onUpdate,
  reminder,
}: NoteDetailProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const document = readDocument(note);

  async function updateFlags(values: Partial<Pick<Note, 'favorite' | 'pinned'>>) {
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

  return (
    <section className="note-detail-screen" aria-labelledby="note-detail-heading">
      <header className="note-detail-header">
        <IconButton aria-label="Quay lại danh sách ghi chú" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={20} />
        </IconButton>
        <h1 id="note-detail-heading">Chi tiết ghi chú</h1>
        <div>
          <IconButton aria-label={`Sửa ${note.title}`} onClick={() => onEdit(note)}>
            <Pencil aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Thêm tùy chọn ghi chú">
            <MoreHorizontal aria-hidden="true" size={20} />
          </IconButton>
        </div>
      </header>
      <article className={`note-detail-paper note-paper--${note.color} note-pattern--${note.pattern}`}>
        <span className="note-detail-paper__tape" aria-hidden="true" />
        <h2>{note.title}</h2>
        {document.body ? (
          <p className={`note-detail-body${document.format.bold ? ' note-body-format--bold' : ''}${document.format.italic ? ' note-body-format--italic' : ''}${document.format.underline ? ' note-body-format--underline' : ''}${document.format.list ? ' note-detail-body--list' : ''}`}>
            {document.body}
          </p>
        ) : null}
        <div className="note-detail-checklist">
          {document.checklist.map((item) => (
            <button aria-pressed={item.checked} key={item.id} onClick={() => void toggleChecklist(item.id)} type="button">
              <span>{item.checked ? <Check aria-hidden="true" size={14} /> : null}</span>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      </article>
      <div className="note-detail-meta">
        <button aria-label={`${note.favorite ? 'Bỏ yêu thích' : 'Yêu thích'} ${note.title}`} aria-pressed={note.favorite} onClick={() => void updateFlags({ favorite: !note.favorite })} type="button">
          <Star aria-hidden="true" fill={note.favorite ? 'currentColor' : 'none'} size={18} />
        </button>
        <span>{folderName}</span>
        <p>Được tạo: {new Date(note.createdAt).toLocaleString('vi-VN')}</p>
        <p>Cập nhật: {new Date(note.updatedAt).toLocaleString('vi-VN')}</p>
      </div>
      <Surface className="note-detail-folder">
        <FolderIcon aria-hidden="true" size={20} />
        <div><span>Thư mục</span><strong>{folderName}</strong></div>
      </Surface>
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
          <strong>Xóa ghi chú này?</strong>
          <p>Thao tác này không thể hoàn tác.</p>
          <div>
            <Button onClick={() => void onDelete(note)} size="small" variant="danger">Xóa ghi chú</Button>
            <Button onClick={() => setConfirmDelete(false)} size="small" variant="ghost">Hủy</Button>
          </div>
        </Surface>
      ) : null}
      {status ? <p className="data-operation-status" role="status">{status}</p> : null}
      <nav className="note-detail-actions" aria-label="Thao tác ghi chú">
        <button aria-pressed={note.pinned} onClick={() => void updateFlags({ pinned: !note.pinned })} type="button"><Pin aria-hidden="true" size={19} /><span>Ghim</span></button>
        <button onClick={() => void copyNote()} type="button"><Copy aria-hidden="true" size={19} /><span>Sao chép</span></button>
        <button onClick={() => void shareNote()} type="button"><Share2 aria-hidden="true" size={19} /><span>Chia sẻ</span></button>
        <button onClick={() => setConfirmDelete(true)} type="button"><Trash2 aria-hidden="true" size={19} /><span>Xóa</span></button>
      </nav>
    </section>
  );
}
