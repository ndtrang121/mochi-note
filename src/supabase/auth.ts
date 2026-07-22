import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { getSupabaseClient, requireSupabaseClient } from './client';
import type { AuthState } from './types';

export const INITIAL_AUTH_STATE: AuthState = {
  error: null,
  session: null,
  status: 'initializing',
  user: null,
};

export async function readAuthState(): Promise<AuthState> {
  const client = getSupabaseClient();
  if (!client) return { ...INITIAL_AUTH_STATE, status: 'signed-out' };
  const { data, error } = await client.auth.getSession();
  if (error) return { ...INITIAL_AUTH_STATE, error: error.message, status: 'error' };
  return stateFromSession(data.session);
}

export function listenForAuthState(onChange: (state: AuthState) => void) {
  const client = getSupabaseClient();
  if (!client) return () => undefined;
  const { data } = client.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
    onChange(stateFromSession(session));
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithEmail(email: string, password: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return stateFromSession(data.session);
}

export async function signUpWithEmail(email: string, password: string) {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return stateFromSession(data.session);
}

export async function signOutFromSupabase() {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

function stateFromSession(session: Session | null): AuthState {
  return session
    ? { error: null, session, status: 'signed-in', user: session.user }
    : { error: null, session: null, status: 'signed-out', user: null };
}
