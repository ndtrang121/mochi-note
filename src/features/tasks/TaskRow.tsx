import { AlertTriangle, ArrowDown, ArrowUp, Check, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { IconButton } from '../../components/ui/IconButton';
import type { Folder, Task } from '../../db/models';
import { formatOverdueDate } from './taskPlanning';
import { repeatLabel } from './taskRecurrence';

interface TaskRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  completed: boolean;
  folder: Folder | undefined;
  highlighted?: boolean;
  menuOpen: boolean;
  onDelete: (task: Task) => Promise<void>;
  onEdit: (task: Task) => void;
  onMenuToggle: (taskId: string) => void;
  onMove: (taskId: string, direction: -1 | 1) => Promise<void>;
  onToggle: (task: Task, occurrenceDate: string) => Promise<void>;
  occurrenceDate: string;
  overdue?: boolean;
  rowId: string;
  task: Task;
}

export function TaskRow({
  canMoveDown,
  canMoveUp,
  completed,
  folder,
  highlighted = false,
  menuOpen,
  onDelete,
  onEdit,
  onMenuToggle,
  onMove,
  onToggle,
  occurrenceDate,
  overdue = false,
  rowId,
  task,
}: TaskRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const folderName = folder?.name ?? 'Không có';
  const tone = folder?.color ?? 'yellow';
  const occurrenceSuffix = task.repeatRule ? `, ngày ${formatOverdueDate(occurrenceDate)}` : '';

  useEffect(() => {
    if (!highlighted) return;
    rowRef.current?.focus();
    rowRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  return (
    <li
      className={`task-row${highlighted ? ' task-row--highlighted' : ''}${overdue ? ' task-row--overdue' : ''}`}
      data-occurrence-date={occurrenceDate}
      data-task-id={task.id}
      data-testid="task-row"
      data-targeted={highlighted ? 'true' : undefined}
      ref={rowRef}
      tabIndex={highlighted ? -1 : undefined}
    >
      <button
        aria-label={`${completed ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}: ${task.title}${occurrenceSuffix}`}
        aria-pressed={completed}
        className="task-row__check"
        onClick={() => void onToggle(task, occurrenceDate)}
        type="button"
      >
        {completed ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : null}
      </button>
      <div className="task-row__content">
        <div className="task-row__title-line">
          <span className={completed ? 'task-row__title task-row__title--completed' : 'task-row__title'}>
            {task.title}
          </span>
          {overdue && task.dueDate ? (
            <span className="task-row__overdue">
              <AlertTriangle aria-hidden="true" size={10} strokeWidth={2.2} />
              Trễ từ {formatOverdueDate(task.dueDate)}
            </span>
          ) : null}
          {task.dueTime ? <time className="task-row__meta">{task.dueTime}</time> : null}
          {repeatLabel(task.repeatRule) ? <span className="task-row__repeat">↻ {repeatLabel(task.repeatRule)}</span> : null}
        </div>
        <span className={`task-row__category task-row__category--${tone}`}>{folderName}</span>
      </div>
      <IconButton
        aria-label={`Tùy chọn nhiệm vụ ${task.title}${occurrenceSuffix}`}
        aria-pressed={menuOpen}
        className="task-row__menu"
        onClick={() => onMenuToggle(rowId)}
      >
        <MoreVertical aria-hidden="true" size={18} strokeWidth={1.8} />
      </IconButton>
      {menuOpen ? (
        <div className="task-row__actions" aria-label={`Thao tác ${task.title}`} role="group">
          <IconButton aria-label={`Sửa ${task.title}`} onClick={() => onEdit(task)}>
            <Pencil aria-hidden="true" size={15} />
          </IconButton>
          <IconButton
            aria-label={`Di chuyển ${task.title} lên`}
            disabled={!canMoveUp}
            onClick={() => void onMove(task.id, -1)}
          >
            <ArrowUp aria-hidden="true" size={15} />
          </IconButton>
          <IconButton
            aria-label={`Di chuyển ${task.title} xuống`}
            disabled={!canMoveDown}
            onClick={() => void onMove(task.id, 1)}
          >
            <ArrowDown aria-hidden="true" size={15} />
          </IconButton>
          <IconButton aria-label={`Xóa ${task.title}`} onClick={() => void onDelete(task)}>
            <Trash2 aria-hidden="true" size={15} />
          </IconButton>
        </div>
      ) : null}
    </li>
  );
}
