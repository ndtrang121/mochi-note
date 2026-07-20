const SYNC_FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const MINIMUM_PASSPHRASE_LENGTH = 12;

export interface RemoteSyncManifest {
  algorithm: 'AES-GCM-256';
  createdAt: string;
  formatVersion: 1;
  kdf: {
    algorithm: 'PBKDF2-SHA-256';
    iterations: number;
    salt: string;
  };
  wrappedMasterKey: {
    ciphertext: string;
    iv: string;
  };
}

export interface EncryptedSyncPayload {
  algorithm: 'AES-GCM-256';
  ciphertext: string;
  context: string;
  formatVersion: 1;
  iv: string;
}

export interface CreatedSyncVault {
  manifest: RemoteSyncManifest;
  masterKey: CryptoKey;
}

export class SyncVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncVaultError';
  }
}

export async function createSyncVault(
  passphrase: string,
  cryptoApi: Crypto = crypto,
  now = new Date().toISOString(),
): Promise<CreatedSyncVault> {
  validatePassphrase(passphrase);
  const extractableKey = await cryptoApi.subtle.generateKey(
    { length: 256, name: 'AES-GCM' },
    true,
    ['decrypt', 'encrypt'],
  );
  const rawMasterKey = await cryptoApi.subtle.exportKey('raw', extractableKey);
  const manifest = await wrapMasterKey(rawMasterKey, passphrase, now, cryptoApi);
  return {
    manifest,
    masterKey: await importMasterKey(rawMasterKey, cryptoApi),
  };
}

export async function unlockSyncVault(
  manifest: RemoteSyncManifest,
  passphrase: string,
  cryptoApi: Crypto = crypto,
) {
  validateManifest(manifest);
  validatePassphrase(passphrase);
  try {
    const rawMasterKey = await unwrapMasterKey(manifest, passphrase, cryptoApi);
    return await importMasterKey(rawMasterKey, cryptoApi);
  } catch {
    throw new SyncVaultError('Passphrase is incorrect or the sync vault is damaged.');
  }
}

export async function rewrapSyncVault(
  manifest: RemoteSyncManifest,
  currentPassphrase: string,
  nextPassphrase: string,
  cryptoApi: Crypto = crypto,
) {
  validateManifest(manifest);
  validatePassphrase(currentPassphrase);
  validatePassphrase(nextPassphrase);
  try {
    const rawMasterKey = await unwrapMasterKey(manifest, currentPassphrase, cryptoApi);
    return await wrapMasterKey(rawMasterKey, nextPassphrase, manifest.createdAt, cryptoApi);
  } catch {
    throw new SyncVaultError('Current passphrase is incorrect or the sync vault is damaged.');
  }
}

export async function encryptSyncPayload(
  masterKey: CryptoKey,
  content: Uint8Array,
  context: string,
  cryptoApi: Crypto = crypto,
): Promise<EncryptedSyncPayload> {
  if (!context) throw new SyncVaultError('Encryption context is required.');
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi.subtle.encrypt(
    { additionalData: new TextEncoder().encode(context), iv, name: 'AES-GCM' },
    masterKey,
    toArrayBuffer(content),
  );
  return {
    algorithm: 'AES-GCM-256',
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
    context,
    formatVersion: SYNC_FORMAT_VERSION,
    iv: encodeBase64(iv),
  };
}

export async function decryptSyncPayload(
  masterKey: CryptoKey,
  payload: EncryptedSyncPayload,
  cryptoApi: Crypto = crypto,
) {
  validatePayload(payload);
  try {
    const plaintext = await cryptoApi.subtle.decrypt(
      {
        additionalData: new TextEncoder().encode(payload.context),
        iv: decodeBase64(payload.iv),
        name: 'AES-GCM',
      },
      masterKey,
      toArrayBuffer(decodeBase64(payload.ciphertext)),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new SyncVaultError('Encrypted sync payload failed authentication.');
  }
}

export async function sha256Hex(content: Uint8Array, cryptoApi: Crypto = crypto) {
  const digest = new Uint8Array(await cryptoApi.subtle.digest('SHA-256', toArrayBuffer(content)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function wrapMasterKey(
  rawMasterKey: ArrayBuffer,
  passphrase: string,
  createdAt: string,
  cryptoApi: Crypto,
): Promise<RemoteSyncManifest> {
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveWrappingKey(passphrase, salt, cryptoApi);
  const ciphertext = await cryptoApi.subtle.encrypt(
    { iv, name: 'AES-GCM' },
    wrappingKey,
    rawMasterKey,
  );
  return {
    algorithm: 'AES-GCM-256',
    createdAt,
    formatVersion: SYNC_FORMAT_VERSION,
    kdf: {
      algorithm: 'PBKDF2-SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: encodeBase64(salt),
    },
    wrappedMasterKey: {
      ciphertext: encodeBase64(new Uint8Array(ciphertext)),
      iv: encodeBase64(iv),
    },
  };
}

async function unwrapMasterKey(
  manifest: RemoteSyncManifest,
  passphrase: string,
  cryptoApi: Crypto,
) {
  const salt = decodeBase64(manifest.kdf.salt);
  const wrappingKey = await deriveWrappingKey(passphrase, salt, cryptoApi, manifest.kdf.iterations);
  return cryptoApi.subtle.decrypt(
    { iv: decodeBase64(manifest.wrappedMasterKey.iv), name: 'AES-GCM' },
    wrappingKey,
    toArrayBuffer(decodeBase64(manifest.wrappedMasterKey.ciphertext)),
  );
}

async function deriveWrappingKey(
  passphrase: string,
  salt: Uint8Array,
  cryptoApi: Crypto,
  iterations = PBKDF2_ITERATIONS,
) {
  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return cryptoApi.subtle.deriveKey(
    { hash: 'SHA-256', iterations, name: 'PBKDF2', salt: toArrayBuffer(salt) },
    keyMaterial,
    { length: 256, name: 'AES-GCM' },
    false,
    ['decrypt', 'encrypt'],
  );
}

function importMasterKey(rawMasterKey: ArrayBuffer, cryptoApi: Crypto) {
  return cryptoApi.subtle.importKey(
    'raw',
    rawMasterKey,
    { length: 256, name: 'AES-GCM' },
    false,
    ['decrypt', 'encrypt'],
  );
}

function validatePassphrase(passphrase: string) {
  if (passphrase.length < MINIMUM_PASSPHRASE_LENGTH) {
    throw new SyncVaultError(`Passphrase must contain at least ${MINIMUM_PASSPHRASE_LENGTH} characters.`);
  }
}

function validateManifest(manifest: RemoteSyncManifest) {
  if (
    manifest.formatVersion !== SYNC_FORMAT_VERSION ||
    manifest.algorithm !== 'AES-GCM-256' ||
    manifest.kdf.algorithm !== 'PBKDF2-SHA-256' ||
    !Number.isInteger(manifest.kdf.iterations) ||
    manifest.kdf.iterations < 100_000
  ) {
    throw new SyncVaultError('Unsupported sync vault manifest.');
  }
}

function validatePayload(payload: EncryptedSyncPayload) {
  if (
    payload.formatVersion !== SYNC_FORMAT_VERSION ||
    payload.algorithm !== 'AES-GCM-256' ||
    !payload.context
  ) {
    throw new SyncVaultError('Unsupported encrypted sync payload.');
  }
}

function encodeBase64(content: Uint8Array) {
  let binary = '';
  content.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64(content: string) {
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(content: Uint8Array) {
  return content.slice().buffer;
}
