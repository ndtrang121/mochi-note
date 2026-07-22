import type { SyncEntityType } from './types';

export const SUPABASE_DATA_CHANGED_MESSAGE = 'MOCHI_SUPABASE_DATA_CHANGED';

export interface SupabaseDataChangedMessage {
  entityTypes: SyncEntityType[];
  type: typeof SUPABASE_DATA_CHANGED_MESSAGE;
  userId: string;
}

export function createSupabaseDataChangedMessage(
  userId: string,
  entityTypes: SyncEntityType[],
): SupabaseDataChangedMessage {
  return { entityTypes, type: SUPABASE_DATA_CHANGED_MESSAGE, userId };
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
