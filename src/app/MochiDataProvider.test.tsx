import 'fake-indexeddb/auto';

import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createSupabaseDataChangedMessage } from '../supabase/messages';
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
  syncUserData: () => Promise.resolve({
    changedEntityTypes: [],
    error: null,
    lastSyncedAt: null,
    pendingCount: 0,
    status: 'idle',
  }),
}));

function RevisionProbe() {
  const { dataRevision, status } = useMochiData();
  return <output>{status}:{dataRevision}</output>;
}

describe('MochiDataProvider sync invalidation', () => {
  let runtimeListener: ((message: unknown) => void) | undefined;

  beforeEach(() => {
    runtimeListener = undefined;
    vi.stubGlobal('browser', {
      runtime: {
        onMessage: {
          addListener(listener: (message: unknown) => void) {
            runtimeListener = listener;
          },
          removeListener: vi.fn(),
        },
      },
    });
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
