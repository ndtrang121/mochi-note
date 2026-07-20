import { describe, expect, it, vi } from 'vitest';

import {
  ChromeDriveAuthClient,
  DriveAuthRequiredError,
  EdgeDriveAuthClient,
} from './driveAuth';

describe('Google Drive authentication', () => {
  it('uses Chrome token caching and invalidation', async () => {
    const identity = {
      getAuthToken: vi.fn().mockResolvedValue({ token: 'chrome-token' }),
      getRedirectURL: vi.fn(),
      launchWebAuthFlow: vi.fn(),
      removeCachedAuthToken: vi.fn().mockResolvedValue(undefined),
    };
    const auth = new ChromeDriveAuthClient(identity);

    await expect(auth.connect()).resolves.toBe('chrome-token');
    await expect(auth.getAccessToken()).resolves.toBe('chrome-token');
    await auth.invalidateAccessToken('chrome-token');

    expect(identity.getAuthToken).toHaveBeenNthCalledWith(1, expect.objectContaining({ interactive: true }));
    expect(identity.getAuthToken).toHaveBeenNthCalledWith(2, expect.objectContaining({ interactive: false }));
    expect(identity.removeCachedAuthToken).toHaveBeenCalledWith({ token: 'chrome-token' });
  });

  it('requires Chrome authorization when no cached token exists', async () => {
    const identity = {
      getAuthToken: vi.fn().mockResolvedValue({}),
      getRedirectURL: vi.fn(),
      launchWebAuthFlow: vi.fn(),
      removeCachedAuthToken: vi.fn(),
    };

    await expect(new ChromeDriveAuthClient(identity).getAccessToken()).rejects.toBeInstanceOf(DriveAuthRequiredError);
  });

  it('stores an expiring Edge token after the PKCE flow', async () => {
    const values = new Map<string, unknown>();
    const storage = {
      get: vi.fn((key: string) => Promise.resolve({ [key]: values.get(key) })),
      remove: vi.fn((key: string) => {
        values.delete(key);
        return Promise.resolve();
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.entries(items).forEach(([key, value]) => values.set(key, value));
        return Promise.resolve();
      }),
    };
    const identity = {
      getAuthToken: vi.fn(),
      getRedirectURL: vi.fn(() => 'https://extension.chromiumapp.org/google-drive'),
      launchWebAuthFlow: vi.fn(() => Promise.resolve('https://extension.chromiumapp.org/google-drive?code=oauth-code')),
      removeCachedAuthToken: vi.fn(),
    };
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(
      new Response(JSON.stringify({ access_token: 'edge-token', expires_in: 3600 }), { status: 200 }),
    ));
    const auth = new EdgeDriveAuthClient('client-id', identity, storage, fetcher);

    await expect(auth.connect()).resolves.toBe('edge-token');
    await expect(auth.getAccessToken()).resolves.toBe('edge-token');
    expect(identity.launchWebAuthFlow).toHaveBeenCalledWith(expect.objectContaining({ interactive: true }));
    expect(fetcher).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', expect.objectContaining({ method: 'POST' }));
  });
});
