import 'fake-indexeddb/auto';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseDataChangedMessage } from '../supabase/messages';
import { syncUserData } from '../supabase/sync';
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
  signInWithEmail: vi.fn(),
  signOutFromSupabase: vi.fn(),
  signUpWithEmail: vi.fn(),
}));

vi.mock('../supabase/storage', () => ({
  getDeviceId: () => Promise.resolve('device-a'),
}));

vi.mock('../supabase/sync', () => ({
  syncUserData: vi.fn(() => Promise.resolve({
    changedEntityTypes: [],
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
});
