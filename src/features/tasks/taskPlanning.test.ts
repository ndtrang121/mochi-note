import { describe, expect, it } from 'vitest';

import type { Task } from '../../db/models';
import {
  isTaskCompletedOnDate,
  isTaskOverdue,
  planningDaysFrom,
  taskOccursOnDate,
  tasksForPlanningDate,
} from './taskPlanning';

function task(overrides: Partial<Task>): Task {
  return {
    completedAt: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    dueDate: '2026-07-19',
    dueTime: null,
    folderId: null,
    id: 'task',
    position: 0,
    title: 'Task',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

describe('task planning', () => {
  it('starts the planning rail with Today and only moves forward', () => {
    const days = planningDaysFrom('2026-07-19');

    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ day: 'Hôm nay', iso: '2026-07-19', today: true });
    expect(days[6].iso).toBe('2026-07-25');
  });

  it('projects daily and weekly series onto matching future dates', () => {
    const daily = task({ id: 'daily', repeatRule: 'FREQ=DAILY' });
    const weekly = task({ id: 'weekly', repeatRule: 'FREQ=WEEKLY' });

    expect(taskOccursOnDate(daily, '2026-07-29')).toBe(true);
    expect(taskOccursOnDate(weekly, '2026-07-26')).toBe(true);
    expect(taskOccursOnDate(weekly, '2026-07-27')).toBe(false);
  });

  it('projects end-of-month series using the last valid day', () => {
    const monthly = task({ dueDate: '2026-01-31', repeatRule: 'FREQ=MONTHLY' });

    expect(taskOccursOnDate(monthly, '2026-02-28')).toBe(true);
    expect(taskOccursOnDate(monthly, '2026-03-31')).toBe(true);
    expect(taskOccursOnDate(monthly, '2026-04-30')).toBe(true);
    expect(taskOccursOnDate(monthly, '2026-04-29')).toBe(false);
  });

  it('keeps the original monthly anchor when carrying an overdue occurrence forward', () => {
    const monthly = task({
      completedDates: ['2026-01-31', '2026-02-28'],
      dueDate: '2026-01-31',
      recurrenceSeriesId: 'monthly',
      repeatRule: 'FREQ=MONTHLY',
    });

    expect(tasksForPlanningDate([monthly], '2026-04-01', '2026-04-01')).toEqual([
      expect.objectContaining({ occurrenceDate: '2026-03-31', overdue: true }),
    ]);
  });

  it('tracks completion independently for every recurring occurrence', () => {
    const daily = task({
      completedDates: ['2026-07-20'],
      recurrenceSeriesId: 'daily',
      repeatRule: 'FREQ=DAILY',
    });

    expect(isTaskCompletedOnDate(daily, '2026-07-20')).toBe(true);
    expect(isTaskCompletedOnDate(daily, '2026-07-21')).toBe(false);
    expect(tasksForPlanningDate([daily], '2026-07-21', '2026-07-19')).toEqual([
      expect.objectContaining({ completed: false, occurrenceDate: '2026-07-21' }),
    ]);
  });

  it('brings unfinished past one-off tasks into Today while retaining their due date', () => {
    const overdue = task({ dueDate: '2026-07-17', id: 'overdue' });
    const completedPast = task({ completedAt: '2026-07-17T10:00:00.000Z', dueDate: '2026-07-17', id: 'done-past' });
    const today = task({ id: 'today' });
    const planned = tasksForPlanningDate([completedPast, today, overdue], '2026-07-19', '2026-07-19');

    expect(planned.map(({ task: item }) => item.id)).toEqual(['overdue', 'today']);
    expect(planned[0]).toMatchObject({ occurrenceDate: '2026-07-17', overdue: true });
    expect(overdue.dueDate).toBe('2026-07-17');
    expect(isTaskOverdue(overdue, '2026-07-19')).toBe(true);
  });

  it('sorts completed occurrences below every active occurrence', () => {
    const completed = task({ completedAt: '2026-07-19T10:00:00.000Z', id: 'completed', position: 0 });
    const active = task({ id: 'active', position: 2 });
    const planned = tasksForPlanningDate([completed, active], '2026-07-19', '2026-07-19');

    expect(planned.map(({ task: item }) => item.id)).toEqual(['active', 'completed']);
  });

  it('keeps legacy completed recurrence chains from projecting duplicate future tasks', () => {
    const legacyCompleted = task({
      completedAt: '2026-07-19T10:00:00.000Z',
      repeatRule: 'FREQ=DAILY',
    });

    expect(taskOccursOnDate(legacyCompleted, '2026-07-19')).toBe(true);
    expect(taskOccursOnDate(legacyCompleted, '2026-07-20')).toBe(false);
  });
});
