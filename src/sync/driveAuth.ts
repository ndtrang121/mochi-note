const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const DRIVE_SCOPES = [DRIVE_APPDATA_SCOPE, DRIVE_EMAIL_SCOPE];
const EDGE_TOKEN_STORAGE_KEY = 'google-drive-edge-token';

interface AuthTokenResult {
  token?: string;
}

interface IdentityApi {
  getAuthToken(details: { interactive: boolean; scopes?: string[] }): Promise<AuthTokenResult>;
  getRedirectURL(path?: string): string;
  launchWebAuthFlow(details: { interactive: boolean; url: string }): Promise<string | undefined>;
  removeCachedAuthToken(details: { token: string }): Promise<void>;
}

interface TokenStorage {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface EdgeStoredToken {
  expiresAt: number;
  token: string;
}

export interface DriveAuthClient {
  readonly supportsBackgroundRefresh: boolean;
  connect(): Promise<string>;
  disconnect(): Promise<void>;
  getAccountEmail(accessToken?: string): Promise<string | null>;
  getAccessToken(): Promise<string>;
  invalidateAccessToken(token: string): Promise<void>;
}

export class DriveAuthRequiredError extends Error {
  constructor(message = 'Google Drive authorization is required.') {
    super(message);
    this.name = 'DriveAuthRequiredError';
  }
}

export class ChromeDriveAuthClient implements DriveAuthClient {
  readonly supportsBackgroundRefresh = true;

  constructor(
    private readonly identity: IdentityApi,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  connect() {
    return this.requestToken(true);
  }

  async disconnect() {
    try {
      const token = await this.requestToken(false);
      await this.identity.removeCachedAuthToken({ token });
    } catch {
      // A missing cached token already represents a disconnected Chrome account.
    }
  }

  async getAccountEmail(accessToken?: string) {
    const token = accessToken ?? await this.getAccessToken();
    return fetchGoogleAccountEmail(token, this.fetcher);
  }

  getAccessToken() {
    return this.requestToken(false);
  }

  invalidateAccessToken(token: string) {
    return this.identity.removeCachedAuthToken({ token });
  }

  private async requestToken(interactive: boolean) {
    const result = await this.identity.getAuthToken({ interactive, scopes: DRIVE_SCOPES });
    if (!result.token) throw new DriveAuthRequiredError();
    return result.token;
  }
}

export class EdgeDriveAuthClient implements DriveAuthClient {
  readonly supportsBackgroundRefresh = false;

  constructor(
    private readonly clientId: string,
    private readonly identity: IdentityApi,
    private readonly storage: TokenStorage,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly cryptoApi: Crypto = crypto,
    private readonly clientSecret = '',
  ) {}

  async connect() {
    if (!this.clientId) throw new DriveAuthRequiredError('Google OAuth client ID is not configured.');
    const verifier = createPkceVerifier(this.cryptoApi);
    const challenge = await createPkceChallenge(verifier, this.cryptoApi);
    const redirectUri = this.identity.getRedirectURL();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.search = new URLSearchParams({
      access_type: 'online',
      client_id: this.clientId,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account consent',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: DRIVE_SCOPES.join(' '),
    }).toString();

    const resultUrl = await this.identity.launchWebAuthFlow({ interactive: true, url: authUrl.toString() });
    if (!resultUrl) throw new DriveAuthRequiredError('Google authorization was cancelled.');
    const code = new URL(resultUrl).searchParams.get('code');
    if (!code) throw new DriveAuthRequiredError('Google authorization did not return a code.');

    const response = await this.fetcher('https://oauth2.googleapis.com/token', {
      body: new URLSearchParams({
        client_id: this.clientId,
        code,
        code_verifier: verifier,
        ...(this.clientSecret ? { client_secret: this.clientSecret } : {}),
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      method: 'POST',
    });
    if (!response.ok) throw new DriveAuthRequiredError('Google token exchange failed.');
    const payload = await response.json() as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new DriveAuthRequiredError('Google token response was incomplete.');

    const storedToken: EdgeStoredToken = {
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
      token: payload.access_token,
    };
    await this.storage.set({ [EDGE_TOKEN_STORAGE_KEY]: storedToken });
    return storedToken.token;
  }

  async disconnect() {
    await this.storage.remove(EDGE_TOKEN_STORAGE_KEY);
  }

  async getAccountEmail(accessToken?: string) {
    const token = accessToken ?? await this.getAccessToken();
    return fetchGoogleAccountEmail(token, this.fetcher);
  }

  async getAccessToken() {
    const stored = await this.storage.get(EDGE_TOKEN_STORAGE_KEY);
    const token = stored[EDGE_TOKEN_STORAGE_KEY];
    if (!isStoredToken(token) || token.expiresAt <= Date.now() + 60_000) {
      throw new DriveAuthRequiredError('Open MochiNote and reconnect Google Drive.');
    }
    return token.token;
  }

  async invalidateAccessToken(token: string) {
    const stored = await this.storage.get(EDGE_TOKEN_STORAGE_KEY);
    const current = stored[EDGE_TOKEN_STORAGE_KEY];
    if (isStoredToken(current) && current.token === token) {
      await this.storage.remove(EDGE_TOKEN_STORAGE_KEY);
    }
  }
}

export function createDriveAuthClient(
  chromeClientId: string,
  userAgent = navigator.userAgent,
  edgeClientId = chromeClientId,
  edgeClientSecret = '',
): DriveAuthClient {
  const identity = browser.identity as unknown as IdentityApi;
  if (/Edg\//.test(userAgent)) {
    return new EdgeDriveAuthClient(edgeClientId, identity, browser.storage.local, globalThis.fetch.bind(globalThis), crypto, edgeClientSecret);
  }
  return new ChromeDriveAuthClient(identity);
}

async function fetchGoogleAccountEmail(accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: 'Bearer ' + accessToken },
  });
  if (!response.ok) return null;
  const profile = await response.json() as { email?: unknown };
  return typeof profile.email === 'string' && profile.email.trim()
    ? profile.email.trim()
    : null;
}
function createPkceVerifier(cryptoApi: Crypto) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return toBase64Url(bytes);
}

async function createPkceChallenge(verifier: string, cryptoApi: Crypto) {
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isStoredToken(value: unknown): value is EdgeStoredToken {
  if (!value || typeof value !== 'object') return false;
  const token = value as Partial<EdgeStoredToken>;
  return typeof token.expiresAt === 'number' && typeof token.token === 'string';
}
