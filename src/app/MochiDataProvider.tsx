import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { openMochiDatabase } from '../db/database';
import type { MochiDatabase } from '../db/database';
import { createMochiRepositories } from '../db/repositories';
import type { MochiRepositories } from '../db/repositories';
import { createDefaultSettings } from '../db/seed';
import type { Settings } from '../db/models';
import {
  createDefaultDriveSyncService,
  type DriveSyncService,
  type DriveSyncViewState,
} from '../sync/driveSyncService';

export interface DriveSyncControls extends DriveSyncViewState {
  connect: () => Promise<void>;
  deleteAll: () => Promise<void>;
  deleteLocal: () => Promise<void>;
  deleteLocalOnly: () => Promise<void>;
  deleteRemote: () => Promise<void>;
  disconnect: () => Promise<void>;
  rebuildRemote: () => Promise<void>;
  restoreRevision: (revisionId: string) => Promise<void>;
  syncNow: () => Promise<void>;
}

interface MochiDataValue {
  database: MochiDatabase | null;
  driveSync: DriveSyncControls;
  errorMessage: string | null;
  refreshData: () => Promise<void>;
  repositories: MochiRepositories | null;
  resetSettings: () => Promise<void>;
  settings: Settings | null;
  status: 'error' | 'loading' | 'ready';
  updateSettings: (changes: Partial<Settings>) => Promise<void>;
}

interface MochiDataProviderProps {
  children: ReactNode;
  databaseName?: string;
  databaseInitializer?: (database: MochiDatabase) => Promise<void>;
  driveSyncServiceFactory?: (database: MochiDatabase) => DriveSyncService;
}

const INITIAL_DRIVE_SYNC_STATE: DriveSyncViewState = {
  accountEmail: null,
  canDeleteAll: false,
  canDeleteLocal: false,
  error: null,
  hasPendingChanges: false,
  lastResult: null,
  lastStableStatus: 'disconnected',
  lastSyncedAt: null,
  legacyDevices: [],
  revisions: [],
  status: 'disconnected',
  supportsBackgroundRefresh: true,
};

const MochiDataContext = createContext<MochiDataValue | null>(null);

export function MochiDataProvider({ children, databaseInitializer, databaseName, driveSyncServiceFactory }: MochiDataProviderProps) {
  const [database, setDatabase] = useState<MochiDatabase | null>(null);
  const [repositories, setRepositories] = useState<MochiRepositories | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [driveSyncState, setDriveSyncState] = useState(INITIAL_DRIVE_SYNC_STATE);
  const driveSyncServiceRef = useRef<DriveSyncService | null>(null);
  const driveSyncStatusRef = useRef(driveSyncState.status);
  const syncTimerRef = useRef<number | null>(null);

  const reloadData = useCallback(async (currentDatabase: MochiDatabase) => {
    const nextRepositories = createMochiRepositories(currentDatabase);
    setRepositories(nextRepositories);
    setSettings((await nextRepositories.settings.get()) ?? null);
  }, []);

  const setDriveState = useCallback((state: DriveSyncViewState) => {
    driveSyncStatusRef.current = state.status;
    setDriveSyncState(state);
  }, []);

  const finishDriveSync = useCallback(async (service: DriveSyncService, currentDatabase: MochiDatabase) => {
    await reloadData(currentDatabase);
    setDriveState(await service.viewState('ready'));
  }, [reloadData, setDriveState]);

  useEffect(() => {
    let cancelled = false;
    let openedDatabase: MochiDatabase | undefined;

    async function initializeDatabase() {
      try {
        openedDatabase = await openMochiDatabase(databaseName);
        await databaseInitializer?.(openedDatabase);
        if (!cancelled) {
          setDatabase(openedDatabase);
          await reloadData(openedDatabase);
          setErrorMessage(null);

          // Drive setup is best effort so cloud failures never take the local database offline.
          let service: DriveSyncService | null = null;
          let recoveryStatus: DriveSyncViewState['lastStableStatus'] = 'disconnected';
          try {
            service = driveSyncServiceFactory?.(openedDatabase) ?? createDefaultDriveSyncService(openedDatabase);
            driveSyncServiceRef.current = service;
            const initialState = await service.initialize();
            recoveryStatus = initialState.lastStableStatus;
            if (cancelled) return;
            setDriveState(initialState);
            if (initialState.status === 'ready') {
              setDriveState(await service.viewState('syncing'));
              await service.sync();
              if (!cancelled) await finishDriveSync(service, openedDatabase);
            }
          } catch (error) {
            if (cancelled) return;
            const errorMessage = errorMessageFrom(error);
            setDriveState(
              service
                ? await service.viewState(statusFromError(error, driveSyncStatusRef.current === 'authorizing' || driveSyncStatusRef.current === 'syncing' ? recoveryStatus : driveSyncStatusRef.current), errorMessage)
                : { ...INITIAL_DRIVE_SYNC_STATE, error: errorMessage },
            );
          }
        }
      } catch (error) {
        openedDatabase?.close();
        if (!cancelled) {
          setDatabase(null);
          setRepositories(null);
          setSettings(null);
          setErrorMessage(error instanceof Error ? error.message : 'Không thể mở dữ liệu MochiNote.');
        }
      }
    }

    void initializeDatabase();

    return () => {
      cancelled = true;
      driveSyncServiceRef.current = null;
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
      openedDatabase?.close();
    };
  }, [databaseInitializer, databaseName, driveSyncServiceFactory, finishDriveSync, reloadData, setDriveState]);

  const scheduleForegroundSync = useCallback(() => {
    if (!database || driveSyncStatusRef.current !== 'ready' || !driveSyncServiceRef.current) return;
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    setDriveState({ ...driveSyncState, error: null, errorKind: undefined, hasPendingChanges: true, status: 'ready' });
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      const service = driveSyncServiceRef.current;
      if (!service || driveSyncStatusRef.current !== 'ready') return;
      setDriveState({ ...driveSyncState, error: null, errorKind: undefined, hasPendingChanges: true, status: 'syncing' });
      void service.sync()
        .then(() => finishDriveSync(service, database))
        .catch(async (error: unknown) => {
          const failedState = await service.viewState(statusFromError(error, driveSyncState.lastStableStatus), errorMessageFrom(error));
          setDriveState({ ...failedState, errorKind: errorKindFrom(error), hasPendingChanges: true });
        });
    }, 2_000);
  }, [database, driveSyncState, finishDriveSync, setDriveState]);

  const refreshData = useCallback(async () => {
    if (!database) return;
    await reloadData(database);
    scheduleForegroundSync();
  }, [database, reloadData, scheduleForegroundSync]);

  const updateSettings = useCallback(async (changes: Partial<Settings>) => {
    if (!repositories) return;
    const nextSettings: Settings = {
      ...(settings ?? createDefaultSettings()),
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
    scheduleForegroundSync();
  }, [repositories, scheduleForegroundSync, settings]);

  const resetSettings = useCallback(async () => {
    if (!repositories) return;
    const nextSettings = createDefaultSettings();
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
    scheduleForegroundSync();
  }, [repositories, scheduleForegroundSync]);

  const runDriveAction = useCallback(async (
    pendingStatus: DriveSyncViewState['status'],
    operation: (service: DriveSyncService) => Promise<DriveSyncViewState>,
  ) => {
    const service = driveSyncServiceRef.current;
    if (!service || driveSyncStatusRef.current === 'authorizing' || driveSyncStatusRef.current === 'syncing') return;
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    setDriveState({ ...driveSyncState, error: null, errorKind: undefined, status: pendingStatus });
    try {
      const nextState = await operation(service);
      setDriveState(nextState);
      if (database) await reloadData(database);
    } catch (error) {
      const failedState = await service.viewState(statusFromError(error, driveSyncState.lastStableStatus), errorMessageFrom(error));
      setDriveState({
        ...failedState,
        errorKind: errorKindFrom(error),
        hasPendingChanges: driveSyncState.hasPendingChanges,
      });
    }
  }, [database, driveSyncState, reloadData, setDriveState]);

  const driveSync = useMemo<DriveSyncControls>(() => ({
    ...driveSyncState,
    connect: () => runDriveAction('authorizing', (service) => service.connect()),
    deleteAll: () => runDriveAction('syncing', (service) => service.deleteAllData()),
    deleteLocal: () => runDriveAction('syncing', (service) => service.deleteLocalData()),
    deleteLocalOnly: () => runDriveAction('syncing', (service) => service.deleteLocalOnlyData()),
    deleteRemote: () => runDriveAction('syncing', (service) => service.deleteRemoteVault()),
    disconnect: () => runDriveAction('syncing', (service) => service.disconnect()),
    rebuildRemote: () => runDriveAction('syncing', (service) => service.rebuildRemoteFromLocal()),
    restoreRevision: (revisionId) => runDriveAction('syncing', (service) => service.restoreRevision(revisionId)),
    syncNow: () => runDriveAction('syncing', async (service) => {
      await service.sync();
      return service.viewState('ready');
    }),
  }), [driveSyncState, runDriveAction]);

  const value = useMemo<MochiDataValue>(
    () => ({
      database,
      driveSync,
      errorMessage,
      refreshData,
      repositories,
      resetSettings,
      settings,
      status: errorMessage ? 'error' : repositories ? 'ready' : 'loading',
      updateSettings,
    }),
    [database, driveSync, errorMessage, refreshData, repositories, resetSettings, settings, updateSettings],
  );

  return <MochiDataContext.Provider value={value}>{children}</MochiDataContext.Provider>;
}

export function useMochiData() {
  const value = useContext(MochiDataContext);

  if (!value) throw new Error('useMochiData must be used inside MochiDataProvider.');
  return value;
}

function errorMessageFrom(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể đồng bộ Google Drive.';
}

function statusFromError(error: unknown, fallback: DriveSyncViewState['status']): DriveSyncViewState['status'] {
  return error && typeof error === 'object' && 'kind' in error && error.kind === 'remoteMissing'
    ? 'remote-missing'
    : fallback;
}

function errorKindFrom(error: unknown): DriveSyncViewState['errorKind'] {
  if (error && typeof error === 'object') {
    if ('kind' in error && typeof error.kind === 'string') {
      const knownKinds: DriveSyncViewState['errorKind'][] = [
        'oauthExpired', 'remoteMissing', 'network', 'schemaIncompatible', 'mergeFailure', 'permission',
      ];
      if (knownKinds.includes(error.kind as DriveSyncViewState['errorKind'])) {
        return error.kind as DriveSyncViewState['errorKind'];
      }
    }
    if ('status' in error && typeof error.status === 'number') {
      if (error.status === 401) return 'oauthExpired';
      if (error.status === 403) return 'permission';
      if (error.status === 0 || error.status === 429 || error.status >= 500) return 'network';
    }
  }
  return error instanceof TypeError ? 'network' : 'mergeFailure';
}
