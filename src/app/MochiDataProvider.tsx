import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { openMochiDatabase } from '../db/database';
import type { MochiDatabase } from '../db/database';
import { createMochiRepositories } from '../db/repositories';
import type { MochiRepositories } from '../db/repositories';
import { seedDatabase } from '../db/seed';

interface MochiDataValue {
  errorMessage: string | null;
  repositories: MochiRepositories | null;
  status: 'error' | 'loading' | 'ready';
}

interface MochiDataProviderProps {
  children: ReactNode;
  databaseName?: string;
}

const MochiDataContext = createContext<MochiDataValue | null>(null);

export function MochiDataProvider({ children, databaseName }: MochiDataProviderProps) {
  const [repositories, setRepositories] = useState<MochiRepositories | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let database: MochiDatabase | undefined;

    async function initializeDatabase() {
      try {
        database = await openMochiDatabase(databaseName);
        await seedDatabase(database);

        if (!cancelled) {
          setRepositories(createMochiRepositories(database));
          setErrorMessage(null);
        }
      } catch (error) {
        database?.close();
        if (!cancelled) {
          setRepositories(null);
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

  const value = useMemo<MochiDataValue>(
    () => ({
      errorMessage,
      repositories,
      status: errorMessage ? 'error' : repositories ? 'ready' : 'loading',
    }),
    [errorMessage, repositories],
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
