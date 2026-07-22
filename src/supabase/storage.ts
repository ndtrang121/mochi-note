type BrowserStorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  remove(key: string): Promise<void>;
  set(values: Record<string, unknown>): Promise<void>;
};

function browserStorage(): BrowserStorageArea | null {
  const candidate = (globalThis as typeof globalThis & {
    browser?: { storage?: { local?: BrowserStorageArea } };
  }).browser?.storage?.local;
  return candidate ?? null;
}

export const sessionStorageAdapter = {
  async getItem(key: string) {
    const storage = browserStorage();
    if (storage) {
      const values = await storage.get(key);
      return typeof values[key] === 'string' ? values[key] : null;
    }
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async removeItem(key: string) {
    const storage = browserStorage();
    if (storage) {
      await storage.remove(key);
      return;
    }
    globalThis.localStorage?.removeItem(key);
  },
  async setItem(key: string, value: string) {
    const storage = browserStorage();
    if (storage) {
      await storage.set({ [key]: value });
      return;
    }
    globalThis.localStorage?.setItem(key, value);
  },
};

export async function getDeviceId() {
  const key = 'mochi-device-id';
  const storage = browserStorage();
  if (storage) {
    const values = await storage.get(key);
    if (typeof values[key] === 'string' && values[key]) return values[key];
    const generated = crypto.randomUUID();
    await storage.set({ [key]: generated });
    return generated;
  }
  const existing = globalThis.localStorage?.getItem(key);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  globalThis.localStorage?.setItem(key, generated);
  return generated;
}
