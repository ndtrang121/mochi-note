import type { Task } from '../../db/models';

export interface PlanningDay {
  date: number;
  day: string;
  iso: string;
  today: boolean;
}

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function planningDaysFrom(today: string, count = 7): PlanningDay[] {
  const start = parseIsoDate(today);
  return Array.from({ length: count }, (_value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: date.getDate(),
      day: index === 0 ? 'Hôm nay' : DAY_LABELS[date.getDay()],
      iso: toIsoDate(date),
      today: index === 0,
    };
  });
}

export function isTaskOverdue(task: Task, today: string) {
  return !task.completedAt && Boolean(task.dueDate && task.dueDate < today);
}

export function tasksForPlanningDate(tasks: Task[], selectedDate: string, today: string) {
  return tasks
    .filter((task) => (
      task.dueDate === selectedDate
      || (selectedDate === today && isTaskOverdue(task, today))
    ))
    .sort((first, second) => {
      const completionOrder = Number(Boolean(first.completedAt)) - Number(Boolean(second.completedAt));
      if (completionOrder !== 0) return completionOrder;

      const overdueOrder = Number(isTaskOverdue(second, today)) - Number(isTaskOverdue(first, today));
      if (overdueOrder !== 0) return overdueOrder;

      const dateOrder = (first.dueDate ?? '').localeCompare(second.dueDate ?? '');
      if (dateOrder !== 0) return dateOrder;

      const positionOrder = first.position - second.position;
      if (positionOrder !== 0) return positionOrder;

      return (first.dueTime ?? '99:99').localeCompare(second.dueTime ?? '99:99');
    });
}

export function formatOverdueDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
  }).format(parseIsoDate(value));
}
