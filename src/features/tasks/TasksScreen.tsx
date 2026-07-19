import { ChevronRight, Clock3, Settings, TimerReset, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { Brand } from '../../components/ui/Brand';
import { Button } from '../../components/ui/Button';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';
import type { Folder, Task } from '../../db/models';
import { TaskRow } from './TaskRow';
import { nextTaskDate, type TaskRepeatRule } from './taskRecurrence';

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

interface FolderOption {
  depth: number;
  folder: Folder;
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function weekFor(dateValue: string) {
  const selected = parseIsoDate(dateValue);
  const distanceFromMonday = (selected.getDay() + 6) % 7;
  const monday = new Date(selected);
  monday.setDate(selected.getDate() - distanceFromMonday);

  return Array.from({ length: 7 }, (_value, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date: date.getDate(),
      day: DAY_LABELS[date.getDay()],
      iso: toIsoDate(date),
    };
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(parseIsoDate(value));
}

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function taskFolderOptions(folders: Folder[]) {
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

interface TasksScreenProps {
  onOpenSettings?: () => void;
}

export function TasksScreen({ onOpenSettings }: TasksScreenProps) {
  const { errorMessage, repositories, status: dataStatus } = useMochiData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [draftFolderId, setDraftFolderId] = useState('');
  const [draftRepeatRule, setDraftRepeatRule] = useState<TaskRepeatRule | ''>('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    Promise.all([repositories.tasks.list(), repositories.folders.listOrdered()])
      .then(([storedTasks, storedFolders]) => {
        if (active) {
          setTasks(storedTasks);
          setFolders(storedFolders);
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

  const weekDays = useMemo(() => weekFor(selectedDate), [selectedDate]);
  const selectedTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.dueDate === selectedDate)
        .sort((first, second) => first.position - second.position),
    [selectedDate, tasks],
  );
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const folderOptions = useMemo(() => taskFolderOptions(folders), [folders]);
  const completedCount = selectedTasks.filter((task) => task.completedAt).length;
  const scheduledCount = selectedTasks.filter((task) => task.dueTime).length;
  const today = toIsoDate(new Date());

  function beginAdd() {
    setEditingTask(null);
    setDraftTitle('');
    setDraftTime('');
    setDraftFolderId(folders[0]?.id ?? '');
    setDraftRepeatRule('');
    setOpenMenuId(null);
    setShowForm(true);
  }

  function beginEdit(task: Task) {
    setEditingTask(task);
    setDraftTitle(task.title);
    setDraftTime(task.dueTime ?? '');
    setDraftFolderId(task.folderId ?? '');
    setDraftRepeatRule(task.repeatRule ?? '');
    setOpenMenuId(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTask(null);
    setDraftTitle('');
    setDraftTime('');
    setDraftRepeatRule('');
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || !repositories) return;
    const now = new Date().toISOString();
    const task: Task = editingTask
      ? {
          ...editingTask,
          title,
          dueDate: selectedDate,
          dueTime: draftTime || null,
          folderId: draftFolderId || null,
          repeatRule: draftRepeatRule || null,
          updatedAt: now,
        }
      : {
          id: createTaskId(),
          title,
          dueDate: selectedDate,
          dueTime: draftTime || null,
          folderId: draftFolderId || null,
          repeatRule: draftRepeatRule || null,
          completedAt: null,
          position: selectedTasks.length,
          createdAt: now,
          updatedAt: now,
        };

    await repositories.tasks.put(task);
    setTasks((current) =>
      editingTask
        ? current.map((item) => (item.id === task.id ? task : item))
        : [...current, task],
    );
    setOperationStatus(editingTask ? `Đã cập nhật ${task.title}` : `Đã thêm ${task.title}`);
    closeForm();
  }

  async function toggleTask(task: Task) {
    if (!repositories) return;
    const completedAt = task.completedAt ? null : new Date().toISOString();
    const updated = {
      ...task,
      completedAt,
      updatedAt: new Date().toISOString(),
    };
    await repositories.tasks.put(updated);
    if (completedAt && task.repeatRule && task.dueDate) {
      const nextDate = nextTaskDate(task.dueDate, task.repeatRule);
      if (nextDate) {
        const nextTask: Task = {
          ...task,
          completedAt: null,
          createdAt: new Date().toISOString(),
          dueDate: nextDate,
          id: createTaskId(),
          position: 0,
          updatedAt: new Date().toISOString(),
        };
        await repositories.tasks.put(nextTask);
        setTasks((current) => [nextTask, ...current.map((item) => (item.id === task.id ? updated : item))]);
        setOperationStatus(`Đã hoàn thành ${task.title}; tạo lịch tiếp theo`);
        return;
      }
    }
    setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
  }

  async function moveTask(taskId: string, direction: -1 | 1) {
    if (!repositories) return;
    const ordered = [...selectedTasks];
    const currentIndex = ordered.findIndex((task) => task.id === taskId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const now = new Date().toISOString();
    const currentTask = { ...ordered[currentIndex], position: targetIndex, updatedAt: now };
    const targetTask = { ...ordered[targetIndex], position: currentIndex, updatedAt: now };
    await Promise.all([
      repositories.tasks.put(currentTask),
      repositories.tasks.put(targetTask),
    ]);
    setTasks((current) =>
      current.map((task) => {
        if (task.id === currentTask.id) return currentTask;
        if (task.id === targetTask.id) return targetTask;
        return task;
      }),
    );
    setOpenMenuId(null);
    setOperationStatus(`Đã đổi vị trí ${currentTask.title}`);
  }

  async function deleteTask(task: Task) {
    if (!repositories) return;
    await repositories.tasks.delete(task.id);
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setOpenMenuId(null);
    setOperationStatus(`Đã xóa ${task.title}`);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setOpenMenuId(null);
    closeForm();
  }

  return (
    <section className="tasks-screen" aria-labelledby="tasks-heading">
      <header className="tasks-screen__topbar">
        <Brand />
        <div className="tasks-screen__actions">
          <IconButton aria-label="Cài đặt" onClick={onOpenSettings}>
            <Settings aria-hidden="true" size={19} strokeWidth={1.8} />
          </IconButton>
          <IconButton aria-label="Đóng MochiNote" onClick={() => window.close()}>
            <X aria-hidden="true" size={20} strokeWidth={1.8} />
          </IconButton>
        </div>
      </header>

      <div className="tasks-screen__heading-row">
        <h1 id="tasks-heading">
          {selectedDate === today ? 'Nhiệm vụ hôm nay' : 'Nhiệm vụ ngày đã chọn'}
        </h1>
        <button className="tasks-screen__date-label" type="button">
          <span>{formatDate(selectedDate)}</span>
          <ChevronRight aria-hidden="true" size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="week-rail" aria-label="Chọn ngày">
        {weekDays.map(({ date, day, iso }) => (
          <button
            aria-label={`${day}, ngày ${date}`}
            aria-pressed={selectedDate === iso}
            className="week-rail__day"
            key={iso}
            onClick={() => selectDate(iso)}
            type="button"
          >
            <span>{day}</span>
            <strong>{date}</strong>
          </button>
        ))}
      </div>

      <div className="tasks-screen__divider" />

      {loading && dataStatus !== 'error' ? (
        <p className="data-screen-state">Đang tải nhiệm vụ...</p>
      ) : null}
      {dataStatus === 'error' ? (
        <p className="data-screen-state data-screen-state--error" role="alert">
          {errorMessage ?? 'Không thể tải nhiệm vụ.'}
        </p>
      ) : null}

      <ul className="task-list" aria-label="Danh sách nhiệm vụ">
        {selectedTasks.map((task, index) => (
          <TaskRow
            canMoveDown={index < selectedTasks.length - 1}
            canMoveUp={index > 0}
            folder={task.folderId ? folderById.get(task.folderId) : undefined}
            key={task.id}
            menuOpen={openMenuId === task.id}
            onDelete={deleteTask}
            onEdit={beginEdit}
            onMenuToggle={(taskId) =>
              setOpenMenuId((current) => (current === taskId ? null : taskId))
            }
            onMove={moveTask}
            onToggle={toggleTask}
            task={task}
          />
        ))}
      </ul>

      {!loading && selectedTasks.length === 0 ? (
        <p className="data-screen-state">Chưa có nhiệm vụ trong ngày này.</p>
      ) : null}

      {showForm ? (
        <form className="task-form ui-surface ui-surface--raised" onSubmit={(event) => void saveTask(event)}>
          <div className="data-form__heading">
            <strong>{editingTask ? 'Sửa nhiệm vụ' : 'Nhiệm vụ mới'}</strong>
            <IconButton aria-label="Đóng biểu mẫu nhiệm vụ" onClick={closeForm}>
              <X aria-hidden="true" size={17} />
            </IconButton>
          </div>
          <label htmlFor="task-title">{editingTask ? 'Tên nhiệm vụ' : 'Nhiệm vụ mới'}</label>
          <input
            id="task-title"
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Ví dụ: Gửi báo cáo"
            required
            value={draftTitle}
          />
          <div className="task-form__meta">
            <label>
              <span>Thời gian</span>
              <input onChange={(event) => setDraftTime(event.target.value)} type="time" value={draftTime} />
            </label>
            <label>
              <span>Lặp lại</span>
              <select onChange={(event) => setDraftRepeatRule(event.target.value as TaskRepeatRule | '')} value={draftRepeatRule}>
                <option value="">Không lặp</option>
                <option value="FREQ=DAILY">Hàng ngày</option>
                <option value="FREQ=WEEKLY">Hàng tuần</option>
                <option value="FREQ=MONTHLY">Hàng tháng</option>
              </select>
            </label>
            <label>
              <span>Thư mục nhiệm vụ</span>
              <select onChange={(event) => setDraftFolderId(event.target.value)} value={draftFolderId}>
                <option value="">Không có</option>
                {folderOptions.map(({ depth, folder }) => (
                  <option key={folder.id} value={folder.id}>
                    {`${'— '.repeat(Math.min(depth + 1, 6))}${folder.name}`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="data-form__actions">
            <Button size="small" type="submit">{editingTask ? 'Lưu' : 'Thêm'}</Button>
            <Button onClick={closeForm} size="small" variant="ghost">Hủy</Button>
          </div>
        </form>
      ) : null}

      <div className="task-stats" aria-label="Thống kê ngày đã chọn">
        <article className="task-stat-card">
          <div className="task-stat-card__label">
            <span className="task-stat-card__icon"><Clock3 aria-hidden="true" size={16} /></span>
            <span>Hoàn thành</span>
          </div>
          <strong data-testid="completed-count">{completedCount} / {selectedTasks.length}</strong>
        </article>
        <article className="task-stat-card">
          <div className="task-stat-card__label">
            <span className="task-stat-card__icon"><TimerReset aria-hidden="true" size={16} /></span>
            <span>Có lịch</span>
          </div>
          <strong>{scheduledCount} việc</strong>
        </article>
      </div>

      {operationStatus ? <p className="data-operation-status" role="status">{operationStatus}</p> : null}
      {showForm ? null : (
        <FloatingActionButton aria-label="Thêm nhiệm vụ" onClick={beginAdd} />
      )}
    </section>
  );
}
