import type { Task } from '../../db/models';

export type TaskRepeatRule = NonNullable<Task['repeatRule']>;

export function nextTaskDate(dueDate: string, repeatRule: TaskRepeatRule) {
  const next = new Date(`${dueDate}T12:00:00`);
  if (!Number.isFinite(next.getTime())) return null;
  if (repeatRule === 'FREQ=DAILY') next.setDate(next.getDate() + 1);
  if (repeatRule === 'FREQ=WEEKLY') next.setDate(next.getDate() + 7);
  if (repeatRule === 'FREQ=MONTHLY') {
    const originalDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(originalDay, lastDay));
  }
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function repeatLabel(repeatRule: Task['repeatRule']) {
  if (repeatRule === 'FREQ=DAILY') return 'Hàng ngày';
  if (repeatRule === 'FREQ=WEEKLY') return 'Hàng tuần';
  if (repeatRule === 'FREQ=MONTHLY') return 'Hàng tháng';
  return null;
}
