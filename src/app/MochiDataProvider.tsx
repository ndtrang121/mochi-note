import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { deleteMochiDatabase, openMochiDatabase } from '../db/database';
import type { MochiDatabase } from '../db/database';
import { createMochiRepositories, createSyncedMochiRepositories } from '../db/repositories';
import type { MochiRepositories } from '../db/repositories';
import { createDefaultSettings } from '../db/seed';
import type { Settings } from '../db/models';
import { INITIAL_AUTH_STATE, listenForAuthState, readAuthState, signInWithEmail, signOutFromSupabase, signUpWithEmail } from '../supabase/auth';
import { getDeviceId } from '../supabase/storage';
import { importGuestData } from '../supabase/merge';
import { isSupabaseDataChangedMessage } from '../supabase/messages';
import { syncUserData } from '../supabase/sync';
import type { AuthControls, AuthState, SyncResult, SyncState } from '../supabase/types';

interface MochiDataValue {
  auth: AuthState;
  authControls: AuthControls;
  database: MochiDatabase | null;
  dataRevision: number;
  errorMessage: string | null;
  sync: SyncState;
  refreshData: () => Promise<void>;
  repositories: MochiRepositories | null;
  resetSettings: () => Promise<void>;
  settings: Settings | null;
  status: 'error' | 'loading' | 'ready';
  updateSettings: (changes: Partial<Settings>) => Promise<void>;
  syncNow: () => Promise<void>;
}

interface MochiDataProviderProps {
  children: ReactNode;
  databaseInitializer?: (database: MochiDatabase) => Promise<void | boolean>;
  databaseName?: string;
}

const MochiDataContext = createContext<MochiDataValue | null>(null);

export function MochiDataProvider({ children, databaseInitializer, databaseName }: MochiDataProviderProps) {
  const [database, setDatabase] = useState<MochiDatabase | null>(null);
  const [repositories, setRepositories] = useState<MochiRepositories | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthState>(INITIAL_AUTH_STATE);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' });
  const [dataRevision, setDataRevision] = useState(0);

  const effectiveDatabaseName = `${databaseName ?? 'mochi-note'}${auth.user ? `:${auth.user.id}` : ''}`;

  useEffect(() => {
    let active = true;
    void readAuthState().then((state) => { if (active) setAuth(state); });
    void getDeviceId().then((id) => { if (active) setDeviceId(id); });
    const unsubscribe = listenForAuthState((state) => { if (active) setAuth(state); });
    return () => { active = false; unsubscribe(); };
  }, []);

  const applySyncResult = useCallback((result: SyncResult) => {
    if (result.changedEntityTypes.length > 0) {
      setDataRevision((current) => current + 1);
    }
  }, []);

  const runSync = useCallback(async (
    targetDatabase: MochiDatabase,
    userId: string,
    targetDeviceId: string,
  ) => {
    const result = await syncUserData(targetDatabase, userId, targetDeviceId, setSync);
    applySyncResult(result);
    return result;
  }, [applySyncResult]);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId) return;
    const onMessage = (message: unknown) => {
      if (isSupabaseDataChangedMessage(message) && message.userId === userId) {
        setDataRevision((current) => current + 1);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [auth.user?.id]);

  useEffect(() => {
    let cancelled = false;
    let database: MochiDatabase | undefined;

    async function initializeDatabase() {
      try {
        database = await openMochiDatabase(effectiveDatabaseName);
        await databaseInitializer?.(database);

        if (!cancelled) {
          setDatabase(database);
          const nextRepositories = auth.user && deviceId
            ? createSyncedMochiRepositories(database, { deviceId, onMutation: () => { setSync((current) => ({ ...current, status: 'pending' })); void runSync(database as MochiDatabase, auth.user?.id ?? '', deviceId); } })
            : createMochiRepositories(database);
          setRepositories(nextRepositories);
          setSettings((await nextRepositories.settings.get()) ?? null);
          setErrorMessage(null);
          if (auth.user && deviceId) void runSync(database, auth.user.id, deviceId);
        }
      } catch (error) {
        database?.close();
        if (!cancelled) {
          setDatabase(null);
          setRepositories(null);
          setSettings(null);
          setErrorMessage(error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ má»Ÿ dá»¯ liá»‡u MochiNote.');
        }
      }
    }

    void initializeDatabase();

    return () => {
      cancelled = true;
      database?.close();
    };
  }, [auth.user, databaseInitializer, deviceId, effectiveDatabaseName, runSync]);

  const refreshData = useCallback(async () => {
    if (!database) return;
    const nextRepositories = auth.user && deviceId
      ? createSyncedMochiRepositories(database, { deviceId, onMutation: () => { setSync((current) => ({ ...current, status: 'pending' })); void runSync(database, auth.user?.id ?? '', deviceId); } })
      : createMochiRepositories(database);
    setRepositories(nextRepositories);
    setSettings((await nextRepositories.settings.get()) ?? null);
  }, [auth.user, database, deviceId, runSync]);

  useEffect(() => {
    if (!repositories) return;
    let active = true;
    void repositories.settings.get().then((nextSettings) => {
      if (active) setSettings(nextSettings ?? null);
    });
    return () => { active = false; };
  }, [dataRevision, repositories]);

  const updateSettings = useCallback(async (changes: Partial<Settings>) => {
    if (!repositories) return;
    const nextSettings: Settings = {
      ...(settings ?? createDefaultSettings()),
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
  }, [repositories, settings]);

  const resetSettings = useCallback(async () => {
    if (!repositories) return;
    const nextSettings = createDefaultSettings();
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
  }, [repositories]);

  const syncNow = useCallback(async () => {
    if (!database || !auth.user || !deviceId) return;
    await runSync(database, auth.user.id, deviceId);
  }, [auth.user, database, deviceId, runSync]);

  const authControls = useMemo<AuthControls>(() => ({
    async signIn(email, password) {
      const nextAuth = await signInWithEmail(email, password);
      if (nextAuth.user && deviceId) {
        database?.close();
        const guestName = databaseName ?? 'mochi-note';
        await importGuestData(guestName, guestName + ':' + nextAuth.user.id, nextAuth.user.id, deviceId);
      }
      setAuth(nextAuth);
    },
    async signUp(email, password) {
      const nextAuth = await signUpWithEmail(email, password);
      if (nextAuth.user && deviceId) {
        database?.close();
        const guestName = databaseName ?? 'mochi-note';
        await importGuestData(guestName, guestName + ':' + nextAuth.user.id, nextAuth.user.id, deviceId);
      }
      setAuth(nextAuth);
    },
    async signOut() {
      if (database && await database.count('attachments') > 0) {
        throw new Error('Export or remove local attachments before signing out.');
      }
      const oldDatabase = database;
      oldDatabase?.close();
      await signOutFromSupabase();
      await deleteMochiDatabase(effectiveDatabaseName);
      setAuth({ ...INITIAL_AUTH_STATE, status: 'signed-out' });
      setSync({ error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' });
    },
  }), [database, databaseName, deviceId, effectiveDatabaseName]);

  const value = useMemo<MochiDataValue>(
    () => ({
      auth,
      authControls,
      dataRevision,
      database,
      errorMessage,
      refreshData,
      repositories,
      resetSettings,
      settings,
      status: errorMessage ? 'error' : repositories ? 'ready' : 'loading',
      sync,
      syncNow,
      updateSettings,
    }),
    [auth, authControls, dataRevision, database, errorMessage, refreshData, repositories, resetSettings, settings, sync, syncNow, updateSettings],
  );

  return <MochiDataContext.Provider value={value}>{children}</MochiDataContext.Provider>;
}

export function useMochiData() {
  const value = useContext(MochiDataContext);

  if (!value) {
    throw new Error('useMochiData must be used inside MochiDataProvider.');
  }

  return value;
}
