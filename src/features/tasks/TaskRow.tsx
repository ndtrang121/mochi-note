import { Check, MoreVertical } from 'lucide-react';

import { IconButton } from '../../components/ui/IconButton';
import type { TaskItem } from './taskSeed';

interface TaskRowProps {
  onToggle: (id: string) => void;
  task: TaskItem;
}

export function TaskRow({ onToggle, task }: TaskRowProps) {
  return (
    <li className="task-row">
      <button
        aria-label={`${task.completed ? 'Đánh dấu chưa hoàn thành' : 'Đánh dấu hoàn thành'}: ${task.title}`}
        aria-pressed={task.completed}
        className="task-row__check"
        onClick={() => onToggle(task.id)}
        type="button"
      >
        {task.completed ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : null}
      </button>
      <div className="task-row__content">
        <div className="task-row__title-line">
          <span className={task.completed ? 'task-row__title task-row__title--completed' : 'task-row__title'}>
            {task.title}
          </span>
          {task.meta ? <span className="task-row__meta">{task.meta}</span> : null}
        </div>
        <span className={`task-row__category task-row__category--${task.category === 'Công việc' ? 'work' : 'personal'}`}>
          {task.category}
        </span>
      </div>
      <IconButton aria-label={`Thêm tùy chọn cho ${task.title}`} className="task-row__menu">
        <MoreVertical aria-hidden="true" size={18} strokeWidth={1.8} />
      </IconButton>
    </li>
  );
}
