import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { deleteMochiDatabase, openMochiDatabase } from '../db/database';
import type { MochiDatabase } from '../db/database';
import { createMochiRepositories, createSyncedMochiRepositories } from '../db/repositories';
import type { MochiRepositories } from '../db/repositories';
import { createDefaultSettings } from '../db/seed';
import type { Settings } from '../db/models';
import { INITIAL_AUTH_STATE, listenForAuthState, readAuthState, requestEmailOtp, signOutFromSupabase, verifyEmailOtp } from '../supabase/auth';
import { getDeviceId } from '../supabase/storage';
import { importGuestData } from '../supabase/merge';
import { isSupabaseDataChangedMessage } from '../supabase/messages';
import { requestSupabaseBackgroundSync } from '../supabase/outbox';
import type { AuthControls, AuthState, SyncState } from '../supabase/types';
import { createLocaleChangedMessage } from '../i18n/background';
import { detectBrowserLocale, settingsLocaleToAppLocale } from '../i18n/locale';
import { translate } from '../i18n/translate';

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

async function ensureSettings(repositories: MochiRepositories) {
  const stored = await repositories.settings.get();
  if (stored) return stored;
  const defaults = createDefaultSettings();
  await repositories.settings.put(defaults);
  return defaults;
}

function providerText(key: Parameters<typeof translate>[1], settings?: Settings | null) {
  return translate(settings ? settingsLocaleToAppLocale(settings.locale) : detectBrowserLocale(), key);
}

export function MochiDataProvider({ children, databaseInitializer, databaseName }: MochiDataProviderProps) {
  const [database, setDatabase] = useState<MochiDatabase | null>(null);
  const [repositories, setRepositories] = useState<MochiRepositories | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthState>(INITIAL_AUTH_STATE);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({ error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' });
  const [dataRevision, setDataRevision] = useState(0);
  const markSyncPending = useCallback(() => {
    setSync((current) => ({ ...current, status: 'pending' }));
  }, []);

  const authenticatedUserId = auth.user?.id ?? null;
  const syncDeviceId = authenticatedUserId ? deviceId : null;
  const authReady = auth.status !== 'initializing';
  const effectiveDatabaseName = `${databaseName ?? 'mochi-note'}${authenticatedUserId ? `:${authenticatedUserId}` : ''}`;

  useEffect(() => {
    let active = true;
    void readAuthState().then((state) => { if (active) setAuth(state); });
    void getDeviceId().then((id) => { if (active) setDeviceId(id); });
    const unsubscribe = listenForAuthState((state) => { if (active) setAuth(state); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId) return;
    const onMessage = (message: unknown) => {
      if (isSupabaseDataChangedMessage(message) && message.userId === userId) {
        if (message.entityTypes.length > 0) setDataRevision((current) => current + 1);
        if (message.syncState) setSync(message.syncState);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [auth.user?.id]);

  useEffect(() => {
    // Wait for auth restoration, and for device identity when opening a synced account database.
    if (!authReady || (authenticatedUserId && !syncDeviceId)) return;

    let cancelled = false;
    let database: MochiDatabase | undefined;

    async function initializeDatabase() {
      try {
        database = await openMochiDatabase(effectiveDatabaseName);
        await databaseInitializer?.(database);

        if (!cancelled) {
          setDatabase(database);
          const nextRepositories = authenticatedUserId && syncDeviceId
            ? createSyncedMochiRepositories(database, { deviceId: syncDeviceId, onMutation: markSyncPending })
            : createMochiRepositories(database);
          setRepositories(nextRepositories);
          setSettings(await ensureSettings(nextRepositories));
          setErrorMessage(null);
          if (authenticatedUserId && syncDeviceId) {
            markSyncPending();
            void requestSupabaseBackgroundSync();
          }
        }
      } catch (error) {
        database?.close();
        if (!cancelled) {
          setDatabase(null);
          setRepositories(null);
          setSettings(null);
          setErrorMessage(error instanceof Error ? error.message : providerText('app.loadError'));
        }
      }
    }

    void initializeDatabase();

    return () => {
      cancelled = true;
      database?.close();
    };
  }, [authReady, authenticatedUserId, databaseInitializer, effectiveDatabaseName, markSyncPending, syncDeviceId]);

  const refreshData = useCallback(async () => {
    if (!database) return;
    const nextRepositories = authenticatedUserId && syncDeviceId
      ? createSyncedMochiRepositories(database, { deviceId: syncDeviceId, onMutation: markSyncPending })
      : createMochiRepositories(database);
    setRepositories(nextRepositories);
    setSettings(await ensureSettings(nextRepositories));
  }, [authenticatedUserId, database, markSyncPending, syncDeviceId]);

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
    if (changes.locale && changes.locale !== settings?.locale && typeof browser !== 'undefined' && browser.runtime?.id) {
      try {
        await browser.runtime.sendMessage(createLocaleChangedMessage(settingsLocaleToAppLocale(nextSettings.locale)));
      } catch {
        // Background can be asleep in tests or non-extension renderers.
      }
    }
  }, [repositories, settings]);

  const resetSettings = useCallback(async () => {
    if (!repositories) return;
    const nextSettings = createDefaultSettings();
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
    if (typeof browser !== 'undefined' && browser.runtime?.id) try {
      await browser.runtime.sendMessage(createLocaleChangedMessage(settingsLocaleToAppLocale(nextSettings.locale)));
    } catch {
      // Background can be asleep in tests or non-extension renderers.
    }
  }, [repositories]);

  const syncNow = useCallback(async () => {
    if (!auth.user) return;
    markSyncPending();
    await requestSupabaseBackgroundSync();
  }, [auth.user, markSyncPending]);

  const authControls = useMemo<AuthControls>(() => ({
    async requestEmailOtp(email, language) {
      await requestEmailOtp(email, language);
    },
    async verifyEmailOtp(email, token) {
      const nextAuth = await verifyEmailOtp(email, token);
      if (nextAuth.user && deviceId) {
        database?.close();
        const guestName = databaseName ?? 'mochi-note';
        await importGuestData(guestName, guestName + ':' + nextAuth.user.id, nextAuth.user.id, deviceId);
      }
      setAuth(nextAuth);
    },
    async signOut() {
      if (database && await database.count('attachments') > 0) {
        throw new Error(providerText('account.signOutAttachmentError', settings));
      }
      const oldDatabase = database;
      oldDatabase?.close();
      await signOutFromSupabase();
      await deleteMochiDatabase(effectiveDatabaseName);
      setAuth({ ...INITIAL_AUTH_STATE, status: 'signed-out' });
      setSync({ error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' });
    },
  }), [database, databaseName, deviceId, effectiveDatabaseName, settings]);

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
