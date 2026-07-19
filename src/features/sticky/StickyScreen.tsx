import {
  Grid2X2,
  Menu,
  MoreVertical,
  Pencil,
  Search,
  Settings,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type { Folder, JsonValue, Note, NoteColor } from '../../db/models';

const NOTE_COLORS: readonly NoteColor[] = ['yellow', 'peach', 'blush', 'lilac', 'blue', 'sage'];

function createNoteId() {
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function noteLines(note: Note) {
  const content = note.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const items = content.items;
    if (Array.isArray(items)) {
      const textItems = items.filter((item): item is string => typeof item === 'string');
      if (textItems.length > 0) {
        return textItems.slice(0, 4);
      }
    }
  }

  return note.plainText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function relativeTime(timestamp: string) {
  const updated = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const updatedDay = new Date(
    updated.getFullYear(),
    updated.getMonth(),
    updated.getDate(),
  ).getTime();
  const difference = Math.floor((today - updatedDay) / 86_400_000);

  if (difference <= 0) {
    return 'Hôm nay';
  }
  if (difference === 1) {
    return 'Hôm qua';
  }
  return `${difference} ngày trước`;
}

interface StickyScreenProps {
  onOpenSettings?: () => void;
}

export function StickyScreen({ onOpenSettings }: StickyScreenProps) {
  const { errorMessage, repositories, status: dataStatus } = useMochiData();
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folderId, setFolderId] = useState('');
  const [color, setColor] = useState<NoteColor>('yellow');
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!repositories) {
      return;
    }

    let active = true;
    Promise.all([repositories.notes.listRecent(), repositories.folders.listOrdered()])
      .then(([storedNotes, storedFolders]) => {
        if (active) {
          setNotes(storedNotes);
          setFolders(storedFolders);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dataStatus, repositories]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const visibleNotes = useMemo(
    () =>
      activeFilter === 'all'
        ? notes
        : notes.filter((note) => note.folderId === activeFilter),
    [activeFilter, notes],
  );

  function beginCreate() {
    setEditingNote(null);
    setTitle('');
    setContent('');
    setFolderId(folders[0]?.id ?? '');
    setColor('yellow');
    setShowForm(true);
  }

  function beginEdit(note: Note) {
    setEditingNote(note);
    setTitle(note.title);
    setContent(noteLines(note).join('\n'));
    setFolderId(note.folderId ?? '');
    setColor(note.color);
    setOpenNoteMenuId(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingNote(null);
    setTitle('');
    setContent('');
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const noteTitle = title.trim();
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!noteTitle || !repositories) {
      return;
    }

    const now = new Date().toISOString();
    const noteContent: JsonValue = { type: 'bullet-list', items: lines };
    const note: Note = editingNote
      ? {
          ...editingNote,
          title: noteTitle,
          content: noteContent,
          plainText: lines.join('\n'),
          folderId: folderId || null,
          color,
          updatedAt: now,
        }
      : {
          id: createNoteId(),
          title: noteTitle,
          content: noteContent,
          plainText: lines.join('\n'),
          folderId: folderId || null,
          color,
          pattern: color === 'yellow' || color === 'sage' ? 'grid' : 'plain',
          pinned: false,
          favorite: false,
          source: null,
          createdAt: now,
          updatedAt: now,
        };

    await repositories.notes.put(note);
    setNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    setOperationStatus(editingNote ? `Đã cập nhật ${note.title}` : `Đã tạo ${note.title}`);
    closeForm();
  }

  async function toggleFavorite(note: Note) {
    if (!repositories) {
      return;
    }

    const updatedNote = {
      ...note,
      favorite: !note.favorite,
      updatedAt: new Date().toISOString(),
    };
    await repositories.notes.put(updatedNote);
    setNotes((current) => current.map((item) => (item.id === note.id ? updatedNote : item)));
    setOperationStatus(updatedNote.favorite ? `Đã yêu thích ${note.title}` : `Đã bỏ yêu thích ${note.title}`);
  }

  async function deleteNote(note: Note) {
    if (!repositories) {
      return;
    }

    await repositories.notes.delete(note.id);
    setNotes((current) => current.filter((item) => item.id !== note.id));
    setOpenNoteMenuId(null);
    setOperationStatus(`Đã xóa ${note.title}`);
  }

  return (
    <section className="preview-screen preview-screen--sticky" aria-labelledby="sticky-heading">
      <header className="preview-header">
        <div className="preview-header__title">
          <IconButton aria-label="Mở menu">
            <Menu aria-hidden="true" size={20} />
          </IconButton>
          <h1 id="sticky-heading">Ghi chú Sticker</h1>
        </div>
        <div className="preview-header__actions">
          <IconButton aria-label="Tìm kiếm">
            <Search aria-hidden="true" size={19} />
          </IconButton>
          <IconButton aria-label="Đổi kiểu hiển thị">
            <Grid2X2 aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Cài đặt Sticker" onClick={onOpenSettings}>
            <Settings aria-hidden="true" size={18} />
          </IconButton>
        </div>
      </header>

      {showForm ? (
        <Surface className="sticky-form" raised>
          <form onSubmit={(event) => void saveNote(event)}>
            <div className="data-form__heading">
              <strong>{editingNote ? 'Sửa Sticker' : 'Sticker mới'}</strong>
              <IconButton aria-label="Đóng biểu mẫu Sticker" onClick={closeForm}>
                <X aria-hidden="true" size={17} />
              </IconButton>
            </div>
            <label htmlFor="sticky-title">Tiêu đề Sticker</label>
            <input
              id="sticky-title"
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
            <label htmlFor="sticky-content">Nội dung Sticker</label>
            <textarea
              id="sticky-content"
              onChange={(event) => setContent(event.target.value)}
              placeholder="Mỗi dòng là một ý"
              rows={3}
              value={content}
            />
            <div className="sticky-form__meta">
              <label>
                <span>Thư mục</span>
                <select onChange={(event) => setFolderId(event.target.value)} value={folderId}>
                  <option value="">Không có</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Màu</span>
                <select
                  onChange={(event) => setColor(event.target.value as NoteColor)}
                  value={color}
                >
                  {NOTE_COLORS.map((noteColor) => (
                    <option key={noteColor} value={noteColor}>
                      {noteColor}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="data-form__actions">
              <Button size="small" type="submit">
                {editingNote ? 'Lưu Sticker' : 'Tạo Sticker'}
              </Button>
              <Button onClick={closeForm} size="small" variant="ghost">
                Hủy
              </Button>
            </div>
          </form>
        </Surface>
      ) : null}

      <div className="sticky-filter" aria-label="Lọc Sticker">
        <Chip onClick={() => setActiveFilter('all')} selected={activeFilter === 'all'}>
          Tất cả
        </Chip>
        {folders.map((folder) => (
          <Chip
            key={folder.id}
            onClick={() => setActiveFilter(folder.id)}
            selected={activeFilter === folder.id}
          >
            {folder.name}
          </Chip>
        ))}
      </div>

      {loading && dataStatus !== 'error' ? (
        <p className="data-screen-state">Đang tải Sticker...</p>
      ) : null}
      {dataStatus === 'error' ? (
        <p className="data-screen-state data-screen-state--error" role="alert">
          {errorMessage ?? 'Không thể tải Sticker.'}
        </p>
      ) : null}

      <div className="sticky-grid">
        {visibleNotes.map((note) => (
          <article className={`sticky-card sticky-card--${note.color}`} data-testid="sticky-card" key={note.id}>
            <span className="sticky-card__tape" aria-hidden="true" />
            <div className="sticky-card__controls">
              <IconButton
                aria-label={`${note.favorite ? 'Bỏ yêu thích' : 'Yêu thích'} ${note.title}`}
                aria-pressed={note.favorite}
                onClick={() => void toggleFavorite(note)}
              >
                <Star aria-hidden="true" fill={note.favorite ? 'currentColor' : 'none'} size={15} />
              </IconButton>
              <IconButton
                aria-label={`Tùy chọn ${note.title}`}
                aria-pressed={openNoteMenuId === note.id}
                onClick={() =>
                  setOpenNoteMenuId((current) => (current === note.id ? null : note.id))
                }
              >
                <MoreVertical aria-hidden="true" size={15} />
              </IconButton>
              {openNoteMenuId === note.id ? (
                <div className="sticky-card__menu" aria-label={`Thao tác ${note.title}`} role="group">
                  <IconButton aria-label={`Sửa ${note.title}`} onClick={() => beginEdit(note)}>
                    <Pencil aria-hidden="true" size={14} />
                  </IconButton>
                  <IconButton aria-label={`Xóa ${note.title}`} onClick={() => void deleteNote(note)}>
                    <Trash2 aria-hidden="true" size={14} />
                  </IconButton>
                </div>
              ) : null}
            </div>
            <h2>{note.title}</h2>
            <ul>
              {noteLines(note).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <span className="sticky-card__category">
              {note.folderId ? (folderById.get(note.folderId)?.name ?? 'Không có') : 'Không có'}
            </span>
            <time>{relativeTime(note.updatedAt)}</time>
          </article>
        ))}
      </div>

      {!loading && visibleNotes.length === 0 ? (
        <p className="data-screen-state">Không có Sticker trong bộ lọc này.</p>
      ) : null}
      {operationStatus ? (
        <p className="data-operation-status" role="status">
          {operationStatus}
        </p>
      ) : null}
      <FloatingActionButton aria-label="Thêm Sticker" onClick={beginCreate} />
    </section>
  );
}
