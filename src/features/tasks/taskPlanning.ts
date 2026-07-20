import type { Task } from '../../db/models';

export interface PlanningDay {
  date: number;
  day: string;
  iso: string;
  today: boolean;
}

export interface PlannedTask {
  completed: boolean;
  occurrenceDate: string;
  overdue: boolean;
  task: Task;
}

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;
const MAX_RECURRENCE_STEPS = 5_000;

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function lastDayOfMonth(value: Date) {
  const lastDayTarget = new Date(value);
  lastDayTarget.setDate(1);
  lastDayTarget.setMonth(value.getMonth() + 1);
  lastDayTarget.setDate(0);
  return lastDayTarget.getDate();
}
function dateOffsetByMonths(value: string, offset: number) {
  const anchor = parseIsoDate(value);
  const target = new Date(anchor);
  const anchorDay = anchor.getDate();
  target.setDate(1);
  target.setMonth(anchor.getMonth() + offset);
  const lastDay = lastDayOfMonth(target);
  target.setDate(Math.min(anchorDay, lastDay));
  return toIsoDate(target);
}

export function planningDateRange(today: string) {
  return {
    end: dateOffsetByMonths(today, 6),
    start: dateOffsetByMonths(today, -6),
  };
}

function daysBetween(first: string, second: string) {
  return Math.round((parseIsoDate(second).getTime() - parseIsoDate(first).getTime()) / 86_400_000);
}

function isLegacyCompletedSeries(task: Task) {
  return Boolean(
    task.repeatRule
    && task.completedAt
    && !task.recurrenceSeriesId
    && task.completedDates === undefined,
  );
}

function recurrenceDateAt(task: Task, index: number) {
  if (!task.dueDate || !task.repeatRule || index < 0) return null;
  const anchor = parseIsoDate(task.dueDate);
  const occurrence = new Date(anchor);
  if (task.repeatRule === 'FREQ=DAILY') occurrence.setDate(anchor.getDate() + index);
  if (task.repeatRule === 'FREQ=WEEKLY') occurrence.setDate(anchor.getDate() + index * 7);
  if (task.repeatRule === 'FREQ=MONTHLY') {
    const anchorDay = anchor.getDate();
    occurrence.setDate(1);
    occurrence.setMonth(anchor.getMonth() + index);
    const lastDay = lastDayOfMonth(occurrence);
    occurrence.setDate(Math.min(anchorDay, lastDay));
  }
  return toIsoDate(occurrence);
}

export function planningDaysAround(selectedDate: string, today: string, count = 7): PlanningDay[] {
  const selected = parseIsoDate(selectedDate);
  const start = new Date(selected);
  start.setDate(selected.getDate() - Math.floor(count / 2));

  return Array.from({ length: count }, (_value, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const iso = toIsoDate(date);
    const isToday = iso === today;
    return {
      date: date.getDate(),
      day: isToday ? 'Hôm nay' : DAY_LABELS[date.getDay()],
      iso,
      today: isToday,
    };
  });
}

export function taskOccursOnDate(task: Task, date: string) {
  if (!task.dueDate || date < task.dueDate) return false;
  if (date === task.dueDate) return true;
  if (!task.repeatRule || isLegacyCompletedSeries(task)) return false;

  if (task.repeatRule === 'FREQ=DAILY') return true;
  if (task.repeatRule === 'FREQ=WEEKLY') return daysBetween(task.dueDate, date) % 7 === 0;

  const anchor = parseIsoDate(task.dueDate);
  const target = parseIsoDate(date);
  const monthDistance = (target.getFullYear() - anchor.getFullYear()) * 12
    + target.getMonth() - anchor.getMonth();
  if (monthDistance < 0) return false;
  const lastDay = lastDayOfMonth(target);
  return target.getDate() === Math.min(anchor.getDate(), lastDay);
}

export function completedOccurrenceDates(task: Task) {
  const dates = new Set(task.completedDates ?? []);
  if (task.repeatRule && task.completedAt && task.dueDate) dates.add(task.dueDate);
  return dates;
}

export function isTaskCompletedOnDate(task: Task, occurrenceDate: string) {
  if (!task.repeatRule) return Boolean(task.completedAt);
  return completedOccurrenceDates(task).has(occurrenceDate);
}

function latestPendingOccurrenceBefore(task: Task, beforeDate: string) {
  if (!task.dueDate || !task.repeatRule || isLegacyCompletedSeries(task)) return null;
  const completedDates = completedOccurrenceDates(task);
  let latestPending: string | null = null;
  let steps = 0;

  while (steps < MAX_RECURRENCE_STEPS) {
    const occurrence = recurrenceDateAt(task, steps);
    if (!occurrence || occurrence >= beforeDate) break;
    if (!completedDates.has(occurrence)) latestPending = occurrence;
    steps += 1;
  }
  return latestPending;
}

export function isTaskOverdue(task: Task, today: string) {
  if (!task.dueDate) return false;
  if (!task.repeatRule) return !task.completedAt && task.dueDate < today;
  return Boolean(latestPendingOccurrenceBefore(task, today));
}

export function tasksForPlanningDate(tasks: Task[], selectedDate: string, today: string): PlannedTask[] {
  const planned: PlannedTask[] = [];

  for (const task of tasks) {
    if (taskOccursOnDate(task, selectedDate)) {
      planned.push({
        completed: isTaskCompletedOnDate(task, selectedDate),
        occurrenceDate: selectedDate,
        overdue: false,
        task,
      });
    }

    if (selectedDate !== today) continue;
    if (!task.repeatRule && task.dueDate && task.dueDate < today) {
      planned.push({
        completed: Boolean(task.completedAt),
        occurrenceDate: task.dueDate,
        overdue: true,
        task,
      });
      continue;
    }
    if (task.repeatRule) {
      const overdueDate = latestPendingOccurrenceBefore(task, today);
      if (overdueDate) {
        planned.push({ completed: false, occurrenceDate: overdueDate, overdue: true, task });
      }
    }
  }

  return planned.sort((first, second) => {
    const completionOrder = Number(first.completed) - Number(second.completed);
    if (completionOrder !== 0) return completionOrder;

    const overdueOrder = Number(second.overdue) - Number(first.overdue);
    if (overdueOrder !== 0) return overdueOrder;

    const dateOrder = first.occurrenceDate.localeCompare(second.occurrenceDate);
    if (dateOrder !== 0) return dateOrder;

    const positionOrder = first.task.position - second.task.position;
    if (positionOrder !== 0) return positionOrder;

    return (first.task.dueTime ?? '99:99').localeCompare(second.task.dueTime ?? '99:99');
  });
}

export function formatOverdueDate(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: 'short',
  }).format(parseIsoDate(value));
}
