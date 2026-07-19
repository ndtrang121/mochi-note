export type NoteDateFilter = 'all' | 'month' | 'today' | 'week';

function startOfDay(value: Date) {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function noteMatchesDateFilter(createdAt: string, filter: NoteDateFilter, now = new Date()) {
  if (filter === 'all') return true;
  const created = new Date(createdAt);
  if (!Number.isFinite(created.getTime())) return false;
  const today = startOfDay(now);
  if (filter === 'today') return created >= today;
  if (filter === 'month') return created >= new Date(now.getFullYear(), now.getMonth(), 1);
  const day = today.getDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - daysSinceMonday);
  return created >= weekStart;
}
