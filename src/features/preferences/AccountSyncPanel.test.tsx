import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { AccountSyncPanel } from './AccountSyncPanel';

const accountMocks = vi.hoisted(() => ({
  requestEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));

vi.mock('../../app/MochiDataProvider', () => ({
  useMochiData: () => ({
    auth: { error: null, session: null, status: 'signed-out', user: null },
    authControls: {
      requestEmailOtp: accountMocks.requestEmailOtp,
      signOut: vi.fn(),
      verifyEmailOtp: accountMocks.verifyEmailOtp,
    },
    sync: { error: null, lastSyncedAt: null, pendingCount: 0, status: 'idle' },
    syncNow: vi.fn(),
  }),
}));

describe('AccountSyncPanel passwordless login', () => {
  beforeEach(() => {
    accountMocks.requestEmailOtp.mockReset().mockResolvedValue(undefined);
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
});
