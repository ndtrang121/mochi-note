import { ArrowDown, ArrowUp, Check, MoreVertical, Pencil, Trash2 } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type { Folder, Task } from '../../db/models';
import { repeatLabel } from './taskRecurrence';

interface TaskRowProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  folder: Folder | undefined;
  menuOpen: boolean;
  onDelete: (task: Task) => Promise<void>;
  onEdit: (task: Task) => void;
  onMenuToggle: (taskId: string) => void;
  onMove: (taskId: string, direction: -1 | 1) => Promise<void>;
  onToggle: (task: Task) => Promise<void>;
  task: Task;
}

export function TaskRow({
  canMoveDown,
  canMoveUp,
  folder,
  menuOpen,
  onDelete,
  onEdit,
  onMenuToggle,
  onMove,
  onToggle,
  task,
}: TaskRowProps) {
  const completed = Boolean(task.completedAt);
  const folderName = folder?.name ?? 'Không có';
  const tone = folder?.color ?? 'yellow';

  return (
    <li className="task-row" data-testid="task-row">
      <button
        aria-label={`${completed ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}: ${task.title}`}
        aria-pressed={completed}
        className="task-row__check"
        onClick={() => void onToggle(task)}
        type="button"
      >
        {completed ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : null}
      </button>
      <div className="task-row__content">
        <div className="task-row__title-line">
          <span className={completed ? 'task-row__title task-row__title--completed' : 'task-row__title'}>
            {task.title}
          </span>
          {task.dueTime ? <time className="task-row__meta">{task.dueTime}</time> : null}
          {repeatLabel(task.repeatRule) ? <span className="task-row__repeat">↻ {repeatLabel(task.repeatRule)}</span> : null}
        </div>
        <span className={`task-row__category task-row__category--${tone}`}>{folderName}</span>
      </div>
      <IconButton
        aria-label={`Tùy chọn nhiệm vụ ${task.title}`}
        aria-pressed={menuOpen}
        className="task-row__menu"
        onClick={() => onMenuToggle(task.id)}
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
