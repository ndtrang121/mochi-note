import { describe, expect, it } from 'vitest';

import {
  createSyncVault,
  decryptSyncPayload,
  encryptSyncPayload,
  rewrapSyncVault,
  sha256Hex,
  SyncVaultError,
  unlockSyncVault,
} from './syncCrypto';

const PASSPHRASE = 'correct horse battery staple';

describe('encrypted sync vault', () => {
  it('creates a non-extractable master key and unlocks it on another device', async () => {
    const created = await createSyncVault(PASSPHRASE, crypto, '2026-07-20T00:00:00.000Z');
    const unlocked = await unlockSyncVault(created.manifest, PASSPHRASE);

    expect(created.masterKey.extractable).toBe(false);
    expect(unlocked.extractable).toBe(false);
    expect(created.manifest).toMatchObject({
      algorithm: 'AES-GCM-256',
      createdAt: '2026-07-20T00:00:00.000Z',
      formatVersion: 2,
      epoch: 0,
      status: 'active',

      kdf: { algorithm: 'PBKDF2-SHA-256' },
    });
    expect(typeof created.manifest.vaultId).toBe('string');

    const encrypted = await encryptSyncPayload(created.masterKey, new TextEncoder().encode('Sticky payload'), 'device-a');
    await expect(decryptSyncPayload(unlocked, encrypted)).resolves.toSatisfy((value: Uint8Array) =>
      new TextDecoder().decode(value) === 'Sticky payload',
    );
  });

  it('rejects a wrong passphrase and modified ciphertext', async () => {
    const created = await createSyncVault(PASSPHRASE);
    await expect(unlockSyncVault(created.manifest, 'wrong passphrase value')).rejects.toBeInstanceOf(SyncVaultError);

    const encrypted = await encryptSyncPayload(created.masterKey, new Uint8Array([1, 2, 3]), 'snapshot');
    const corrupted = {
      ...encrypted,
      ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA`,
    };
    await expect(decryptSyncPayload(created.masterKey, corrupted)).rejects.toBeInstanceOf(SyncVaultError);
  });

  it('rewraps the same vault without re-encrypting payloads', async () => {
    const created = await createSyncVault(PASSPHRASE);
    const encrypted = await encryptSyncPayload(created.masterKey, new Uint8Array([9, 8, 7]), 'blob');
    const nextManifest = await rewrapSyncVault(created.manifest, PASSPHRASE, 'a completely new passphrase');

    await expect(unlockSyncVault(nextManifest, PASSPHRASE)).rejects.toBeInstanceOf(SyncVaultError);
    const nextKey = await unlockSyncVault(nextManifest, 'a completely new passphrase');
    await expect(decryptSyncPayload(nextKey, encrypted)).resolves.toEqual(new Uint8Array([9, 8, 7]));
  });

  it('hashes blob content deterministically', async () => {
    await expect(sha256Hex(new TextEncoder().encode('mochi'))).resolves.toBe(
      'cc80274793d170adf2fe745398a9c458d81357557f89392203c0052ce4f99748',
    );
  });
});
