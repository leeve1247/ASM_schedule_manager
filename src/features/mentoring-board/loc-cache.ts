// Lecture detail-page location cache for mentoLec list events.

import { CacheEntry, readCacheEntry, writeCacheEntry, cacheEntryToMap } from '@shared/storage/cache';
import { toDateStr } from '@shared/date/date-time';
import { fetchInBatches } from './list-cache';

export const LOC_CACHE_KEY = 'asm_location_v1';
const LOC_CACHE_TTL = 4 * 60 * 60 * 1000;

let locCacheMemory = new Map<string, string>();

export function getLocCacheMemory(): Map<string, string> {
  return locCacheMemory;
}

export function clearLocCacheMemory(): void {
  locCacheMemory = new Map();
}

export async function loadLocCache(): Promise<Map<string, string>> {
  locCacheMemory =
    cacheEntryToMap<string>(await readCacheEntry<string>(LOC_CACHE_KEY), LOC_CACHE_TTL) ||
    new Map<string, string>();
  return locCacheMemory;
}

async function saveLocCache(map: Map<string, string>): Promise<void> {
  locCacheMemory = map;
  const entry: CacheEntry<string> = { ts: Date.now(), data: [...map] };
  await writeCacheEntry<string>(LOC_CACHE_KEY, entry);
}

export function parseLocationFromDoc(doc: Document): string | null {
  for (const th of doc.querySelectorAll('th')) {
    if ((th.textContent ?? '').trim() === '장소') {
      const td = th.nextElementSibling || th.closest('tr')?.nextElementSibling?.querySelector('td');
      if (td) return (td.textContent ?? '').trim();
    }
  }

  for (const dt of doc.querySelectorAll('dt')) {
    if ((dt.textContent ?? '').trim() === '장소') {
      const dd = dt.nextElementSibling;
      if (dd) return (dd.textContent ?? '').trim();
    }
  }

  for (const el of doc.querySelectorAll('.label, .tit, strong')) {
    if ((el.textContent ?? '').trim() === '장소') {
      const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
      if (next) return (next.textContent ?? '').trim();
    }
  }

  return null;
}

export async function fetchLocations(
  events: Array<{ sn: string | null; date: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, string>> {
  const locCache = await loadLocCache();
  const todayStr = toDateStr(new Date());

  // ascending sort: today comes first (past is filtered out), then future days in order.
  // 월 이동 시에도 자동으로 그 달의 1일부터 순서대로 fetch됨.
  const missing = events
    .filter((ev) => ev.sn && !locCache.has(ev.sn) && ev.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (missing.length === 0) return locCache;

  const origin = location.origin;
  const total = missing.length;
  let done = 0;

  await fetchInBatches<{ sn: string | null; loc: string | null }>(
    missing.map((ev) => async () => {
      const url = `${origin}/busan/sw/mypage/mentoLec/view.do?qustnrSn=${ev.sn}&menuNo=200046`;
      const res = await fetch(url, { credentials: 'include' });

      if (!res.ok) return { sn: ev.sn, loc: null };

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      return { sn: ev.sn, loc: parseLocationFromDoc(doc) };
    }),
    3,
    (batchResults) => {
      batchResults.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.sn) {
          locCache.set(r.value.sn, r.value.loc ?? '');
        }
      });
      done += batchResults.length;
      if (onProgress) onProgress(done, total);
    }
  );

  await saveLocCache(locCache);

  return locCache;
}
