import { ChevronRight, Clock3, Settings, TimerReset, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

import { Brand } from '../../components/ui/Brand';
import { Button } from '../../components/ui/Button';
import { FloatingActionButton } from '../../components/ui/FloatingActionButton';
import { IconButton } from '../../components/ui/IconButton';
import { TaskRow } from './TaskRow';
import { INITIAL_TASKS, WEEK_DAYS } from './taskSeed';
import type { TaskItem } from './taskSeed';

const BASE_COMPLETED_TASKS = 11;

export function TasksScreen() {
  const [tasks, setTasks] = useState<TaskItem[]>(() => INITIAL_TASKS);
  const [selectedDate, setSelectedDate] = useState(24);
  const [isAdding, setIsAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const completedCount = useMemo(
    () => BASE_COMPLETED_TASKS + tasks.filter((task) => task.completed).length,
    [tasks],
  );

  const toggleTask = (id: string) => {
    setTasks((currentTasks) =>
      currentTasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task,
      ),
    );
  };

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();

    if (!title) {
      return;
    }

    const task: TaskItem = {
      id: `task-${Date.now()}`,
      title,
      category: 'Công việc',
      completed: false,
    };

    setTasks((currentTasks) => [...currentTasks, task]);
    setDraftTitle('');
    setIsAdding(false);
  };

  return (
    <section className="tasks-screen" aria-labelledby="tasks-heading">
      <header className="tasks-screen__topbar">
        <Brand />
        <div className="tasks-screen__actions">
          <IconButton aria-label="Cài đặt">
            <Settings aria-hidden="true" size={19} strokeWidth={1.8} />
          </IconButton>
          <IconButton aria-label="Đóng MochiNote" onClick={() => window.close()}>
            <X aria-hidden="true" size={20} strokeWidth={1.8} />
          </IconButton>
        </div>
      </header>

      <div className="tasks-screen__heading-row">
        <h1 id="tasks-heading">Nhiệm vụ hôm nay</h1>
        <button className="tasks-screen__date-label" type="button">
          <span>Thứ 6, 24 Thg 5</span>
          <ChevronRight aria-hidden="true" size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="week-rail" aria-label="Chọn ngày">
        {WEEK_DAYS.map(({ date, day }) => (
          <button
            aria-label={`${day}, ngày ${date}`}
            aria-pressed={selectedDate === date}
            className="week-rail__day"
            key={date}
            onClick={() => setSelectedDate(date)}
            type="button"
          >
            <span>{day}</span>
            <strong>{date}</strong>
          </button>
        ))}
      </div>

      <div className="tasks-screen__divider" />

      <ul className="task-list" aria-label="Danh sách nhiệm vụ">
        {tasks.map((task) => (
          <TaskRow key={task.id} onToggle={toggleTask} task={task} />
        ))}
      </ul>

      {isAdding ? (
        <form className="quick-task-form ui-surface ui-surface--raised" onSubmit={addTask}>
          <label htmlFor="quick-task-title">Nhiệm vụ mới</label>
          <div className="quick-task-form__controls">
            <input
              id="quick-task-title"
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Ví dụ: Gửi báo cáo"
              value={draftTitle}
            />
            <Button size="small" type="submit">
              Thêm
            </Button>
            <IconButton aria-label="Hủy thêm nhiệm vụ" onClick={() => setIsAdding(false)}>
              <X aria-hidden="true" size={18} />
            </IconButton>
          </div>
        </form>
      ) : null}

      <div className="task-stats" aria-label="Thống kê hôm nay">
        <article className="task-stat-card">
          <div className="task-stat-card__label">
            <span className="task-stat-card__icon">
              <Clock3 aria-hidden="true" size={16} />
            </span>
            <span>Hoàn thành</span>
          </div>
          <strong data-testid="completed-count">{completedCount} / 16</strong>
        </article>
        <article className="task-stat-card">
          <div className="task-stat-card__label">
            <span className="task-stat-card__icon">
              <TimerReset aria-hidden="true" size={16} />
            </span>
            <span>Tập trung</span>
          </div>
          <strong>4.5 giờ</strong>
        </article>
      </div>

      {isAdding ? null : (
        <FloatingActionButton aria-label="Thêm nhiệm vụ" onClick={() => setIsAdding(true)} />
      )}
    </section>
  );
}
