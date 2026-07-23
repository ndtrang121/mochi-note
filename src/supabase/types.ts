import type { Session, User } from '@supabase/supabase-js';

export type AuthStatus = 'initializing' | 'signed-out' | 'signed-in' | 'error';
export type AuthLanguage = 'en' | 'vi';
export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'offline' | 'error';
export type SyncEntityType = 'folder' | 'note' | 'task' | 'reminder' | 'settings';
export type SyncOperation = 'upsert' | 'delete';

export interface AuthState {
  error: string | null;
  session: Session | null;
  status: AuthStatus;
  user: User | null;
}

export interface SyncOutboxItem {
  clientUpdatedAt: string;
  deviceId: string;
  entityId: string;
  entityType: SyncEntityType;
  id: string;
  nextAttemptAt: string | null;
  operation: SyncOperation;
  payload: Record<string, unknown> | null;
  retryCount: number;
}

export interface SyncCursor {
  entityType: SyncEntityType;
  version: number;
}

export interface SyncState {
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
