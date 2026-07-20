import type { DriveAuthClient } from './driveAuth';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';
const MAX_ATTEMPTS = 4;

export interface DriveAppDataFile {
  id: string;
  md5Checksum?: string;
  modifiedTime?: string;
  name: string;
  size?: string;
}

export interface DriveAppDataClient {
  deleteFile(fileId: string): Promise<void>;
  downloadFile(fileId: string): Promise<Uint8Array>;
  listFiles(): Promise<DriveAppDataFile[]>;
  upsertFile(name: string, content: Uint8Array, contentType?: string, existingFileId?: string): Promise<DriveAppDataFile>;
}

export class DriveApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'DriveApiError';
  }
}

export class GoogleDriveAppDataClient implements DriveAppDataClient {
  constructor(
    private readonly auth: DriveAuthClient,
    private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private readonly sleep: (milliseconds: number) => Promise<void> = defaultSleep,
  ) {}

  async listFiles() {
    const files: DriveAppDataFile[] = [];
    let pageToken: string | undefined;
    do {
      const query = new URLSearchParams({
        fields: 'nextPageToken,files(id,name,modifiedTime,size,md5Checksum)',
        pageSize: '1000',
        spaces: 'appDataFolder',
      });
      if (pageToken) query.set('pageToken', pageToken);
      const response = await this.request(`${DRIVE_API_URL}/files?${query}`);
      const payload = await response.json() as { files?: DriveAppDataFile[]; nextPageToken?: string };
      files.push(...(payload.files ?? []));
      pageToken = payload.nextPageToken;
    } while (pageToken);
    return files;
  }

  async downloadFile(fileId: string) {
    const response = await this.request(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}?alt=media`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async upsertFile(
    name: string,
    content: Uint8Array,
    contentType = 'application/octet-stream',
    existingFileId?: string,
  ) {
    const existing = existingFileId
      ? { id: existingFileId, name }
      : (await this.listFiles()).find((file) => file.name === name);
    if (existing) {
      const response = await this.request(
        `${DRIVE_UPLOAD_URL}/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,modifiedTime,size,md5Checksum`,
        { body: toArrayBuffer(content), headers: { 'Content-Type': contentType }, method: 'PATCH' },
      );
      return response.json() as Promise<DriveAppDataFile>;
    }

    const boundary = `mochinote-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({ name, parents: ['appDataFolder'] }),
      `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      toArrayBuffer(content),
      `\r\n--${boundary}--`,
    ]);
    const response = await this.request(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,modifiedTime,size,md5Checksum`, {
      body,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      method: 'POST',
    });
    return response.json() as Promise<DriveAppDataFile>;
  }

  async deleteFile(fileId: string) {
    await this.request(`${DRIVE_API_URL}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  }

  private async request(url: string, init: RequestInit = {}) {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let token = '';
      try {
        token = await this.auth.getAccessToken();
        const headers = new Headers(init.headers);
        headers.set('Authorization', `Bearer ${token}`);
        const response = await this.fetcher(url, { ...init, headers });
        if (response.ok) return response;

        if (response.status === 401) await this.auth.invalidateAccessToken(token);
        if (response.status !== 401 && response.status !== 429 && response.status < 500) {
          throw new DriveApiError(response.status, await response.text());
        }
        lastError = new DriveApiError(response.status, await response.text());
      } catch (error) {
        if (error instanceof DriveApiError && error.status < 500 && error.status !== 401 && error.status !== 429) {
          throw error;
        }
        lastError = error;
      }

      if (attempt < MAX_ATTEMPTS - 1) await this.sleep(200 * 2 ** attempt);
    }
    if (lastError instanceof Error) throw lastError;
    throw new DriveApiError(0, 'Google Drive request failed.');
  }
}

function toArrayBuffer(content: Uint8Array) {
  return content.slice().buffer;
}

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
