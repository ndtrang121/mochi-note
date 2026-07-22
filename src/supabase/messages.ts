import type { SyncEntityType, SyncState } from './types';

export const SUPABASE_DATA_CHANGED_MESSAGE = 'MOCHI_SUPABASE_DATA_CHANGED';
export const SUPABASE_SYNC_REQUEST_MESSAGE = 'MOCHI_SUPABASE_SYNC_REQUEST';

export interface SupabaseSyncRequestMessage {
  entityTypes?: SyncEntityType[];
  type: typeof SUPABASE_SYNC_REQUEST_MESSAGE;
}

export interface SupabaseDataChangedMessage {
  entityTypes: SyncEntityType[];
  syncState?: SyncState;
  type: typeof SUPABASE_DATA_CHANGED_MESSAGE;
  userId: string;
}

export function createSupabaseDataChangedMessage(
  userId: string,
  entityTypes: SyncEntityType[],
  syncState?: SyncState,
): SupabaseDataChangedMessage {
  return { entityTypes, syncState, type: SUPABASE_DATA_CHANGED_MESSAGE, userId };
}

export function isSupabaseDataChangedMessage(
  message: unknown,
): message is SupabaseDataChangedMessage {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Partial<SupabaseDataChangedMessage>;
  return candidate.type === SUPABASE_DATA_CHANGED_MESSAGE
    && typeof candidate.userId === 'string'
    && Array.isArray(candidate.entityTypes);
}


export function createSupabaseSyncRequestMessage(
  entityTypes?: SyncEntityType[],
): SupabaseSyncRequestMessage {
  return entityTypes?.length
    ? { entityTypes: [...new Set(entityTypes)], type: SUPABASE_SYNC_REQUEST_MESSAGE }
    : { type: SUPABASE_SYNC_REQUEST_MESSAGE };
}

export function isSupabaseSyncRequestMessage(
  message: unknown,
): message is SupabaseSyncRequestMessage {
  if (!message || typeof message !== 'object') return false;
  const candidate = message as Partial<SupabaseSyncRequestMessage>;
  return candidate.type === SUPABASE_SYNC_REQUEST_MESSAGE
    && (candidate.entityTypes === undefined || Array.isArray(candidate.entityTypes));
}
