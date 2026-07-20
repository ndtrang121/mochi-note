import 'fake-indexeddb/auto';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DriveSyncPanel } from '../features/preferences/DriveSyncPanel';
import { deleteMochiDatabase } from '../db/database';
import type { DriveSyncService, DriveSyncStatus, DriveSyncViewState } from '../sync/driveSyncService';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

let databaseCounter = 0;
let databaseName = '';

function viewState(status: DriveSyncStatus, error: string | null = null): DriveSyncViewState {
  const stableStatus = status === 'authorizing' || status === 'syncing' ? 'disconnected' : status;
  return {
    canDeleteAll: status === 'ready',
    canDeleteLocal: status === 'ready',
    error,
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
  const submitPassphrase = vi.fn(() => Promise.resolve(viewState('ready')));
  const service = {
    connect: vi.fn(() => Promise.resolve(viewState('needs-new-passphrase'))),
    deleteAllData: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    deleteLocalData: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    deleteRemoteVault: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    disconnect: vi.fn(() => Promise.resolve(viewState('disconnected'))),
    initialize: vi.fn(() => Promise.resolve(viewState(initialStatus))),
    restoreRevision: vi.fn(() => Promise.resolve(viewState('ready'))),
    submitPassphrase,
    sync: vi.fn(() => syncError
      ? Promise.reject(syncError)
      : Promise.resolve({ downloadedSnapshots: 0, mergedRecords: 0, transferredBlobs: 0, uploadedSnapshot: 'device-test.bin' })),
    viewState: vi.fn((status: DriveSyncStatus, error: string | null = null) => Promise.resolve(viewState(status, error))),
  } as unknown as DriveSyncService;
  return { service, submitPassphrase };
}

function ProviderProbe() {
  const { driveSync, status } = useMochiData();
  return (
    <>
      <span data-testid="local-status">{status}</span>
      <span data-testid="drive-status">{driveSync.status}</span>
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
  it('keeps local data ready when remembered Drive sync starts offline', async () => {
    const { service } = fakeService('ready', new Error('Drive is offline'));
    renderProvider(service);

    await waitFor(() => {
      expect(screen.getByTestId('local-status')).toHaveTextContent('ready');
      expect(screen.getByTestId('drive-status')).toHaveTextContent('ready');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Drive is offline');
  });

  it('validates and submits a new vault passphrase from the settings panel', async () => {
    const user = userEvent.setup();
    const { service, submitPassphrase } = fakeService('needs-new-passphrase');
    renderProvider(service);

    await waitFor(() => {
      expect(document.querySelectorAll('input[type="password"]')).toHaveLength(2);
    });
    const form = document.querySelector<HTMLFormElement>('.drive-sync-passphrase');
    if (!form) throw new Error('Passphrase form did not render.');
    const [passphraseInput, confirmationInput] = Array.from(form.querySelectorAll('input'));
    if (!passphraseInput || !confirmationInput) throw new Error('Passphrase inputs did not render.');
    const submit = within(form).getByRole('button');

    await user.type(passphraseInput, 'short');
    await user.click(submit);
    expect(screen.getByRole('alert')).toBeVisible();
    expect(submitPassphrase).not.toHaveBeenCalled();

    await user.clear(passphraseInput);
    await user.type(passphraseInput, 'correct horse battery staple');
    await user.type(confirmationInput, 'correct horse battery staple');
    await user.click(submit);

    await waitFor(() => {
      expect(submitPassphrase).toHaveBeenCalledWith('correct horse battery staple');
      expect(screen.getByTestId('drive-status')).toHaveTextContent('ready');
    });
  });
});