export interface SyncSecretRecord {
  createdAt: string;
  deviceId: string;
  id: 'google-drive';
  masterKey: CryptoKey;
}
