import 'fake-indexeddb/auto';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseDataChangedMessage } from '../supabase/messages';
import { syncUserData } from '../supabase/sync';
import { openMochiDatabase } from '../db/database';
import { MochiDataProvider, useMochiData } from './MochiDataProvider';

vi.mock('../supabase/auth', () => ({
  INITIAL_AUTH_STATE: { error: null, session: null, status: 'initializing', user: null },
  listenForAuthState: () => () => undefined,
  readAuthState: () => Promise.resolve({
    error: null,
    session: { access_token: 'test-token' },
    status: 'signed-in',
    user: { email: 'user@example.com', id: 'user-a' },
  }),
  requestEmailOtp: vi.fn(),
  signOutFromSupabase: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

vi.mock('../supabase/storage', () => ({
  getDeviceId: () => Promise.resolve('device-a'),
}));

vi.mock('../supabase/sync', () => ({
  syncUserData: vi.fn(() => Promise.resolve({
    changedEntityTypes: [],
    cloudStorage: null,
    error: null,
    lastSyncedAt: null,
    pendingCount: 0,
    status: 'idle',
  })),
}));

function MutationProbe() {
  const { repositories, status, sync } = useMochiData();

  async function addTask() {
    if (!repositories) return;
    const timestamp = new Date().toISOString();
    await repositories.tasks.put({
      completedAt: null,
      dueDate: null,
      dueTime: null,
      folderId: null,
      id: 'task-sync-owner-test',
      position: 0,
      title: 'Sync owner test',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return (
    <>
      <output>{status}:{sync.status}</output>
      <button disabled={!repositories} onClick={() => void addTask()} type="button">Add task</button>
    </>
  );
}

function RevisionProbe() {
  const { dataRevision, status } = useMochiData();
  return <output>{status}:{dataRevision}</output>;
}

function LocalDataChoiceProbe() {
  const { localDataChoice, status } = useMochiData();
  return (
    <>
      <output>{status}:{localDataChoice.status}</output>
      <button onClick={() => void localDataChoice.chooseSync()} type="button">Sync local</button>
      <button onClick={() => void localDataChoice.chooseCloud()} type="button">Use cloud</button>
    </>
  );
}

describe('MochiDataProvider sync invalidation', () => {
  const sendMessageMock = vi.fn().mockResolvedValue(undefined);
  let runtimeListener: ((message: unknown) => void) | undefined;

  beforeEach(() => {
    runtimeListener = undefined;
    sendMessageMock.mockClear();
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener(listener: (message: unknown) => void) {
            runtimeListener = listener;
          },
          removeListener: vi.fn(),
        },
      },
    });
  });

  it('queues mutations for the background without starting a foreground sync', async () => {
    const user = userEvent.setup();
    render(
      <MochiDataProvider databaseName="provider-background-sync-owner-test">
        <MutationProbe />
      </MochiDataProvider>,
    );

    expect(await screen.findByText('ready:pending')).toBeVisible();
    expect(syncUserData).not.toHaveBeenCalled();
    act(() => runtimeListener?.(createSupabaseDataChangedMessage('user-a', [], {
      cloudStorage: null,
      error: null,
      lastSyncedAt: '2026-07-22T07:59:00.000Z',
      pendingCount: 0,
      status: 'idle',
    })));
    expect(screen.getByText('ready:idle')).toBeVisible();
    sendMessageMock.mockClear();

    await user.click(screen.getByRole('button', { name: 'Add task' }));

    expect(await screen.findByText('ready:pending')).toBeVisible();
    expect(syncUserData).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith({
      entityTypes: ['task'],
      type: 'MOCHI_SUPABASE_SYNC_REQUEST',
    });

    act(() => runtimeListener?.(createSupabaseDataChangedMessage('user-a', [], {
      cloudStorage: null,
      error: null,
      lastSyncedAt: '2026-07-22T08:00:00.000Z',
      pendingCount: 0,
      status: 'idle',
    })));
    expect(screen.getByText('ready:idle')).toBeVisible();
  });

  it('increments dataRevision when background sync changes the signed-in account', async () => {
    render(
      <MochiDataProvider databaseName="provider-sync-invalidation-test">
        <RevisionProbe />
      </MochiDataProvider>,
    );

    expect(await screen.findByText('ready:0')).toBeVisible();
    await waitFor(() => expect(runtimeListener).toBeTypeOf('function'));

    act(() => runtimeListener?.(createSupabaseDataChangedMessage('user-a', ['task'])));

    expect(screen.getByText('ready:1')).toBeVisible();
  });

  it('ignores sync notifications for another account', async () => {
    render(
      <MochiDataProvider databaseName="provider-sync-other-account-test">
        <RevisionProbe />
      </MochiDataProvider>,
    );

    expect(await screen.findByText('ready:0')).toBeVisible();
    await waitFor(() => expect(runtimeListener).toBeTypeOf('function'));

    act(() => runtimeListener?.(createSupabaseDataChangedMessage('user-b', ['folder'])));

    expect(screen.getByText('ready:0')).toBeVisible();
  });

  it('waits for a choice and imports existing guest data into the signed-in account', async () => {
    const databaseName = 'provider-local-data-choice-sync-test';
    const guestDatabase = await openMochiDatabase(databaseName);
    const timestamp = '2026-07-23T08:00:00.000Z';
    await guestDatabase.put('tasks', {
      completedAt: null,
      createdAt: timestamp,
      dueDate: null,
      dueTime: null,
      folderId: null,
      id: 'local-task',
      position: 0,
      title: 'Local task',
      updatedAt: timestamp,
    });
    guestDatabase.close();

    const user = userEvent.setup();
    render(
      <MochiDataProvider databaseName={databaseName}>
        <LocalDataChoiceProbe />
      </MochiDataProvider>,
    );

    expect(await screen.findByText('loading:required')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sync local' }));
    expect(await screen.findByText('ready:not-required')).toBeVisible();

    const accountDatabase = await openMochiDatabase(`${databaseName}:user-a`);
    await expect(accountDatabase.get('tasks', 'local-task')).resolves.toMatchObject({ title: 'Local task' });
    accountDatabase.close();
  });

  it('deletes guest data when the user chooses to use cloud data', async () => {
    const databaseName = 'provider-local-data-choice-cloud-test';
    const guestDatabase = await openMochiDatabase(databaseName);
    const timestamp = '2026-07-23T08:00:00.000Z';
    await guestDatabase.put('folders', {
      color: 'blush',
      createdAt: timestamp,
      icon: 'folder',
      id: 'local-folder',
      name: 'Local folder',
      parentId: null,
      position: 0,
      updatedAt: timestamp,
    });
    guestDatabase.close();

    const user = userEvent.setup();
    render(
      <MochiDataProvider databaseName={databaseName}>
        <LocalDataChoiceProbe />
      </MochiDataProvider>,
    );

    expect(await screen.findByText('loading:required')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Use cloud' }));
    expect(await screen.findByText('ready:not-required')).toBeVisible();

    const accountDatabase = await openMochiDatabase(`${databaseName}:user-a`);
    await expect(accountDatabase.get('folders', 'local-folder')).resolves.toBeUndefined();
    await expect(accountDatabase.get('settings', 'app')).resolves.toBeUndefined();
    accountDatabase.close();
  });
});
