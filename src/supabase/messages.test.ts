import { describe, expect, it } from 'vitest';

import {
  createSupabaseSyncRequestMessage,
  isSupabaseSyncRequestMessage,
} from './messages';

describe('Supabase sync request messages', () => {
  it('uses an omitted scope for a full sync request', () => {
    expect(createSupabaseSyncRequestMessage()).toEqual({
      type: 'MOCHI_SUPABASE_SYNC_REQUEST',
    });
  });

  it('deduplicates entity types for a mutation-scoped request', () => {
    const message = createSupabaseSyncRequestMessage(['note', 'note']);

    expect(message).toEqual({
      entityTypes: ['note'],
      type: 'MOCHI_SUPABASE_SYNC_REQUEST',
    });
    expect(isSupabaseSyncRequestMessage(message)).toBe(true);
  });
});
