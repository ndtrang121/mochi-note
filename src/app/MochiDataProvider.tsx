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
import { hasGuestData, importGuestData } from '../supabase/merge';
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
  localDataChoice: {
    chooseCloud: () => Promise<void>;
    chooseSync: () => Promise<void>;
    status: 'checking' | 'not-required' | 'required' | 'processing';
  };
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

async function ensureSettings(repositories: MochiRepositories, persistDefaults = true) {
  const stored = await repositories.settings.get();
  if (stored) return stored;
  const defaults = createDefaultSettings();
  if (persistDefaults) await repositories.settings.put(defaults);
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
  const [sync, setSync] = useState<SyncState>({ cloudStorage: null, error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' });
  const [dataRevision, setDataRevision] = useState(0);
  const [databaseGeneration, setDatabaseGeneration] = useState(0);
  const [localDataChoiceStatus, setLocalDataChoiceStatus] = useState<'checking' | 'not-required' | 'required' | 'processing'>('checking');
  const [accountDataUserId, setAccountDataUserId] = useState<string | null>(null);
  const markSyncPending = useCallback(() => {
    setSync((current) => ({ ...current, status: 'pending' }));
  }, []);

  const signedInUserId = auth.user?.id ?? null;
  const authenticatedUserId = signedInUserId && accountDataUserId === signedInUserId ? signedInUserId : null;
  const syncDeviceId = authenticatedUserId ? deviceId : null;
  const authReady = auth.status !== 'initializing';
  const databaseChoiceReady = !signedInUserId || authenticatedUserId === signedInUserId;
  const effectiveDatabaseName = `${databaseName ?? 'mochi-note'}${authenticatedUserId ? `:${authenticatedUserId}` : ''}`;

  useEffect(() => {
    let active = true;
    void readAuthState().then((state) => { if (active) setAuth(state); });
    void getDeviceId().then((id) => { if (active) setDeviceId(id); });
    const unsubscribe = listenForAuthState((state) => { if (active) setAuth(state); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!signedInUserId) {
      setAccountDataUserId(null);
      setLocalDataChoiceStatus('not-required');
      return;
    }
    if (!deviceId) {
      setLocalDataChoiceStatus('checking');
      return;
    }

    let active = true;
    setAccountDataUserId(null);
    setLocalDataChoiceStatus('checking');
    void hasGuestData(databaseName ?? 'mochi-note')
      .then((hasData) => {
        if (!active) return;
        if (!hasData) setAccountDataUserId(signedInUserId);
        setLocalDataChoiceStatus(hasData ? 'required' : 'not-required');
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(error instanceof Error ? error.message : providerText('app.loadError'));
      });
    return () => { active = false; };
  }, [databaseName, deviceId, signedInUserId]);

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
    if (!authReady || !databaseChoiceReady || (authenticatedUserId && !syncDeviceId)) {
      setDatabase(null);
      setRepositories(null);
      setSettings(null);
      return;
    }

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
          // Let the first cloud pull provide account settings instead of pushing
          // fresh defaults that could overwrite an existing cloud preference.
          setSettings(await ensureSettings(nextRepositories, !authenticatedUserId));
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
  }, [authReady, authenticatedUserId, databaseChoiceReady, databaseGeneration, databaseInitializer, effectiveDatabaseName, markSyncPending, syncDeviceId]);

  const refreshData = useCallback(async () => {
    if (!database) return;
    const nextRepositories = authenticatedUserId && syncDeviceId
      ? createSyncedMochiRepositories(database, { deviceId: syncDeviceId, onMutation: markSyncPending })
      : createMochiRepositories(database);
    setRepositories(nextRepositories);
    setSettings(await ensureSettings(nextRepositories, !authenticatedUserId));
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

  const prepareForLocalDataChoice = useCallback(() => {
    database?.close();
    setDatabase(null);
    setRepositories(null);
    setSettings(null);
    setLocalDataChoiceStatus('processing');
  }, [database]);

  const chooseSync = useCallback(async () => {
    if (!signedInUserId || !deviceId) return;
    prepareForLocalDataChoice();
    const guestName = databaseName ?? 'mochi-note';
    try {
      await importGuestData(guestName, `${guestName}:${signedInUserId}`, deviceId);
      setAccountDataUserId(signedInUserId);
      setLocalDataChoiceStatus('not-required');
    } catch (error) {
      setLocalDataChoiceStatus('required');
      setDatabaseGeneration((current) => current + 1);
      throw error;
    }
  }, [databaseName, deviceId, prepareForLocalDataChoice, signedInUserId]);

  const chooseCloud = useCallback(async () => {
    if (!signedInUserId) return;
    prepareForLocalDataChoice();
    try {
      await deleteMochiDatabase(databaseName ?? 'mochi-note');
      setAccountDataUserId(signedInUserId);
      setLocalDataChoiceStatus('not-required');
    } catch (error) {
      setLocalDataChoiceStatus('required');
      setDatabaseGeneration((current) => current + 1);
      throw error;
    }
  }, [databaseName, prepareForLocalDataChoice, signedInUserId]);

  const authControls = useMemo<AuthControls>(() => ({
    async requestEmailOtp(email, language) {
      await requestEmailOtp(email, language);
    },
    async verifyEmailOtp(email, token) {
      const nextAuth = await verifyEmailOtp(email, token);
      setAuth(nextAuth);
    },
    async signOut() {
      const oldDatabase = database;
      oldDatabase?.close();
      await signOutFromSupabase();
      await deleteMochiDatabase(effectiveDatabaseName);
      setAccountDataUserId(null);
      setAuth({ ...INITIAL_AUTH_STATE, status: 'signed-out' });
      setSync({ cloudStorage: null, error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' });
    },
  }), [database, effectiveDatabaseName, settings]);

  const localDataChoice = useMemo(() => ({
    chooseCloud,
    chooseSync,
    status: localDataChoiceStatus,
  }), [chooseCloud, chooseSync, localDataChoiceStatus]);

  const value = useMemo<MochiDataValue>(
    () => ({
      auth,
      authControls,
      dataRevision,
      database,
      errorMessage,
      localDataChoice,
      refreshData,
      repositories,
      resetSettings,
      settings,
      status: errorMessage ? 'error' : repositories ? 'ready' : 'loading',
      sync,
      syncNow,
      updateSettings,
    }),
    [auth, authControls, dataRevision, database, errorMessage, localDataChoice, refreshData, repositories, resetSettings, settings, sync, syncNow, updateSettings],
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
