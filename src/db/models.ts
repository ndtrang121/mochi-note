export type EntityId = string;
export type IsoDate = string;
export type IsoDateTime = string;

export type JsonValue =
  | boolean
  | number
  | string
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type NoteColor = 'blush' | 'blue' | 'lilac' | 'peach' | 'sage' | 'yellow';
export type NotePattern =
  | 'dots'
  | 'grid'
  | 'hearts'
  | 'lined'
  | 'plain'
  | 'stars'
  | 'stripes';

interface TimestampedEntity {
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Folder extends TimestampedEntity {
  color: NoteColor;
  icon: string;
  id: EntityId;
  name: string;
  parentId: EntityId | null;
  position: number;
}

export interface NoteSourceMetadata {
  capturedAt: IsoDateTime;
  faviconUrl?: string;
  pageTitle: string;
  screenshotAttachmentId?: EntityId;
  url: string;
}

export interface Note extends TimestampedEntity {
  archivedAt?: IsoDateTime | null;
  color: NoteColor;
  content: JsonValue;
  deletedAt: IsoDateTime | null;
  favorite: boolean;
  folderId: EntityId | null;
  id: EntityId;
  pattern: NotePattern;
  pinned: boolean;
  plainText: string;
  source: NoteSourceMetadata | null;
  tags: string[];
  title: string;
}

export interface Task extends TimestampedEntity {
  completedAt: IsoDateTime | null;
  dueDate: IsoDate | null;
  dueTime: string | null;
  folderId: EntityId | null;
  id: EntityId;
  position: number;
  repeatRule?: 'FREQ=DAILY' | 'FREQ=MONTHLY' | 'FREQ=WEEKLY' | null;
  title: string;
}

export type ReminderOwnerType = 'note' | 'task';

export interface Reminder extends TimestampedEntity {
  enabled: boolean;
  id: EntityId;
  ownerId: EntityId;
  ownerType: ReminderOwnerType;
  repeatRule: string | null;
  scheduledAt: IsoDateTime;
  timezone: string;
}

export type AttachmentKind = 'audio' | 'capture' | 'file' | 'image';

export interface Attachment extends TimestampedEntity {
  blob: Blob;
  fileName?: string;
  id: EntityId;
  kind: AttachmentKind;
  mimeType: string;
  noteId: EntityId;
  size: number;
}

export interface Settings {
  id: 'app';
  layout: 'grid' | 'list';
  locale: 'en' | 'vi';
  recentColors: NoteColor[];
  schemaVersion: number;
  theme: 'dark' | 'light' | 'system';
  updatedAt: IsoDateTime;
}

export interface SeedFixtures {
  attachments: Attachment[];
  folders: Folder[];
  notes: Note[];
  reminders: Reminder[];
  settings: Settings;
  tasks: Task[];
}
