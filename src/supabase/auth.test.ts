import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestEmailOtp, verifyEmailOtp } from './auth';

const authMocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('./client', () => ({
  getSupabaseClient: vi.fn(),
  requireSupabaseClient: () => ({ auth: authMocks }),
}));

describe('Supabase passwordless auth', () => {
  beforeEach(() => {
    authMocks.signInWithOtp.mockReset();
    authMocks.verifyOtp.mockReset();
  });

  it('requests a passwordless email for the normalized address', async () => {
    authMocks.signInWithOtp.mockResolvedValue({ data: { session: null, user: null }, error: null });

    await requestEmailOtp('  user@example.com  ', 'vi');

    expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      options: { data: { language: 'vi' }, shouldCreateUser: true },
    });
  });

  it('verifies the six-digit email token and returns the signed-in state', async () => {
    const session = { user: { email: 'user@example.com', id: 'user-a' } };
    authMocks.verifyOtp.mockResolvedValue({ data: { session }, error: null });

    const state = await verifyEmailOtp(' user@example.com ', ' 123456 ');

    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'email',
    });
    expect(state).toMatchObject({ status: 'signed-in', user: session.user });
  });

  it('surfaces Supabase request errors', async () => {
    const error = new Error('Email rate limit exceeded');
    authMocks.signInWithOtp.mockResolvedValue({ data: null, error });

    await expect(requestEmailOtp('user@example.com', 'en')).rejects.toBe(error);
  });
});
