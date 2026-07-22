import type { MochiDatabase } from './database';
import { MOCHI_DATABASE_VERSION } from './migrations';
import type { SeedFixtures, Settings } from './models';

const FIXTURE_TIMESTAMP = '2026-07-18T12:00:00.000Z';

export function createDefaultSettings(timestamp = new Date().toISOString()): Settings {
  return {
    id: 'app',
    layout: 'grid',
    locale: 'vi',
    recentColors: ['yellow', 'peach', 'blush', 'blue', 'sage'],
    schemaVersion: MOCHI_DATABASE_VERSION,
    theme: 'system',
    updatedAt: timestamp,
  };
}

export function createSeedFixtures(timestamp = FIXTURE_TIMESTAMP): SeedFixtures {
  return {
    attachments: [],
    folders: [
      {
        id: 'folder-work',
        name: 'Công việc',
        color: 'yellow',
        icon: 'briefcase',
        parentId: null,
        position: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'folder-study',
        name: 'Học tập',
        color: 'blue',
        icon: 'book-open',
        parentId: null,
        position: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'folder-personal',
        name: 'Cá nhân',
        color: 'blush',
        icon: 'heart',
        parentId: null,
        position: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'folder-ideas',
        name: 'Ý tưởng',
        color: 'sage',
        icon: 'lightbulb',
        parentId: null,
        position: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    notes: [
      {
        id: 'note-month-plan',
        title: 'Kế hoạch tháng 6',
        content: {
          type: 'checklist',
          items: ['Gym 3 buổi/tuần', 'Đọc 2 quyển sách', 'Đi du lịch'],
        },
        deletedAt: null,
        plainText: 'Gym 3 buổi/tuần Đọc 2 quyển sách Đi du lịch',
        folderId: 'folder-work',
        color: 'yellow',
        pattern: 'grid',
        pinned: true,
        favorite: true,
        source: null,
        tags: ['kế hoạch', 'sức khỏe'],
        createdAt: timestamp,
        updatedAt: '2026-07-18T12:04:00.000Z',
      },
      {
        id: 'note-content-ideas',
        title: 'Ý tưởng nội dung',
        content: {
          type: 'bullet-list',
          items: ['Video productivity', 'Tips ghi chú', 'Review sách'],
        },
        deletedAt: null,
        plainText: 'Video productivity Tips ghi chú Review sách',
        folderId: 'folder-personal',
        color: 'blush',
        pattern: 'hearts',
        pinned: false,
        favorite: false,
        source: null,
        tags: ['ý tưởng', 'nội dung'],
        createdAt: timestamp,
        updatedAt: '2026-07-17T12:00:00.000Z',
      },
      {
        id: 'note-client-meeting',
        title: 'Meeting với client',
        content: {
          type: 'details',
          date: '25/05/2024',
          time: '2:00 PM',
          location: 'Phòng họp A',
        },
        deletedAt: null,
        plainText: '25/05/2024 2:00 PM Phòng họp A',
        folderId: 'folder-work',
        color: 'blue',
        pattern: 'plain',
        pinned: false,
        favorite: true,
        source: null,
        tags: ['khách hàng', 'công việc'],
        createdAt: timestamp,
        updatedAt: '2026-07-16T12:00:00.000Z',
      },
      {
        id: 'note-shopping',
        title: 'Mua sắm',
        content: {
          type: 'bullet-list',
          items: ['Sữa hạnh nhân', 'Bơ', 'Bánh mì đen', 'Chuối'],
        },
        deletedAt: null,
        plainText: 'Sữa hạnh nhân Bơ Bánh mì đen Chuối',
        folderId: 'folder-personal',
        color: 'sage',
        pattern: 'grid',
        pinned: false,
        favorite: false,
        source: null,
        tags: ['mua sắm'],
        createdAt: timestamp,
        updatedAt: '2026-07-15T12:00:00.000Z',
      },
    ],
    reminders: [
      {
        id: 'reminder-client-meeting',
        ownerId: 'note-client-meeting',
        ownerType: 'note',
        scheduledAt: '2026-07-20T07:00:00.000Z',
        timezone: 'Asia/Ho_Chi_Minh',
        repeatRule: null,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    settings: createDefaultSettings(timestamp),
    tasks: [
      {
        id: 'task-design-system',
        title: 'Cập nhật Design System',
        dueDate: '2026-07-19',
        dueTime: null,
        folderId: 'folder-work',
        completedAt: null,
        position: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'task-team-meeting',
        title: 'Họp team định kỳ',
        dueDate: '2026-07-19',
        dueTime: '10:00',
        folderId: 'folder-work',
        completedAt: null,
        position: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'task-weekly-report',
        title: 'Chuẩn bị báo cáo tuần',
        dueDate: '2026-07-19',
        dueTime: null,
        folderId: 'folder-work',
        completedAt: null,
        position: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'task-evening-meditation',
        title: 'Thiền buổi tối',
        dueDate: '2026-07-19',
        dueTime: null,
        folderId: 'folder-personal',
        completedAt: '2026-07-18T11:00:00.000Z',
        position: 3,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'task-water-plants',
        title: 'Tưới cây 🪴',
        dueDate: '2026-07-19',
        dueTime: null,
        folderId: 'folder-personal',
        completedAt: null,
        position: 4,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

export async function seedDatabase(
  database: MochiDatabase,
  fixtures = createSeedFixtures(),
) {
  const transaction = database.transaction(
    ['attachments', 'folders', 'notes', 'reminders', 'settings', 'tasks'],
    'readwrite',
  );

  const existingSettings = await transaction.objectStore('settings').get('app');
  if (existingSettings) {
    if (existingSettings.schemaVersion !== MOCHI_DATABASE_VERSION) {
      await transaction.objectStore('settings').put({
        ...existingSettings,
        schemaVersion: MOCHI_DATABASE_VERSION,
        updatedAt: new Date().toISOString(),
      });
    }
    await transaction.done;
    return false;
  }

  await Promise.all([
    ...fixtures.attachments.map((attachment) =>
      transaction.objectStore('attachments').put(attachment),
    ),
    ...fixtures.folders.map((folder) => transaction.objectStore('folders').put(folder)),
    ...fixtures.notes.map((note) => transaction.objectStore('notes').put(note)),
    ...fixtures.reminders.map((reminder) =>
      transaction.objectStore('reminders').put(reminder),
    ),
    transaction.objectStore('settings').put(fixtures.settings),
    ...fixtures.tasks.map((task) => transaction.objectStore('tasks').put(task)),
  ]);
  await transaction.done;
  return true;
}
