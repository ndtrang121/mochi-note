import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'initializing' | 'signed-out' | 'signed-in' | 'error';
export type AuthLanguage = 'en' | 'vi';
export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'offline' | 'error' | 'blocked_quota';
export type SyncEntityType = 'folder' | 'note' | 'task' | 'reminder' | 'settings';
export type SyncOperation = 'upsert' | 'delete';

export interface AuthState {
  error: string | null;
  session: Session | null;
  status: AuthStatus;
  user: User | null;
}

export interface SyncOutboxItem {
  blockedReason?: 'quota';
  clientUpdatedAt: string;
  deviceId: string;
  entityId: string;
  entityType: SyncEntityType;
  id: string;
  nextAttemptAt: string | null;
  operation: SyncOperation;
  payload: Record<string, unknown> | null;
  retryCount: number;
  lastError?: string;
}

export interface SyncCursor {
  entityType: SyncEntityType;
  version: number;
}

export interface SyncState {
  cloudStorage: CloudStorageUsage | null;
  error: string | null;
  lastSyncedAt: string | null;
  pendingCount: number;
  status: SyncStatus;
}

export interface SyncResult extends SyncState {
  changedEntityTypes: SyncEntityType[];
}

export interface AuthControls {
  requestEmailOtp: (email: string, language: AuthLanguage) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmailOtp: (email: string, token: string) => Promise<void>;
}

export interface SupabaseSyncConfig {
  databaseName: string;
  deviceId: string;
  userId: string;
}

export type CloudStorageStatus = 'ok' | 'warning' | 'full' | 'over_limit' | 'unlimited';

export interface CloudStorageUsage {
  limitBytes: number | null;
  planCode: string;
  status: CloudStorageStatus;
  usedBytes: number;
}
