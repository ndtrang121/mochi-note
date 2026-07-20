import { describe, expect, it, vi } from 'vitest';

import type { DriveAuthClient } from './driveAuth';
import { DriveApiError, GoogleDriveAppDataClient } from './driveAppData';

function createAuth(tokens = ['token']) {
  let index = 0;
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getAccessToken: vi.fn(() => Promise.resolve(tokens[Math.min(index++, tokens.length - 1)])),
    invalidateAccessToken: vi.fn(() => Promise.resolve()),
    supportsBackgroundRefresh: true,
  } satisfies DriveAuthClient;
}

describe('Google Drive appData client', () => {
  it('lists all appData pages with bearer authorization', async () => {
    const auth = createAuth();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ id: 'one', name: 'one.bin' }], nextPageToken: 'next' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [{ id: 'two', name: 'two.bin' }] }), { status: 200 }));
    const client = new GoogleDriveAppDataClient(auth, fetcher, vi.fn());

    await expect(client.listFiles()).resolves.toEqual([
      { id: 'one', name: 'one.bin' },
      { id: 'two', name: 'two.bin' },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer token');
  });

  it('invalidates a rejected token and retries the request', async () => {
    const auth = createAuth(['expired', 'fresh']);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('expired', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    const client = new GoogleDriveAppDataClient(auth, fetcher, vi.fn(() => Promise.resolve()));

    await expect(client.listFiles()).resolves.toEqual([]);
    expect(auth.invalidateAccessToken).toHaveBeenCalledWith('expired');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer fresh');
  });

  it('retries throttling but does not retry permanent client errors', async () => {
    const throttledFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ files: [] }), { status: 200 }));
    const sleep = vi.fn(() => Promise.resolve());
    const client = new GoogleDriveAppDataClient(createAuth(), throttledFetch, sleep);
    await expect(client.listFiles()).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledOnce();

    const rejectedFetch = vi.fn<typeof fetch>(() => Promise.resolve(new Response('forbidden', { status: 403 })));
    const rejected = new GoogleDriveAppDataClient(createAuth(), rejectedFetch, sleep);
    await expect(rejected.listFiles()).rejects.toEqual(new DriveApiError(403, 'forbidden'));
  });
});
