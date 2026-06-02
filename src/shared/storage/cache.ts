import { hasChromeLocalStorage, readChromeStorage, writeChromeStorage, removeChromeStorage } from '@shared/storage/storage';

export interface CacheEntry<T> {
  ts: number;
  data: Array<[string, T]>;
}

export async function readCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const result = await readChromeStorage([key]);
    if (result[key]) return result[key] as CacheEntry<T>;

    const raw = sessionStorage.getItem(key);
    if (!raw) return null;

    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (hasChromeLocalStorage()) {
      try {
        await writeChromeStorage({ [key]: entry });
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }

    return entry;
  } catch {
    return null;
  }
}

export async function writeCacheEntry<T>(key: string, entry: CacheEntry<T>): Promise<void> {
  try {
    if (!hasChromeLocalStorage()) {
      throw new Error('chrome.storage.local is unavailable');
    }

    await writeChromeStorage({ [key]: entry });
    sessionStorage.removeItem(key);
  } catch {
    try {
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch {
      /* ignore */
    }
  }
}

export async function removeCacheEntries(keys: string[]): Promise<void> {
  keys.forEach((key) => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  });

  await removeChromeStorage(keys);
}

export function cacheEntryToMap<T>(entry: CacheEntry<T> | null, ttl: number): Map<string, T> | null {
  if (!entry || !Array.isArray(entry.data)) return null;
  if (Date.now() - (entry.ts || 0) > ttl) return null;

  try {
    return new Map(entry.data);
  } catch {
    return null;
  }
}
