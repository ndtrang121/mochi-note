import { ChevronRight, Clock3, TimerReset, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import { useMochiData } from '../../app/MochiDataProvider';
import { nextReminderSchedule, requestReminderReconciliation } from '../../browser/reminders';
import { useTransientStatus } from '../../components/hooks/useTransientStatus';
import { PrimaryHeaderActions } from '../../components/navigation/PrimaryHeaderActions';
import { Brand } from '../../components/ui/Brand';
import { Button } from '../../components/ui/Button';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';
import type { Folder, Reminder, Task } from '../../db/models';
import { createStableId } from '../../db/stableId';
import { EMPTY_REMINDER_DRAFT, ReminderFields, reminderToDraft, type ReminderDraft } from '../notes/ReminderFields';
import { TaskRow } from './TaskRow';
import {
  completedOccurrenceDates,
  isTaskOverdue,
  parseIsoDate,
  planningDateRange,
  planningDaysAround,
  taskOccursOnDate,
  tasksForPlanningDate,
  toIsoDate,
} from './taskPlanning';
import type { TaskRepeatRule } from './taskRecurrence';

interface FolderOption {
  depth: number;
  folder: Folder;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
    weekday: 'short',
  }).format(parseIsoDate(value));
}

function reminderDraftForTask(task: Task, reminder: Reminder | null) {
  const draft = reminderToDraft(reminder);
  if (!reminder || !task.dueDate || !task.dueTime) return draft;
  const dueAt = Date.parse(`${task.dueDate}T${task.dueTime}`);
  const scheduledAt = Date.parse(reminder.scheduledAt);
  const offsetMinutes = Math.round((dueAt - scheduledAt) / 60_000);
  return {
    ...draft,
    offsetMinutes: Number.isFinite(offsetMinutes) && offsetMinutes >= 0 ? offsetMinutes : 0,
  };
}

function createTaskId() {
  return createStableId('task');
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
  syncAction?: ReactNode;
  navigationTarget?: Task | null;
  onOpenSettings?: () => void;
}

export function TasksScreen({ navigationTarget, onOpenSettings, syncAction }: TasksScreenProps) {
  const { errorMessage, repositories, status: dataStatus } = useMochiData();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => toIsoDate(new Date()));
  const [railCenterDate, setRailCenterDate] = useState(() => toIsoDate(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDueDate, setDraftDueDate] = useState(() => toIsoDate(new Date()));
  const [draftTime, setDraftTime] = useState('');
  const [draftFolderId, setDraftFolderId] = useState('');
  const [draftRepeatRule, setDraftRepeatRule] = useState<TaskRepeatRule | ''>('');
  const [reminderDraft, setReminderDraft] = useState<ReminderDraft>(() => ({ ...EMPTY_REMINDER_DRAFT }));
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useTransientStatus();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    Promise.all([
      repositories.tasks.list(),
      repositories.folders.listOrdered(),
      repositories.reminders.list(),
    ])
      .then(([storedTasks, storedFolders, storedReminders]) => {
        if (active) {
          setTasks(storedTasks);
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

  const today = toIsoDate(new Date());
  const weekDays = useMemo(() => planningDaysAround(railCenterDate, today), [railCenterDate, today]);
  const dateRange = useMemo(() => planningDateRange(today), [today]);
  const selectedTasks = useMemo(
    () => tasksForPlanningDate(tasks, selectedDate, today),
    [selectedDate, tasks, today],
  );
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );
  const folderOptions = useMemo(() => taskFolderOptions(folders), [folders]);
  const completedCount = selectedTasks.filter((item) => item.completed).length;
  const scheduledCount = selectedTasks.filter(({ task }) => task.dueTime).length;
  useEffect(() => {
    if (!navigationTarget) return;
    const timer = window.setTimeout(() => {
      const targetDate = taskOccursOnDate(navigationTarget, today) || isTaskOverdue(navigationTarget, today)
        ? today
        : navigationTarget.dueDate ?? today;
      setSelectedDate(targetDate);
      setRailCenterDate((currentCenter) => (
        planningDaysAround(currentCenter, today).some(({ iso }) => iso === targetDate)
          ? currentCenter
          : targetDate
      ));
      setShowForm(false);
      setEditingTask(null);
      setOpenMenuId(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [navigationTarget, today]);

  useEffect(() => {
    // Move focus after the modal is mounted instead of relying on autoFocus.
    if (showForm) titleInputRef.current?.focus();
  }, [showForm]);


  function beginAdd() {
    setEditingTask(null);
    setDraftTitle('');
    setDraftDueDate(selectedDate);
    setDraftTime('');
    setDraftFolderId(folders[0]?.id ?? '');
    setDraftRepeatRule('');
    setReminderDraft({ ...EMPTY_REMINDER_DRAFT });
    setOpenMenuId(null);
    setShowForm(true);
  }

  function beginEdit(task: Task) {
    setEditingTask(task);
    setDraftTitle(task.title);
    setDraftDueDate(task.dueDate ?? today);
    setDraftTime(task.dueTime ?? '');
    setDraftFolderId(task.folderId ?? '');
    setDraftRepeatRule(task.repeatRule ?? '');
    setReminderDraft(reminderDraftForTask(
      task,
      reminders.find((reminder) => reminder.ownerType === 'task' && reminder.ownerId === task.id) ?? null,
    ));
    setOpenMenuId(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTask(null);
    setDraftTitle('');
    setDraftDueDate(selectedDate);
    setDraftTime('');
    setDraftRepeatRule('');
    setReminderDraft({ ...EMPTY_REMINDER_DRAFT });
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || !repositories) return;
    const now = new Date().toISOString();
    const id = editingTask?.id ?? createTaskId();
    const dueDate = draftDueDate || selectedDate;
    const repeatRule = draftRepeatRule || null;
    const recurrenceChanged = Boolean(
      editingTask
      && (editingTask.dueDate !== dueDate || editingTask.repeatRule !== repeatRule),
    );
    const task: Task = {
      ...editingTask,
      completedAt: repeatRule
        ? null
        : editingTask?.repeatRule
          ? null
          : editingTask?.completedAt ?? null,
      completedDates: repeatRule
        ? recurrenceChanged
          ? []
          : editingTask
            ? [...completedOccurrenceDates(editingTask)].sort()
            : []
        : undefined,
      createdAt: editingTask?.createdAt ?? now,
      dueDate,
      dueTime: draftTime || null,
      folderId: draftFolderId || null,
      id,
      position: editingTask?.position ?? tasks.filter((item) => item.dueDate === dueDate).length,
      recurrenceSeriesId: repeatRule ? editingTask?.recurrenceSeriesId ?? id : undefined,
      repeatRule,
      title,
      updatedAt: now,
    };

    const existingReminder = editingTask
      ? reminders.find((reminder) => reminder.ownerType === 'task' && reminder.ownerId === editingTask.id) ?? null
      : null;
    let nextReminder: Reminder | null = null;
    if (reminderDraft.enabled) {
      const dueAt = draftTime ? Date.parse(`${dueDate}T${draftTime}`) : Number.NaN;
      const scheduledAt = dueAt - reminderDraft.offsetMinutes * 60_000;
      if (!draftTime || !Number.isFinite(scheduledAt)) {
        setOperationStatus('Hãy chọn thời gian task để nhắc nhở diễn ra trong tương lai');
        return;
      }
      const candidateReminder: Reminder = {
        createdAt: existingReminder?.createdAt ?? now,
        enabled: true,
        id: existingReminder?.id ?? createStableId('reminder-task'),
        ownerId: task.id,
        ownerType: 'task',
        offsetMinutes: reminderDraft.offsetMinutes,
        recurrenceAnchorDay: task.repeatRule === 'FREQ=MONTHLY' ? parseIsoDate(dueDate).getDate() : undefined,
        recurrenceDueTime: task.repeatRule ? draftTime : undefined,
        repeatRule: task.repeatRule ?? null,
        scheduledAt: new Date(scheduledAt).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh',
        updatedAt: now,
      };
      const nextSchedule = scheduledAt <= Date.now()
        ? nextReminderSchedule(candidateReminder)
        : null;
      if (scheduledAt <= Date.now() && !nextSchedule) {
        setOperationStatus('Hãy chọn thời gian task để nhắc nhở diễn ra trong tương lai');
        return;
      }
      nextReminder = nextSchedule
        ? { ...candidateReminder, scheduledAt: nextSchedule }
        : candidateReminder;
    }
    await Promise.all([
      repositories.tasks.put(task),
      ...(nextReminder ? [repositories.reminders.put(nextReminder)] : []),
      ...(!nextReminder && existingReminder ? [repositories.reminders.delete(existingReminder.id)] : []),
    ]);
    setTasks((current) =>
      editingTask
        ? current.map((item) => (item.id === task.id ? task : item))
        : [...current, task],
    );
    setReminders((current) => [
      ...(nextReminder ? [nextReminder] : []),
      ...current.filter((reminder) => reminder.id !== existingReminder?.id),
    ]);
    void requestReminderReconciliation();
    setOperationStatus(editingTask ? `Đã cập nhật ${task.title}` : `Đã thêm ${task.title}`);
    selectDate(task.dueDate ?? today);
    closeForm();
  }

  async function toggleTask(task: Task, occurrenceDate: string) {
    if (!repositories) return;
    if (task.repeatRule) {
      const completedDates = completedOccurrenceDates(task);
      const completing = !completedDates.has(occurrenceDate);
      if (completing) completedDates.add(occurrenceDate);
      else completedDates.delete(occurrenceDate);
      const updated: Task = {
        ...task,
        completedAt: null,
        completedDates: [...completedDates].sort(),
        recurrenceSeriesId: task.recurrenceSeriesId ?? task.id,
        updatedAt: new Date().toISOString(),
      };
      await repositories.tasks.put(updated);
      setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
      setOperationStatus(
        completing
          ? `Đã hoàn thành ${task.title} cho ngày ${formatDate(occurrenceDate)}`
          : `Đã mở lại ${task.title} cho ngày ${formatDate(occurrenceDate)}`,
      );
      return;
    }

    const completedAt = task.completedAt ? null : new Date().toISOString();
    const updated: Task = {
      ...task,
      completedAt,
      updatedAt: new Date().toISOString(),
    };
    await repositories.tasks.put(updated);
    const taskReminder = reminders.find(
      (reminder) => reminder.ownerType === 'task' && reminder.ownerId === task.id,
    ) ?? null;
    if (completedAt && taskReminder) {
      await repositories.reminders.delete(taskReminder.id);
      setReminders((current) => current.filter((reminder) => reminder.id !== taskReminder.id));
      void requestReminderReconciliation();
    }
    setTasks((current) => current.map((item) => (item.id === task.id ? updated : item)));
    setOperationStatus(completedAt ? `Đã hoàn thành ${task.title}` : `Đã mở lại ${task.title}`);
  }

  async function moveTask(taskId: string, direction: -1 | 1) {
    if (!repositories) return;
    const ordered = selectedTasks
      .filter(({ overdue, task }) => !overdue && !task.repeatRule)
      .map(({ task }) => task);
    const currentIndex = ordered.findIndex((task) => task.id === taskId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const now = new Date().toISOString();
    const currentTask = { ...ordered[currentIndex], position: ordered[targetIndex].position, updatedAt: now };
    const targetTask = { ...ordered[targetIndex], position: ordered[currentIndex].position, updatedAt: now };
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
    const taskReminder = reminders.find(
      (reminder) => reminder.ownerType === 'task' && reminder.ownerId === task.id,
    ) ?? null;
    await Promise.all([
      repositories.tasks.delete(task.id),
      ...(taskReminder ? [repositories.reminders.delete(taskReminder.id)] : []),
    ]);
    setTasks((current) => current.filter((item) => item.id !== task.id));
    if (taskReminder) {
      setReminders((current) => current.filter((reminder) => reminder.id !== taskReminder.id));
      void requestReminderReconciliation();
    }
    setOpenMenuId(null);
    setOperationStatus(`Đã xóa ${task.title}`);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setRailCenterDate((currentCenter) => (
      planningDaysAround(currentCenter, today).some(({ iso }) => iso === date)
        ? currentCenter
        : date
    ));
    setOpenMenuId(null);
    closeForm();
  }

  function openDatePicker() {
    const picker = datePickerRef.current;
    if (!picker) return;
    if (picker.showPicker) {
      picker.showPicker();
    } else {
      picker.focus();
    }
  }

  return (
    <section className="tasks-screen" aria-labelledby="tasks-heading">
      <header className="tasks-screen__topbar">
        <Brand />
        <PrimaryHeaderActions
          className="tasks-screen__actions"
          onOpenSettings={onOpenSettings}
          syncAction={syncAction}
        />
      </header>

      <div className="tasks-screen__heading-row">
        <h1 id="tasks-heading">
          {selectedDate === today ? 'Nhiệm vụ hôm nay' : 'Nhiệm vụ ngày đã chọn'}
        </h1>
        <div className="tasks-screen__date-picker-control">
          <button aria-label="Mở chọn ngày công việc" className="tasks-screen__date-label" onClick={openDatePicker} type="button">
            <span>{formatDate(selectedDate)}</span>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
          <input
            aria-label="Ngày công việc"
            className="tasks-screen__date-input"
            max={dateRange.end}
            min={dateRange.start}
            onChange={(event) => {
              if (event.target.value) {
                selectDate(event.target.value);
              } else {
                event.currentTarget.value = selectedDate;
              }
            }}
            ref={datePickerRef}
            required
            tabIndex={-1}
            type="date"
            value={selectedDate}
          />
        </div>
      </div>

      <div className="week-rail" aria-label="Chọn ngày">
        {weekDays.map(({ date, day, iso, today: isToday }) => (
          <button
            aria-label={`${isToday ? 'Hôm nay' : day}, ngày ${date}`}
            aria-pressed={selectedDate === iso}
            className={`week-rail__day${isToday ? ' week-rail__day--today' : ''}`}
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

      <div className="tasks-screen__list-region">
        {loading && dataStatus !== 'error' ? (
          <p className="data-screen-state">Đang tải nhiệm vụ...</p>
        ) : null}
        {dataStatus === 'error' ? (
          <p className="data-screen-state data-screen-state--error" role="alert">
            {errorMessage ?? 'Không thể tải nhiệm vụ.'}
          </p>
        ) : null}

        <ul className="task-list" aria-label="Danh sách nhiệm vụ">
          {selectedTasks.map((planned, index) => {
            const { completed, occurrenceDate, overdue, task } = planned;
            const previous = selectedTasks[index - 1];
            const next = selectedTasks[index + 1];
            const rowId = `${task.id}:${occurrenceDate}`;
            const canMoveWith = (neighbor: typeof planned | undefined) => Boolean(
              neighbor
              && !overdue
              && !neighbor.overdue
              && !task.repeatRule
              && !neighbor.task.repeatRule
              && neighbor.completed === completed
              && neighbor.task.dueDate === task.dueDate,
            );
            return (
              <TaskRow
                canMoveDown={canMoveWith(next)}
                canMoveUp={canMoveWith(previous)}
                completed={completed}
                folder={task.folderId ? folderById.get(task.folderId) : undefined}
                highlighted={navigationTarget?.id === task.id}
                key={rowId}
                menuOpen={openMenuId === rowId}
                occurrenceDate={occurrenceDate}
                onDelete={deleteTask}
                onEdit={beginEdit}
                onMenuToggle={(instanceId) =>
                  setOpenMenuId((current) => (current === instanceId ? null : instanceId))
                }
                onMove={moveTask}
                onToggle={toggleTask}
                overdue={overdue}
                rowId={rowId}
                task={task}
              />
            );
          })}
        </ul>

        {!loading && selectedTasks.length === 0 ? (
          <p className="data-screen-state">Chưa có nhiệm vụ trong ngày này.</p>
        ) : null}
      </div>

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

      {showForm ? (
        <div
          aria-label="Biểu mẫu nhiệm vụ"
          className="task-form-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeForm();
          }}
          role="presentation"
        >
        <form aria-label={editingTask ? 'Chỉnh sửa nhiệm vụ' : 'Tạo nhiệm vụ'} aria-modal="true" className="task-form ui-surface ui-surface--raised" onSubmit={(event) => void saveTask(event)} role="dialog">
          <div className="data-form__heading">
            <strong id="task-form-heading">{editingTask ? 'Sửa nhiệm vụ' : 'Nhiệm vụ mới'}</strong>
            <IconButton aria-label="Đóng biểu mẫu nhiệm vụ" onClick={closeForm}>
              <X aria-hidden="true" size={17} />
            </IconButton>
          </div>
          <label htmlFor="task-title">{editingTask ? 'Tên nhiệm vụ' : 'Nhiệm vụ mới'}</label>
          <input
            id="task-title"
            ref={titleInputRef}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Ví dụ: Gửi báo cáo"
            required
            value={draftTitle}
          />
          <div className="task-form__schedule">
            <label>
              <span>Ngày đến hạn</span>
              <input
                onChange={(event) => setDraftDueDate(event.target.value)}
                required
                type="date"
                value={draftDueDate}
              />
            </label>
            <label>
              <span>Thời gian</span>
              <input onChange={(event) => setDraftTime(event.target.value)} type="time" value={draftTime} />
            </label>
          </div>
          <div className="task-form__meta">
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
          <ReminderFields
            draft={reminderDraft}
            onChange={setReminderDraft}
            taskSchedule={{ dueDate: draftDueDate || selectedDate, dueTime: draftTime, repeatRule: draftRepeatRule || null }}
          />
          <div className="data-form__actions">
            <Button size="small" type="submit">{editingTask ? 'Lưu' : 'Thêm'}</Button>
            <Button onClick={closeForm} size="small" variant="ghost">Hủy</Button>
          </div>
        </form>
        </div>
      ) : null}

      {operationStatus ? <p className="data-operation-status" role="status">{operationStatus}</p> : null}
      {showForm ? null : (
        <FloatingActionButton aria-label="Thêm nhiệm vụ" onClick={beginAdd} />
      )}
    </section>
  );
}
