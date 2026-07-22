import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { sessionStorageAdapter } from './storage';

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (client) return client;
  const url = import.meta.env.WXT_PUBLIC_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.WXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !publishableKey) return null;

  client = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: sessionStorageAdapter,
    },
  });
  return client;
}

export function requireSupabaseClient() {
  const configured = getSupabaseClient();
  if (!configured) {
    throw new Error('Supabase chưa được cấu hình.');
  }
  return configured;
}
