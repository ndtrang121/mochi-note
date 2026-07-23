import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import type { AuthState, SyncState } from '../../supabase/types';
import { AccountSyncPanel } from './AccountSyncPanel';

const accountMocks = vi.hoisted(() => ({
  chooseCloud: vi.fn(),
  chooseSync: vi.fn(),
  requestEmailOtp: vi.fn(),
  state: {
    auth: { error: null, session: null, status: 'signed-out', user: null } as AuthState,
    localDataChoiceStatus: 'not-required' as 'checking' | 'not-required' | 'processing' | 'required',
    sync: { cloudStorage: null, error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' } as SyncState,
  },
  syncNow: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

vi.mock('../../app/MochiDataProvider', () => ({
  useMochiData: () => ({
    auth: accountMocks.state.auth,
    authControls: {
      requestEmailOtp: accountMocks.requestEmailOtp,
      signOut: vi.fn(),
      verifyEmailOtp: accountMocks.verifyEmailOtp,
    },
    localDataChoice: {
      chooseCloud: accountMocks.chooseCloud,
      chooseSync: accountMocks.chooseSync,
      status: accountMocks.state.localDataChoiceStatus,
    },
    sync: accountMocks.state.sync,
    syncNow: accountMocks.syncNow,
  }),
}));

describe('AccountSyncPanel passwordless login', () => {
  beforeEach(() => {
    accountMocks.chooseCloud.mockReset().mockResolvedValue(undefined);
    accountMocks.chooseSync.mockReset().mockResolvedValue(undefined);
    accountMocks.state.auth = { error: null, session: null, status: 'signed-out', user: null };
    accountMocks.state.localDataChoiceStatus = 'not-required';
    accountMocks.state.sync = { cloudStorage: null, error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' };
    accountMocks.requestEmailOtp.mockReset().mockResolvedValue(undefined);
    accountMocks.syncNow.mockReset();
    accountMocks.verifyEmailOtp.mockReset().mockResolvedValue(undefined);
  });

  it('requests an English email code and verifies the returned token', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="en-US">
        <AccountSyncPanel />
      </I18nProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Send sign-in code' }));

    expect(accountMocks.requestEmailOtp).toHaveBeenCalledWith('user@example.com', 'en');
    expect(await screen.findByRole('status')).toHaveTextContent('user@example.com');

    await user.type(screen.getByRole('textbox', { name: 'Sign-in code' }), '12345678');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));

    expect(accountMocks.verifyEmailOtp).toHaveBeenCalledWith('user@example.com', '12345678');
  });

  it('passes the Vietnamese app language to the OTP request', async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider locale="vi">
        <AccountSyncPanel />
      </I18nProvider>,
    );

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'user@example.com');
    await user.click(screen.getByRole('button', { name: 'Gửi mã đăng nhập' }));

    expect(accountMocks.requestEmailOtp).toHaveBeenCalledWith('user@example.com', 'vi');
  });

  it('shows full Free cloud storage and opens the upgrade dialog', async () => {
    const user = userEvent.setup();
    accountMocks.state.auth = {
      error: null,
      session: null,
      status: 'signed-in',
      user: {
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2026-07-22T00:00:00.000Z',
        email: 'user@example.com',
        id: 'user-a',
        user_metadata: {},
      },
    };
    accountMocks.state.sync = {
      cloudStorage: {
        limitBytes: 5_242_880,
        planCode: 'free',
        status: 'full',
        usedBytes: 5_242_880,
      },
      error: null,
      lastSyncedAt: null,
      pendingCount: 3,
      status: 'blocked_quota',
    };

    render(
      <I18nProvider locale="en-US">
        <AccountSyncPanel />
      </I18nProvider>,
    );

    expect(screen.getByText('Cloud storage')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '100% of cloud storage used' })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText(/3 changes are being kept on this device/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Plan upgrades are in development');
  });

  it('requires signed-in users with local data to sync it or delete it before using cloud data', async () => {
    const user = userEvent.setup();
    accountMocks.state.auth = {
      error: null,
      session: null,
      status: 'signed-in',
      user: {
        app_metadata: {},
        aud: 'authenticated',
        created_at: '2026-07-23T00:00:00.000Z',
        email: 'user@example.com',
        id: 'user-a',
        user_metadata: {},
      },
    };
    accountMocks.state.localDataChoiceStatus = 'required';

    render(
      <I18nProvider locale="en-US">
        <AccountSyncPanel />
      </I18nProvider>,
    );

    expect(screen.getByRole('dialog', { name: 'Choose your data after signing in' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Sync this device data/ }));
    expect(accountMocks.chooseSync).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /Delete local data and use cloud/ }));
    expect(accountMocks.chooseCloud).toHaveBeenCalledOnce();
  });
});
