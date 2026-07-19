import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { openMochiDatabase } from '../db/database';
import type { MochiDatabase } from '../db/database';
import { createMochiRepositories } from '../db/repositories';
import type { MochiRepositories } from '../db/repositories';
import { createSeedFixtures, seedDatabase } from '../db/seed';
import type { Settings } from '../db/models';

interface MochiDataValue {
  database: MochiDatabase | null;
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
}

const MochiDataContext = createContext<MochiDataValue | null>(null);

export function MochiDataProvider({ children, databaseName }: MochiDataProviderProps) {
  const [database, setDatabase] = useState<MochiDatabase | null>(null);
  const [repositories, setRepositories] = useState<MochiRepositories | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let cancelled = false;
    let database: MochiDatabase | undefined;

    async function initializeDatabase() {
      try {
        database = await openMochiDatabase(databaseName);
        await seedDatabase(database);

        if (!cancelled) {
          setDatabase(database);
          const nextRepositories = createMochiRepositories(database);
          setRepositories(nextRepositories);
          setSettings((await nextRepositories.settings.get()) ?? null);
          setErrorMessage(null);
        }
      } catch (error) {
        database?.close();
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
      database?.close();
    };
  }, [databaseName]);

  const refreshData = useCallback(async () => {
    if (!database) return;
    const nextRepositories = createMochiRepositories(database);
    setRepositories(nextRepositories);
    setSettings((await nextRepositories.settings.get()) ?? null);
  }, [database]);

  const updateSettings = useCallback(async (changes: Partial<Settings>) => {
    if (!repositories || !settings) return;
    const nextSettings: Settings = {
      ...settings,
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
  }, [repositories, settings]);

  const resetSettings = useCallback(async () => {
    if (!repositories) return;
    const defaults = createSeedFixtures().settings;
    const nextSettings: Settings = {
      ...defaults,
      updatedAt: new Date().toISOString(),
    };
    await repositories.settings.put(nextSettings);
    setSettings(nextSettings);
  }, [repositories]);

  const value = useMemo<MochiDataValue>(
    () => ({
      database,
      errorMessage,
      refreshData,
      repositories,
      resetSettings,
      settings,
      status: errorMessage ? 'error' : repositories ? 'ready' : 'loading',
      updateSettings,
    }),
    [database, errorMessage, refreshData, repositories, resetSettings, settings, updateSettings],
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
