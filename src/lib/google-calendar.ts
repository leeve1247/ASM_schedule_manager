// Google Calendar integration. Runs only in the background service worker
// (uses chrome.identity which is unavailable to content scripts).

export interface GcalEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
}

export interface LectureMatchInput {
  qustnrSn: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  title?: string;
}

const EVENT_CACHE_TTL = 5 * 60 * 1000;

function getAuthTokenPromise(interactive: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn('[ASM gcal] getAuthToken error:', err.message, '(interactive:', interactive, ')');
        resolve(null);
        return;
      }
      if (!token) {
        console.warn('[ASM gcal] getAuthToken returned no token (interactive:', interactive, ')');
        resolve(null);
        return;
      }
      // Chrome MV3 may return a TokenInformation object; normalize to string.
      if (typeof token === 'string') resolve(token);
      else if (token && typeof (token as { token?: string }).token === 'string') {
        resolve((token as { token: string }).token);
      } else {
        console.warn('[ASM gcal] getAuthToken unexpected shape:', token);
        resolve(null);
      }
    });
  });
}

function removeCachedAuthTokenPromise(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, () => resolve());
  });
}

async function revokeTokenAtGoogle(token: string): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    /* network failures shouldn't block local logout */
  }
}

export async function isConnected(): Promise<boolean> {
  const token = await getAuthTokenPromise(false);
  return token !== null;
}

export async function connect(): Promise<{ connected: boolean; error?: string }> {
  const token = await getAuthTokenPromise(true);
  if (!token) return { connected: false, error: 'OAuth 인증이 취소되었거나 실패했습니다.' };
  return { connected: true };
}

export async function disconnect(): Promise<void> {
  const token = await getAuthTokenPromise(false);
  if (token) {
    await revokeTokenAtGoogle(token);
    await removeCachedAuthTokenPromise(token);
  }
}

async function fetchEventsFromGoogle(
  token: string,
  timeMin: string,
  timeMax: string
): Promise<GcalEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
  console.log('[ASM gcal] fetching events', timeMin, '→', timeMax);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    const body = await res.text();
    console.warn('[ASM gcal] events.list 401:', body);
    await removeCachedAuthTokenPromise(token);
    throw new Error('인증이 만료되었습니다. 다시 연동해주세요.');
  }

  if (!res.ok) {
    const body = await res.text();
    console.warn('[ASM gcal] events.list error', res.status, body);
    throw new Error(`Google Calendar API 응답 오류 (${res.status})`);
  }

  const data = (await res.json()) as { items?: GcalEvent[] };
  const items = data.items ?? [];
  console.log('[ASM gcal] events fetched:', items.length);
  return items;
}

interface CacheEntry {
  ts: number;
  events: GcalEvent[];
}

async function readCache(key: string): Promise<CacheEntry | null> {
  return new Promise((resolve) => {
    chrome.storage.session.get([key], (res) => {
      const entry = res[key] as CacheEntry | undefined;
      resolve(entry ?? null);
    });
  });
}

async function writeCache(key: string, entry: CacheEntry): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.session.set({ [key]: entry }, () => resolve());
  });
}

export async function listEventsCached(timeMin: string, timeMax: string): Promise<GcalEvent[]> {
  const cacheKey = `gcal_events:${timeMin}:${timeMax}`;
  const cached = await readCache(cacheKey);
  if (cached && Date.now() - cached.ts < EVENT_CACHE_TTL) {
    return cached.events;
  }

  const token = await getAuthTokenPromise(false);
  if (!token) throw new Error('NOT_CONNECTED');

  const events = await fetchEventsFromGoogle(token, timeMin, timeMax);
  await writeCache(cacheKey, { ts: Date.now(), events });
  return events;
}

export async function clearEventCache(): Promise<void> {
  const all = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.session.get(null, (res) => resolve(res || {}));
  });
  const keys = Object.keys(all).filter((k) => k.startsWith('gcal_events:'));
  if (keys.length === 0) return;
  await new Promise<void>((resolve) => {
    chrome.storage.session.remove(keys, () => resolve());
  });
}

function isLectureMatched(lecture: LectureMatchInput, events: GcalEvent[]): boolean {
  // Strict match: this extension's exporter writes the lecture's SOMA URL
  // (which contains `qustnrSn=<id>`) into the event description. Looser
  // heuristics (time-overlap + "swmaestro" substring) false-positive when
  // another SOMA event happens to overlap.
  if (!lecture.qustnrSn) return false;
  const needle = `qustnrSn=${lecture.qustnrSn}`;
  return events.some((e) => (e.description ?? '').includes(needle));
}

export async function matchLectures(
  lectures: LectureMatchInput[]
): Promise<{ connected: boolean; matched: Record<string, boolean>; error?: string }> {
  if (lectures.length === 0) return { connected: true, matched: {} };

  // Determine date range covering all lectures.
  const dates = lectures
    .map((l) => l.dateStr)
    .filter(Boolean)
    .sort();
  if (dates.length === 0) return { connected: true, matched: {} };

  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];
  const timeMin = `${minDate}T00:00:00+09:00`;
  const timeMax = `${maxDate}T23:59:59+09:00`;

  let events: GcalEvent[];
  try {
    events = await listEventsCached(timeMin, timeMax);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'NOT_CONNECTED') return { connected: false, matched: {} };
    return { connected: false, matched: {}, error: msg };
  }

  const matched: Record<string, boolean> = {};
  for (const lecture of lectures) {
    matched[lecture.qustnrSn] = isLectureMatched(lecture, events);
  }
  const trueCount = Object.values(matched).filter(Boolean).length;
  console.log(
    '[ASM gcal] match summary —',
    'lectures:',
    lectures.length,
    'events:',
    events.length,
    'matched=true:',
    trueCount,
    'matched=false:',
    lectures.length - trueCount
  );
  return { connected: true, matched };
}
