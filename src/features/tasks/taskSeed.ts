export interface TaskItem {
  category: 'Cá nhân' | 'Công việc';
  completed: boolean;
  id: string;
  meta?: string;
  title: string;
}

export const INITIAL_TASKS: TaskItem[] = [
  {
    id: 'design-system',
    title: 'Cập nhật Design System',
    category: 'Công việc',
    completed: false,
  },
  {
    id: 'team-sync',
    title: 'Họp team định kỳ',
    category: 'Công việc',
    meta: '10:00 AM',
    completed: false,
  },
  {
    id: 'weekly-report',
    title: 'Chuẩn bị báo cáo tuần',
    category: 'Công việc',
    completed: false,
  },
  {
    id: 'meditation',
    title: 'Thiền buổi tối',
    category: 'Cá nhân',
    meta: '10 phút',
    completed: true,
  },
  {
    id: 'water-plants',
    title: 'Tưới cây 🪴',
    category: 'Cá nhân',
    completed: false,
  },
];

export const WEEK_DAYS = [
  { day: 'T2', date: 20 },
  { day: 'T3', date: 21 },
  { day: 'T4', date: 22 },
  { day: 'T5', date: 23 },
  { day: 'T6', date: 24 },
  { day: 'T7', date: 25 },
  { day: 'CN', date: 26 },
];
