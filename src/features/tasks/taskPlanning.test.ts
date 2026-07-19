import { describe, expect, it } from 'vitest';

import type { Task } from '../../db/models';
import { isTaskOverdue, planningDaysFrom, tasksForPlanningDate } from './taskPlanning';

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

  it('brings unfinished past tasks into Today while retaining their due date', () => {
    const overdue = task({ dueDate: '2026-07-17', id: 'overdue' });
    const completedPast = task({ completedAt: '2026-07-17T10:00:00.000Z', dueDate: '2026-07-17', id: 'done-past' });
    const today = task({ id: 'today' });

    expect(tasksForPlanningDate([completedPast, today, overdue], '2026-07-19', '2026-07-19').map(({ id }) => id)).toEqual([
      'overdue',
      'today',
    ]);
    expect(overdue.dueDate).toBe('2026-07-17');
    expect(isTaskOverdue(overdue, '2026-07-19')).toBe(true);
  });

  it('sorts completed tasks below every active task', () => {
    const completed = task({ completedAt: '2026-07-19T10:00:00.000Z', id: 'completed', position: 0 });
    const active = task({ id: 'active', position: 2 });

    expect(tasksForPlanningDate([completed, active], '2026-07-19', '2026-07-19').map(({ id }) => id)).toEqual([
      'active',
      'completed',
    ]);
  });
});
