import 'fake-indexeddb/auto';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DriveSyncPanel } from '../features/preferences/DriveSyncPanel';
import { DriveSyncHeaderButton } from './DriveSyncHeaderButton';
import { deleteMochiDatabase, openMochiDatabase } from '../db/database';
import { createMochiRepositories } from '../db/repositories';
import type { DriveSyncService, DriveSyncStatus, DriveSyncViewState } from '../sync/driveSyncService';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

let databaseCounter = 0;
let databaseName = '';

function viewState(status: DriveSyncStatus, error: string | null = null): DriveSyncViewState {
  const stableStatus = status === 'authorizing' || status === 'syncing' ? 'disconnected' : status;
  return {
    accountEmail: status === 'ready' ? 'user@example.com' : null,
    canDeleteAll: status === 'ready',
    canDeleteLocal: status === 'ready',
    error,
    hasPendingChanges: false,
    lastResult: null,
    lastStableStatus: stableStatus,
    lastSyncedAt: null,
    legacyDevices: [],
    revisions: [],
    status,
    supportsBackgroundRefresh: true,
  };
}

function fakeService(initialStatus: DriveSyncStatus, syncError?: Error) {
  const rebuildRemoteFromLocal = vi.fn(() => Promise.resolve(viewState('ready')));
  const sync = vi.fn(() => syncError
    ? Promise.reject(syncError)
    : Promise.resolve({ downloadedSnapshots: 0, mergedRecords: 0, transferredBlobs: 0, uploadedSnapshot: 'device-test.bin' }));
  const service = {
    connect: vi.fn(() => Promise.resolve(viewState('ready'))),
    deleteAllData: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    deleteLocalData: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    deleteRemoteVault: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    disconnect: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    initialize: vi.fn(() => Promise.resolve(viewState(initialStatus))),
    rebuildRemoteFromLocal,
    restoreRevision: vi.fn(() => Promise.resolve(viewState('ready'))),
    sync,
    viewState: vi.fn((status: DriveSyncStatus, error: string | null = null) => Promise.resolve(viewState(status, error))),
  } as unknown as DriveSyncService;
  return { rebuildRemoteFromLocal, service, sync };
}

function ProviderProbe() {
  const { driveSync, repositories, status } = useMochiData();
  return (
    <>
      <span data-testid="local-status">{status}</span>
      <span data-testid="drive-status">{driveSync.status}</span>
      <DriveSyncHeaderButton />
      <button
        disabled={!repositories}
        onClick={() => {
          if (!repositories) return;
          void repositories.tasks.put({
            completedAt: new Date().toISOString(),
            createdAt: '2026-07-21T00:00:00.000Z',
            dueDate: '2026-07-21',
            dueTime: null,
            folderId: null,
            id: 'task-auto-sync',
            position: 0,
            title: 'Trigger auto sync',
            updatedAt: new Date().toISOString(),
          });
        }}
        type="button"
      >
        Mutate task data
      </button>
      <DriveSyncPanel />
    </>
  );
}

function renderProvider(service: DriveSyncService) {
  databaseCounter += 1;
  databaseName = `drive-provider-${databaseCounter}`;
  return render(
    <MochiDataProvider
      databaseName={databaseName}
      driveSyncServiceFactory={() => service}
    >
      <ProviderProbe />
    </MochiDataProvider>,
  );
}

afterEach(async () => {
  cleanup();
  if (databaseName) await deleteMochiDatabase(databaseName);
});

describe('Drive sync provider controls', () => {
  it('starts a new local database without sample content', async () => {
    const { service } = fakeService('disconnected');
    renderProvider(service);

    await waitFor(() => {
      expect(screen.getByTestId('local-status')).toHaveTextContent('ready');
    });

    const database = await openMochiDatabase(databaseName);
    try {
      const repositories = createMochiRepositories(database);
      await expect(repositories.folders.list()).resolves.toEqual([]);
      await expect(repositories.notes.list()).resolves.toEqual([]);
      await expect(repositories.tasks.list()).resolves.toEqual([]);
      await expect(repositories.settings.get()).resolves.toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('keeps local data ready when remembered Drive sync starts offline', async () => {
    const { service } = fakeService('ready', new Error('Drive is offline'));
    renderProvider(service);

    await waitFor(() => {
      expect(screen.getByTestId('local-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('drive-status')).toHaveTextContent('ready');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Drive is offline');
  });

  it('connects without passphrase controls', async () => {
    const user = userEvent.setup();
    const { service } = fakeService('disconnected');
    renderProvider(service);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Kết nối Google Drive/i })).toBeVisible();
    });
    expect(document.querySelector('input[type="password"]')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Kết nối Google Drive/i }));

    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).toBeNull();
    });
  });

  it('offers an explicit rebuild action when the remote copy is missing', async () => {
    const user = userEvent.setup();
    const { rebuildRemoteFromLocal, service } = fakeService('remote-missing');
    renderProvider(service);

    await user.click(await screen.findByRole('button', { name: /Tạo lại đồng bộ trên Drive/i }));
    await waitFor(() => expect(rebuildRemoteFromLocal).toHaveBeenCalledOnce());
    expect(screen.getByTestId('drive-status')).toHaveTextContent('ready');
  });

  it('shows the connected email and lets the header trigger an immediate sync', async () => {
    const user = userEvent.setup();
    const { service, sync } = fakeService('ready');
    renderProvider(service);

    const syncButton = await screen.findByTitle(/Google Drive/i);
    expect(screen.getByText('user@example.com')).toBeVisible();
    await user.click(syncButton);

    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2));
  });

  it('automatically syncs a successful repository mutation after the debounce window', async () => {
    const user = userEvent.setup();
    const { service, sync } = fakeService('ready');
    renderProvider(service);

    await waitFor(() => expect(sync).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Mutate task data' }));

    await waitFor(() => {
      expect(document.querySelector('.drive-sync-header-button')).toHaveAttribute('data-sync-state', 'pending');
    });
    await waitFor(() => expect(sync).toHaveBeenCalledTimes(2), { timeout: 3_500 });
    await waitFor(() => {
      expect(document.querySelector('.drive-sync-header-button')).toHaveAttribute('data-sync-state', 'synced');
    });
  }, 5_000);
});
