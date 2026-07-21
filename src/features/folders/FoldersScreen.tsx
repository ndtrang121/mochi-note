import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Folder as FolderIcon,
  MoreVertical,
  Pencil,
  Settings,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { useTransientStatus } from '../../components/hooks/useTransientStatus';
import { Brand } from '../../components/ui/Brand';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Surface } from '../../components/ui/Surface';
import type { Folder, Note, NoteColor, Task } from '../../db/models';
import { createStableId } from '../../db/stableId';

const FOLDER_COLORS: readonly NoteColor[] = ['yellow', 'blue', 'blush', 'sage', 'lilac'];

interface FolderTreeItem {
  depth: number;
  folder: Folder;
}

interface FoldersScreenProps {
  syncAction?: ReactNode;
  initialFolderId?: string | null;
  onOpenNote?: (note: Note, folderId: string) => void;
  onOpenTask?: (task: Task, folderId: string) => void;
  onOpenSettings?: () => void;
}

function folderParentId(folder: Folder) {
  return folder.parentId ?? null;
}

function sortSiblings(folders: Folder[]) {
  return [...folders].sort(
    (first, second) => first.position - second.position || first.name.localeCompare(second.name, 'vi'),
  );
}

function flattenFolderTree(folders: Folder[]) {
  const byParent = new Map<string | null, Folder[]>();
  for (const folder of folders) {
    const parentId = folderParentId(folder);
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), folder]);
  }

  const result: FolderTreeItem[] = [];
  const visited = new Set<string>();
  function visit(parentId: string | null, depth: number) {
    for (const folder of sortSiblings(byParent.get(parentId) ?? [])) {
      if (visited.has(folder.id)) {
        continue;
      }
      visited.add(folder.id);
      result.push({ depth, folder });
      visit(folder.id, depth + 1);
    }
  }

  visit(null, 0);
  for (const folder of sortSiblings(folders)) {
    if (!visited.has(folder.id)) {
      result.push({ depth: 0, folder });
    }
  }
  return result;
}

function collectFolderTreeIds(rootId: string, folders: Folder[]) {
  const collected = new Set<string>();
  const pending = [rootId];
  while (pending.length > 0) {
    const folderId = pending.pop();
    if (!folderId || collected.has(folderId)) {
      continue;
    }
    collected.add(folderId);
    for (const folder of folders) {
      if (folderParentId(folder) === folderId) {
        pending.push(folder.id);
      }
    }
  }
  return collected;
}

function createFolderId() {
  return createStableId('folder');
}

export function FoldersScreen({ initialFolderId, onOpenNote, onOpenSettings, onOpenTask, syncAction }: FoldersScreenProps) {
  const { errorMessage, repositories, status: dataStatus } = useMochiData();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderColor, setFolderColor] = useState<NoteColor>('yellow');
  const [parentFolderId, setParentFolderId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useTransientStatus();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(initialFolderId ?? null);


  useEffect(() => {
    if (!repositories) {
      return;
    }

    let active = true;
    Promise.all([repositories.folders.listOrdered(), repositories.notes.list(), repositories.tasks.list()])
      .then(([storedFolders, storedNotes, storedTasks]) => {
        if (active) {
          setFolders(storedFolders);
          setNotes(storedNotes);
          setTasks(storedTasks);
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

  const folderTree = useMemo(() => flattenFolderTree(folders), [folders]);
  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );
  const selectedChildFolders = useMemo(
    () => selectedFolder ? sortSiblings(folders.filter((folder) => folderParentId(folder) === selectedFolder.id)) : [],
    [folders, selectedFolder],
  );
  const selectedNotes = useMemo(
    () => selectedFolder
      ? notes.filter((note) => note.folderId === selectedFolder.id && !note.deletedAt && !note.archivedAt)
      : [],
    [notes, selectedFolder],
  );
  const selectedTasks = useMemo(
    () => selectedFolder
      ? tasks
          .filter((task) => task.folderId === selectedFolder.id)
          .sort((first, second) => (first.dueDate ?? '').localeCompare(second.dueDate ?? '') || first.position - second.position)
      : [],
    [selectedFolder, tasks],
  );
  const noteCounts = useMemo(() => {
    const directCounts = new Map<string, number>();
    for (const note of notes) {
      if (note.folderId && !note.deletedAt && !note.archivedAt) {
        directCounts.set(note.folderId, (directCounts.get(note.folderId) ?? 0) + 1);
      }
    }

    const totals = new Map<string, number>();
    function totalFor(folderId: string, visiting = new Set<string>()) {
      if (totals.has(folderId)) {
        return totals.get(folderId) ?? 0;
      }
      if (visiting.has(folderId)) {
        return directCounts.get(folderId) ?? 0;
      }

      const nextVisiting = new Set(visiting).add(folderId);
      let total = directCounts.get(folderId) ?? 0;
      for (const child of folders) {
        if (folderParentId(child) === folderId) {
          total += totalFor(child.id, nextVisiting);
        }
      }
      totals.set(folderId, total);
      return total;
    }

    for (const folder of folders) {
      totalFor(folder.id);
    }
    return totals;
  }, [folders, notes]);

  function beginCreate(parentId: string | null = null) {
    setEditingFolder(null);
    setFolderName('');
    setFolderColor('yellow');
    setParentFolderId(parentId);
    setShowForm(true);
    setOpenMenuId(null);
  }

  function beginEdit(folder: Folder) {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderColor(folder.color);
    setParentFolderId(folderParentId(folder));
    setShowForm(true);
    setOpenMenuId(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingFolder(null);
    setFolderName('');
    setParentFolderId(null);
  }

  async function saveFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || !repositories) {
      return;
    }

    const now = new Date().toISOString();
    const folder: Folder = editingFolder
      ? { ...editingFolder, color: folderColor, name, updatedAt: now }
      : {
          id: createFolderId(),
          name,
          color: folderColor,
          icon: 'folder',
          parentId: parentFolderId,
          position: folders.filter((item) => folderParentId(item) === parentFolderId).length,
          createdAt: now,
          updatedAt: now,
        };

    await repositories.folders.put(folder);
    setFolders((current) =>
      editingFolder
        ? current.map((item) => (item.id === folder.id ? folder : item))
        : [...current, folder],
    );
    setOperationStatus(editingFolder ? `Đã cập nhật ${folder.name}` : `Đã thêm ${folder.name}`);
    closeForm();
  }

  async function moveFolder(folderId: string, direction: -1 | 1) {
    if (!repositories) {
      return;
    }

    const selectedFolder = folders.find((folder) => folder.id === folderId);
    if (!selectedFolder) {
      return;
    }
    const ordered = sortSiblings(
      folders.filter((folder) => folderParentId(folder) === folderParentId(selectedFolder)),
    );
    const currentIndex = ordered.findIndex((folder) => folder.id === folderId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
      return;
    }

    const now = new Date().toISOString();
    const currentFolder = { ...ordered[currentIndex], position: targetIndex, updatedAt: now };
    const targetFolder = { ...ordered[targetIndex], position: currentIndex, updatedAt: now };
    ordered[currentIndex] = targetFolder;
    ordered[targetIndex] = currentFolder;

    await Promise.all([
      repositories.folders.put(currentFolder),
      repositories.folders.put(targetFolder),
    ]);
    setFolders((current) =>
      current.map((folder) => {
        if (folder.id === currentFolder.id) {
          return currentFolder;
        }
        if (folder.id === targetFolder.id) {
          return targetFolder;
        }
        return folder;
      }),
    );
    setOpenMenuId(null);
    setOperationStatus(`Đã đổi vị trí ${currentFolder.name}`);
  }

  async function deleteFolder(folder: Folder) {
    if (!repositories) {
      return;
    }

    const now = new Date().toISOString();
    const deletedFolderIds = collectFolderTreeIds(folder.id, folders);
    const affectedNotes = notes
      .filter((note) => note.folderId && deletedFolderIds.has(note.folderId))
      .map((note) => ({ ...note, folderId: null, updatedAt: now }));
    const affectedTasks = tasks
      .filter((task) => task.folderId && deletedFolderIds.has(task.folderId))
      .map((task) => ({ ...task, folderId: null, updatedAt: now }));

    await Promise.all([
      ...Array.from(deletedFolderIds, (folderId) => repositories.folders.delete(folderId)),
      ...affectedNotes.map((note) => repositories.notes.put(note)),
      ...affectedTasks.map((task) => repositories.tasks.put(task)),
    ]);
    setFolders((current) => current.filter((item) => !deletedFolderIds.has(item.id)));
    setNotes((current) =>
      current.map((note) => affectedNotes.find((item) => item.id === note.id) ?? note),
    );
    setTasks((current) =>
      current.map((task) => affectedTasks.find((item) => item.id === task.id) ?? task),
    );
    if (selectedFolderId && deletedFolderIds.has(selectedFolderId)) setSelectedFolderId(null);
    setOpenMenuId(null);
    setOperationStatus(
      deletedFolderIds.size > 1
        ? `Đã xóa ${folder.name} và ${deletedFolderIds.size - 1} thư mục con`
        : `Đã xóa ${folder.name}`,
    );
  }

  if (selectedFolder) {
    return (
      <section className="preview-screen folder-detail-screen" aria-labelledby="folder-detail-heading">
        <header className="preview-header">
          <div className="preview-header__title">
            <IconButton aria-label="Quay lại danh sách thư mục" onClick={() => setSelectedFolderId(null)}>
              <ArrowLeft aria-hidden="true" size={20} />
            </IconButton>
            <h1 id="folder-detail-heading">{selectedFolder.name}</h1>
          </div>
          <IconButton aria-label={`Thêm thư mục con ${selectedFolder.name}`} onClick={() => beginCreate(selectedFolder.id)} variant="outlined">
            <Plus aria-hidden="true" size={19} />
          </IconButton>
        </header>
        <p className="preview-screen__subtitle">
          {selectedTasks.length} nhiệm vụ · {selectedNotes.length} Sticky · {selectedChildFolders.length} thư mục con
        </p>

        {showForm ? (
          <Surface className="folder-form" raised>
            <form onSubmit={(event) => void saveFolder(event)}>
              <div className="data-form__heading">
                <strong>Thư mục con mới</strong>
                <IconButton aria-label="Đóng biểu mẫu thư mục" onClick={closeForm}><X aria-hidden="true" size={17} /></IconButton>
              </div>
              <label htmlFor="folder-detail-name">Tên thư mục</label>
              <input id="folder-detail-name" onChange={(event) => setFolderName(event.target.value)} required value={folderName} />
              <label htmlFor="folder-detail-color">Màu thư mục</label>
              <select id="folder-detail-color" onChange={(event) => setFolderColor(event.target.value as NoteColor)} value={folderColor}>
                {FOLDER_COLORS.map((color) => <option key={color} value={color}>{color}</option>)}
              </select>
              <div className="data-form__actions"><Button size="small" type="submit">Thêm</Button><Button onClick={closeForm} size="small" variant="ghost">Hủy</Button></div>
            </form>
          </Surface>
        ) : null}

        {selectedChildFolders.length > 0 ? (
          <section className="folder-detail-section" aria-labelledby="folder-child-heading">
            <h2 id="folder-child-heading">Thư mục con</h2>
            <div className="folder-detail-children">
              {selectedChildFolders.map((folder) => (
                <button key={folder.id} onClick={() => setSelectedFolderId(folder.id)} type="button">
                  <FolderIcon aria-hidden="true" size={19} /><span>{folder.name}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="folder-detail-section" aria-labelledby="folder-task-heading">
          <h2 id="folder-task-heading"><CheckCircle2 aria-hidden="true" size={17} /> Nhiệm vụ</h2>
          <div className="folder-content-list">
            {selectedTasks.map((task) => (
              <button key={task.id} onClick={() => onOpenTask?.(task, selectedFolder.id)} type="button">
                <span className={`folder-content-list__check${task.completedAt ? ' folder-content-list__check--done' : ''}`} />
                <span><strong>{task.title}</strong><small>{task.dueDate ?? 'Chưa có ngày'}{task.dueTime ? ` · ${task.dueTime}` : ''}</small></span>
              </button>
            ))}
            {selectedTasks.length === 0 ? <p>Chưa có nhiệm vụ trong thư mục này.</p> : null}
          </div>
        </section>

        <section className="folder-detail-section" aria-labelledby="folder-sticky-heading">
          <h2 id="folder-sticky-heading"><StickyNote aria-hidden="true" size={17} /> Sticky</h2>
          <div className="folder-content-list">
            {selectedNotes.map((note) => (
              <button key={note.id} onClick={() => onOpenNote?.(note, selectedFolder.id)} type="button">
                <span className={`note-preview-row__dot note-preview-row__dot--${note.color}`} />
                <span><strong>{note.title}</strong><small>{note.plainText || 'Ghi chú trống'}</small></span>
              </button>
            ))}
            {selectedNotes.length === 0 ? <p>Chưa có Sticky trong thư mục này.</p> : null}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="preview-screen folder-screen" aria-labelledby="folders-heading">
      <header className="preview-header">
        <div className="preview-header__title">
          <Brand />
          <h1 className="sr-only" id="folders-heading">Quản lý thư mục</h1>
        </div>
        <div className="preview-header__actions">
          {syncAction}
          <IconButton aria-label="Cài đặt" onClick={onOpenSettings}>
            <Settings aria-hidden="true" size={18} />
          </IconButton>
          <IconButton aria-label="Thêm thư mục" onClick={() => beginCreate(null)} variant="outlined">
            <Plus aria-hidden="true" size={20} />
          </IconButton>
        </div>
      </header>
      <p className="preview-screen__subtitle">Sắp xếp ghi chú của bạn</p>

      {showForm ? (
        <Surface className="folder-form" raised>
          <form onSubmit={(event) => void saveFolder(event)}>
            <div className="data-form__heading">
              <strong>{editingFolder ? 'Sửa thư mục' : 'Thư mục mới'}</strong>
              <IconButton aria-label="Đóng biểu mẫu thư mục" onClick={closeForm}>
                <X aria-hidden="true" size={17} />
              </IconButton>
            </div>
            <label htmlFor="folder-name">Tên thư mục</label>
            <input
              id="folder-name"
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Ví dụ: Du lịch"
              required
              value={folderName}
            />
            {!editingFolder ? (
              <>
                <label htmlFor="folder-parent">Thư mục cha</label>
                <select
                  id="folder-parent"
                  onChange={(event) => setParentFolderId(event.target.value || null)}
                  value={parentFolderId ?? ''}
                >
                  <option value="">Không có — thư mục gốc</option>
                  {folderTree.map(({ depth, folder }) => (
                    <option key={folder.id} value={folder.id}>
                      {`${'— '.repeat(Math.min(depth + 1, 6))}${folder.name}`}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label htmlFor="folder-color">Màu thư mục</label>
            <select
              id="folder-color"
              onChange={(event) => setFolderColor(event.target.value as NoteColor)}
              value={folderColor}
            >
              {FOLDER_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
            <div className="data-form__actions">
              <Button size="small" type="submit">
                {editingFolder ? 'Lưu' : 'Thêm'}
              </Button>
              <Button onClick={closeForm} size="small" variant="ghost">
                Hủy
              </Button>
            </div>
          </form>
        </Surface>
      ) : null}

      <div className="folder-screen__list-region">
        {loading && dataStatus !== 'error' ? (
          <p className="data-screen-state">Đang tải thư mục...</p>
        ) : null}
        {dataStatus === 'error' ? (
          <p className="data-screen-state data-screen-state--error" role="alert">
            {errorMessage ?? 'Không thể tải thư mục.'}
          </p>
        ) : null}

        <div
          className="folder-preview-list"
          data-testid="folder-list"
        >
          {folderTree.map(({ depth, folder }) => {
          const siblings = sortSiblings(
            folders.filter((item) => folderParentId(item) === folderParentId(folder)),
          );
          const siblingIndex = siblings.findIndex((item) => item.id === folder.id);
          return (
            <article
              aria-label={`Thư mục ${folder.name}, cấp ${depth + 1}`}
              className={`folder-preview-card folder-preview-card--${folder.color}`}
              data-depth={depth}
              data-testid="folder-card"
              key={folder.id}
              style={{ '--folder-depth': Math.min(depth, 6) } as CSSProperties}
            >
            <button aria-label={`Mở thư mục ${folder.name}`} className="folder-preview-card__open" onClick={() => setSelectedFolderId(folder.id)} type="button">
              <span className="folder-preview-card__icon">
                <FolderIcon aria-hidden="true" fill="currentColor" size={27} strokeWidth={1.5} />
              </span>
              <div>
                <h2>{folder.name}</h2>
                <p>{noteCounts.get(folder.id) ?? 0} ghi chú</p>
              </div>
            </button>
            <IconButton
              aria-label={`Tùy chọn thư mục ${folder.name}`}
              aria-pressed={openMenuId === folder.id}
              onClick={() => setOpenMenuId((current) => (current === folder.id ? null : folder.id))}
            >
              <MoreVertical aria-hidden="true" size={18} />
            </IconButton>
            {openMenuId === folder.id ? (
              <div className="folder-card-menu" aria-label={`Thao tác ${folder.name}`} role="group">
                <IconButton
                  aria-label={`Thêm thư mục con ${folder.name}`}
                  onClick={() => beginCreate(folder.id)}
                >
                  <Plus aria-hidden="true" size={16} />
                </IconButton>
                <IconButton aria-label={`Sửa ${folder.name}`} onClick={() => beginEdit(folder)}>
                  <Pencil aria-hidden="true" size={16} />
                </IconButton>
                <IconButton
                  aria-label={`Di chuyển ${folder.name} lên`}
                  disabled={siblingIndex === 0}
                  onClick={() => void moveFolder(folder.id, -1)}
                >
                  <ArrowUp aria-hidden="true" size={16} />
                </IconButton>
                <IconButton
                  aria-label={`Di chuyển ${folder.name} xuống`}
                  disabled={siblingIndex === siblings.length - 1}
                  onClick={() => void moveFolder(folder.id, 1)}
                >
                  <ArrowDown aria-hidden="true" size={16} />
                </IconButton>
                <IconButton aria-label={`Xóa ${folder.name}`} onClick={() => void deleteFolder(folder)}>
                  <Trash2 aria-hidden="true" size={16} />
                </IconButton>
              </div>
            ) : null}
            </article>
          );
          })}
        </div>

        {!loading && folders.length === 0 ? (
          <p className="data-screen-state">Chưa có thư mục. Hãy tạo thư mục đầu tiên.</p>
        ) : null}
      </div>
      {operationStatus ? (
        <p className="data-operation-status" role="status">
          {operationStatus}
        </p>
      ) : null}
      <p className="folder-preview-tip">
        💡 Mở ⋮ để tạo thư mục con nhiều lớp; dùng mũi tên để sắp xếp cùng cấp
      </p>
    </section>
  );
}
