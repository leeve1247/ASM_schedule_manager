// SOMA mentoring board enhancement (content script for mentoLec list pages).
// Replaces the default SOMA monthly calendar UI with a richer panel that adds
// fetched-on-demand details (capacity, location), conflict warnings against the
// user's enrolled lectures and personal schedules, and export buttons (via
// ASMCalendarExport on the global object).

export {};

interface EventInfo {
  date: string;
  title: string;
  timeStart: string;
  timeEnd: string;
  current: string;
  total: string;
  isClosed: boolean;
  author: string;
}

interface EventRecord extends EventInfo {
  sn: string | null;
  category: string;
  categoryNm: string;
  url: string;
  location?: string | null;
  hasPersonalConflict?: boolean;
  hasMentoringConflict?: boolean;
  isEnrolled?: boolean;
}

interface MentoringSchedule {
  qustnrSn: string;
  title: string;
  dateStr: string;
  startTime: string;
  endTime: string;
}

interface PersonalSchedule {
  dateStr: string;
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

interface CacheEntry<T> {
  ts: number;
  data: Array<[string, T]>;
}

interface LocationInfo {
  type: 'online' | 'offline';
  label: string;
}

interface SearchDraft {
  type: 'title' | 'author';
  keyword: string;
}

interface MonthRange {
  start: Date;
  end: Date;
  today: Date;
  year: number;
  month: number;
}

(function () {
  'use strict';

  if (!location.href.includes('mentoLec')) return;

  // ── 날짜 유틸 ─────────────────────────────────────────────────────────────

  const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

  function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function getMonthRange(offset = 0): MonthRange {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start: base, end, today, year: base.getFullYear(), month: base.getMonth() };
  }

  function normalizeText(text: string | undefined | null): string {
    return (text || '').toString().trim().normalize('NFC').toLowerCase();
  }

  // ── 리스트 테이블 파싱 ────────────────────────────────────────────────────

  function parseTableRows(root: Document | Element): Map<string, EventInfo> {
    const map = new Map<string, EventInfo>();

    root.querySelectorAll('tbody tr').forEach((tr) => {
      const link = tr.querySelector<HTMLAnchorElement>('a[href*="mentoLec/view.do"]');
      if (!link) return;

      const snMatch = link.href.match(/qustnrSn=(\d+)/);
      if (!snMatch) return;

      const sn = snMatch[1];

      const allTds = tr.querySelectorAll('td');
      const pcTds = [...allTds].filter((td) => td.classList.contains('pc_only'));

      const dateTimeRaw = pcTds[2] ? pcTds[2].textContent ?? '' : '';
      const dateMatch = dateTimeRaw.match(/(\d{4}-\d{2}-\d{2})/);
      const fullTimeMatch = dateTimeRaw.match(
        /(\d{4}-\d{2}-\d{2})(?:\([^)]+\))?\s+(\d{2}:\d{2})\s*시?\s*~\s*(\d{2}:\d{2})\s*시?/
      );

      const capRaw = pcTds[3] ? pcTds[3].textContent ?? '' : '';
      const capMatch = capRaw.match(/(\d+)\s*\/\s*(\d+)/);

      const statusRaw = pcTds[5] ? (pcTds[5].textContent ?? '').trim() : '';
      const author = pcTds[6] ? (pcTds[6].textContent ?? '').trim() : '';

      const titleRaw = (link.textContent ?? '').trim();
      const title = titleRaw.replace(/^\[(자유 멘토링|멘토 특강)\]\s*/, '');

      map.set(sn, {
        date: dateMatch ? dateMatch[1] : '',
        title,
        timeStart: fullTimeMatch ? fullTimeMatch[2] : '',
        timeEnd: fullTimeMatch ? fullTimeMatch[3] : '',
        current: capMatch ? capMatch[1] : '',
        total: capMatch ? capMatch[2] : '',
        isClosed: statusRaw.includes('마감'),
        author,
      });
    });

    return map;
  }

  // ── 전체 페이지 fetch + chrome.storage.local 캐시 ─────────────────────────

  const STABLE_CACHE_KEY = 'asm_event_stable_v1';
  const COUNT_CACHE_KEY = 'asm_event_count_v1';
  const LOC_CACHE_KEY = 'asm_location_v1';

  const STABLE_CACHE_TTL = 4 * 60 * 60 * 1000; // 4시간
  const COUNT_CACHE_TTL = 5 * 60 * 1000; // 5분
  const LIST_FETCH_BATCH_SIZE = 3;
  const FULL_FETCH_JITTER_MAX_MS = 10 * 1000;

  let locCacheMemory = new Map<string, string>();

  function hasChromeLocalStorage(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
  }

  function readChromeStorage(keys: string[]): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) {
        resolve({});
        return;
      }

      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime?.lastError) {
          resolve({});
          return;
        }

        resolve(result || {});
      });
    });
  }

  function writeChromeStorage(obj: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!hasChromeLocalStorage()) {
        resolve();
        return;
      }

      chrome.storage.local.set(obj, () => {
        const error = chrome.runtime?.lastError;
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  function removeChromeStorage(keys: string[]): Promise<void> {
    return new Promise((resolve) => {
      if (!hasChromeLocalStorage()) {
        resolve();
        return;
      }

      chrome.storage.local.remove(keys, () => {
        resolve();
      });
    });
  }

  async function readCacheEntry<T>(key: string): Promise<CacheEntry<T> | null> {
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

  async function writeCacheEntry<T>(key: string, entry: CacheEntry<T>): Promise<void> {
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

  async function removeCacheEntries(keys: string[]): Promise<void> {
    keys.forEach((key) => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    });

    await removeChromeStorage(keys);
  }

  function cacheEntryToMap<T>(entry: CacheEntry<T> | null, ttl: number): Map<string, T> | null {
    if (!entry || !Array.isArray(entry.data)) return null;
    if (Date.now() - (entry.ts || 0) > ttl) return null;

    try {
      return new Map(entry.data);
    } catch {
      return null;
    }
  }

  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitBeforeFullFetch(): Promise<void> {
    const jitter = Math.floor(Math.random() * FULL_FETCH_JITTER_MAX_MS);
    if (jitter > 0) await delay(jitter);
  }

  async function loadStableCache(): Promise<Map<string, EventInfo> | null> {
    return cacheEntryToMap<EventInfo>(await readCacheEntry<EventInfo>(STABLE_CACHE_KEY), STABLE_CACHE_TTL);
  }

  async function saveStableCache(map: Map<string, EventInfo>): Promise<void> {
    const stableOnly = new Map<string, EventInfo>(
      [...map].map(([k, v]) => [
        k,
        {
          date: v.date,
          title: v.title,
          timeStart: v.timeStart,
          timeEnd: v.timeEnd,
          isClosed: v.isClosed,
          author: v.author,
          current: '',
          total: '',
        },
      ])
    );

    await writeCacheEntry<EventInfo>(STABLE_CACHE_KEY, {
      ts: Date.now(),
      data: [...stableOnly],
    });
  }

  type CountInfo = { current: string; total: string };

  async function loadCountCache(): Promise<Map<string, CountInfo> | null> {
    return cacheEntryToMap<CountInfo>(await readCacheEntry<CountInfo>(COUNT_CACHE_KEY), COUNT_CACHE_TTL);
  }

  async function saveCountCache(map: Map<string, EventInfo>): Promise<void> {
    const countsOnly = new Map<string, CountInfo>(
      [...map].map(([k, v]) => [k, { current: v.current, total: v.total }])
    );

    await writeCacheEntry<CountInfo>(COUNT_CACHE_KEY, {
      ts: Date.now(),
      data: [...countsOnly],
    });
  }

  function mergeStableAndCounts(
    stableMap: Map<string, EventInfo>,
    countMap: Map<string, CountInfo> | null
  ): Map<string, EventInfo> {
    const merged = new Map<string, EventInfo>();
    stableMap.forEach((v, sn) => {
      const counts = countMap?.get(sn);
      merged.set(sn, {
        ...v,
        current: counts?.current ?? v.current ?? '',
        total: counts?.total ?? v.total ?? '',
      });
    });
    return merged;
  }

  async function fetchPageMap(pageIndex: number, baseUrl: string): Promise<Map<string, EventInfo>> {
    const url = `${baseUrl}&scdate=2026-01-01&ecdate=2026-12-31&edcDateOrder=&regDateOrder=&pageIndex=${pageIndex}`;
    const res = await fetch(url, { credentials: 'include' });

    if (!res.ok) return new Map();

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    return parseTableRows(doc);
  }

  // ── 장소 캐시 ─────────────────────────────────────────────────────────────

  async function loadLocCache(): Promise<Map<string, string>> {
    locCacheMemory =
      cacheEntryToMap<string>(await readCacheEntry<string>(LOC_CACHE_KEY), STABLE_CACHE_TTL) || new Map<string, string>();

    return locCacheMemory;
  }

  async function saveLocCache(map: Map<string, string>): Promise<void> {
    locCacheMemory = map;
    await writeCacheEntry<string>(LOC_CACHE_KEY, {
      ts: Date.now(),
      data: [...map],
    });
  }

  // ── 상세 페이지에서 장소 파싱 ─────────────────────────────────────────────

  function parseLocationFromDoc(doc: Document): string | null {
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

  function classifyLocation(text: string | null | undefined): LocationInfo | null {
    if (!text) return null;

    const t = text.trim();
    if (!t) return null;

    if (t.includes('온라인') || /zoom|meet|teams|webex/i.test(t)) {
      return { type: 'online', label: '온라인' };
    }

    return { type: 'offline', label: '오프라인' };
  }

  function getSafeSomaUrl(url: string | undefined | null): string {
    try {
      const parsed = new URL(url || '', window.location.origin);
      if (parsed.protocol === 'https:' && /(^|\.)swmaestro\.(ai|org)$/i.test(parsed.hostname)) {
        return parsed.toString();
      }
    } catch (_) {
      /* ignore */
    }
    return '';
  }

  function loadPersonalSchedules(): Promise<PersonalSchedule[]> {
    return new Promise((resolve) => {
      chrome.storage.local.get(['soma_personal_schedules'], (res) => {
        resolve((res.soma_personal_schedules as PersonalSchedule[]) || []);
      });
    });
  }

  async function fetchMentoringSchedulesFromHistory(): Promise<MentoringSchedule[]> {
    const origin = location.origin;
    const baseMatch = location.pathname.match(/^(.*?\/sw)\//);
    const base = baseMatch ? baseMatch[1] : '/busan/sw';
    const urls = [`${origin}${base}/mypage/userAnswer/history.do?menuNo=200047`];

    for (const url of urls) {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) continue;

        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const rows = doc.querySelectorAll('.boardlist table tbody tr');

        const schedules: MentoringSchedule[] = [];
        rows.forEach((tr) => {
          const cells = tr.querySelectorAll('td');
          if (cells.length < 8) return;

          const titleLink = cells[2].querySelector<HTMLAnchorElement>('a');
          const title = titleLink ? (titleLink.textContent ?? '').trim() : '';
          const href = titleLink ? titleLink.getAttribute('href') ?? '' : '';

          let qustnrSn = '';
          if (href) {
            const m = href.match(/[?&]qustnrSn=(\d+)/);
            if (m) qustnrSn = m[1];
          }

          let rawText = '';
          for (let i = 2; i < cells.length; i++) {
            const ct = (cells[i].textContent ?? '').replace(/\s+/g, ' ').trim();
            if (/\d{4}[-./]\d{2}[-./]\d{2}/.test(ct) && /\d{2}:\d{2}\s*시?\s*~\s*\d{2}:\d{2}/.test(ct)) {
              rawText = cells[i].innerHTML
                .replace(/<br\s*\/?>/gi, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              break;
            }
          }

          const status = cells[6] ? (cells[6].textContent ?? '').trim() : '';
          const approval = cells[7] ? (cells[7].textContent ?? '').trim() : '';
          const combined = `${status} ${approval}`;
          if (/취소/.test(combined) && !/취소불가/.test(combined)) return;

          if (!rawText) return;

          const fullMatch = rawText.match(
            /(\d{4})[-./](\d{2})[-./](\d{2})(?:\([^)]+\))?\s+(\d{2}:\d{2})\s*시?\s*~\s*(\d{2}:\d{2})\s*시?/
          );

          if (!fullMatch) return;

          schedules.push({
            qustnrSn,
            title,
            dateStr: `${fullMatch[1]}-${fullMatch[2]}-${fullMatch[3]}`,
            startTime: fullMatch[4],
            endTime: fullMatch[5],
          });
        });

        if (schedules.length > 0) {
          chrome.storage.local.set({
            soma_mentoring_schedules: schedules,
            soma_mentoring_schedules_ts: Date.now(),
          });
          return schedules;
        }
      } catch (_) {
        /* try next URL */
      }
    }

    return [];
  }

  const MENTORING_CACHE_TTL = 5 * 60 * 1000;

  async function loadMentoringSchedules(): Promise<MentoringSchedule[]> {
    const stored = await new Promise<{
      soma_mentoring_schedules?: MentoringSchedule[];
      soma_mentoring_schedules_ts?: number;
    }>((resolve) => {
      chrome.storage.local.get(['soma_mentoring_schedules', 'soma_mentoring_schedules_ts'], (res) => {
        resolve(res as { soma_mentoring_schedules?: MentoringSchedule[]; soma_mentoring_schedules_ts?: number });
      });
    });

    const ts = stored.soma_mentoring_schedules_ts || 0;
    const cached = stored.soma_mentoring_schedules;

    if (cached && cached.length > 0 && Date.now() - ts < MENTORING_CACHE_TTL) {
      return cached;
    }

    return fetchMentoringSchedulesFromHistory();
  }

  function hasMentoringScheduleConflict(ev: EventRecord, mentoringSchedules: MentoringSchedule[]): boolean {
    if (!ev?.date || !ev?.timeStart || !ev?.timeEnd || !Array.isArray(mentoringSchedules)) {
      return false;
    }

    const [ey, em, ed] = ev.date.split('-').map(Number);
    const [esh, esm] = ev.timeStart.split(':').map(Number);
    const [eeh, eem] = ev.timeEnd.split(':').map(Number);

    if ([ey, em, ed, esh, esm, eeh, eem].some((n) => Number.isNaN(n))) {
      return false;
    }

    const eventStart = new Date(ey, em - 1, ed, esh, esm, 0);
    const eventEnd = new Date(ey, em - 1, ed, eeh, eem, 0);

    return mentoringSchedules.some((ms) => {
      if (!ms?.dateStr || !ms?.startTime || !ms?.endTime) return false;
      if (ev.sn && ms.qustnrSn && ev.sn === ms.qustnrSn) return false;

      const [py, pm, pd] = ms.dateStr.split('-').map(Number);
      const [psh, psm] = ms.startTime.split(':').map(Number);
      const [peh, pem] = ms.endTime.split(':').map(Number);

      if ([py, pm, pd, psh, psm, peh, pem].some((n) => Number.isNaN(n))) {
        return false;
      }

      const msStart = new Date(py, pm - 1, pd, psh, psm, 0);
      const msEnd = new Date(py, pm - 1, pd, peh, pem, 0);

      return eventStart < msEnd && msStart < eventEnd;
    });
  }

  function hasPersonalScheduleConflict(ev: EventRecord, personalSchedules: PersonalSchedule[]): boolean {
    if (!ev?.date || !ev?.timeStart || !ev?.timeEnd || !Array.isArray(personalSchedules)) {
      return false;
    }

    const [ey, em, ed] = ev.date.split('-').map(Number);
    const [esh, esm] = ev.timeStart.split(':').map(Number);
    const [eeh, eem] = ev.timeEnd.split(':').map(Number);

    if ([ey, em, ed, esh, esm, eeh, eem].some((n) => Number.isNaN(n))) {
      return false;
    }

    const eventStart = new Date(ey, em - 1, ed, esh, esm, 0);
    const eventEnd = new Date(ey, em - 1, ed, eeh, eem, 0);

    return personalSchedules.some((ps) => {
      if (!ps?.dateStr || !ps?.startTime || !ps?.endTime) return false;

      const [py, pm, pd] = ps.dateStr.split('-').map(Number);
      const [psh, psm] = ps.startTime.split(':').map(Number);
      const [peh, pem] = ps.endTime.split(':').map(Number);

      if ([py, pm, pd, psh, psm, peh, pem].some((n) => Number.isNaN(n))) {
        return false;
      }

      const personalStart = new Date(py, pm - 1, pd, psh, psm, 0);
      const personalEnd = new Date(py, pm - 1, pd, peh, pem, 0);

      return eventStart < personalEnd && personalStart < eventEnd;
    });
  }

  // ── 상세 페이지 fetch → 장소 정보 수집 ───────────────────────────────────

  async function fetchInBatches<T>(tasks: Array<() => Promise<T>>, batchSize: number): Promise<PromiseSettledResult<T>[]> {
    const results: PromiseSettledResult<T>[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
      results.push(...batchResults);
    }
    return results;
  }

  async function fetchLocations(events: EventRecord[]): Promise<Map<string, string>> {
    const locCache = await loadLocCache();
    const todayStr = toDateStr(new Date());

    const missing = events.filter((ev) => ev.sn && !locCache.has(ev.sn) && ev.date >= todayStr);

    if (missing.length === 0) return locCache;

    const origin = location.origin;

    const results = await fetchInBatches<{ sn: string | null; loc: string | null }>(
      missing.map((ev) => async () => {
        const url = `${origin}/busan/sw/mypage/mentoLec/view.do?qustnrSn=${ev.sn}&menuNo=200046`;
        const res = await fetch(url, { credentials: 'include' });

        if (!res.ok) return { sn: ev.sn, loc: null };

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        return { sn: ev.sn, loc: parseLocationFromDoc(doc) };
      }),
      3
    );

    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.sn) {
        locCache.set(r.value.sn, r.value.loc ?? '');
      }
    });

    await saveLocCache(locCache);

    return locCache;
  }

  function getBaseUrl(): string {
    const u = new URL(location.href);
    return `${u.origin}${u.pathname}?menuNo=${u.searchParams.get('menuNo') || '200046'}`;
  }

  function getTotalPages(): number {
    const lastLink = document.querySelector<HTMLAnchorElement>(
      '.paginationSet a[title="마지막 목록"], .paginationSet .i.last a'
    );

    if (lastLink) {
      const m = lastLink.href.match(/pageIndex=(\d+)/);
      if (m) return parseInt(m[1], 10);
    }

    const pageLinks = document.querySelectorAll<HTMLAnchorElement>('.paginationSet li a');
    let max = 1;

    pageLinks.forEach((a) => {
      const m = a.href.match(/pageIndex=(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });

    return max;
  }

  async function buildCompleteEventMap(
    onProgress?: (map: Map<string, EventInfo>) => void
  ): Promise<Map<string, EventInfo>> {
    const stableCache = await loadStableCache();
    const countCache = await loadCountCache();

    if (stableCache && countCache) {
      return mergeStableAndCounts(stableCache, countCache);
    }

    const freshMap = parseTableRows(document);
    const totalPages = getTotalPages();
    const baseUrl = getBaseUrl();

    if (totalPages > 1) {
      await waitBeforeFullFetch();

      const pageNums: number[] = [];
      for (let i = 2; i <= totalPages; i++) pageNums.push(i);

      const results = await fetchInBatches<Map<string, EventInfo>>(
        pageNums.map((n) => () => fetchPageMap(n, baseUrl)),
        LIST_FETCH_BATCH_SIZE
      );

      results.forEach((r) => {
        if (r.status === 'fulfilled') {
          r.value.forEach((v, k) => {
            if (!freshMap.has(k)) freshMap.set(k, v);
          });
        }
      });
    }

    await saveCountCache(freshMap);

    if (!stableCache) await saveStableCache(freshMap);

    if (onProgress) onProgress(freshMap);

    return mergeStableAndCounts(
      stableCache ?? freshMap,
      new Map<string, CountInfo>([...freshMap].map(([k, v]) => [k, { current: v.current, total: v.total }]))
    );
  }

  // ── 이벤트 수집 ───────────────────────────────────────────────────────────

  function collectEvents(eventMap: Map<string, EventInfo>): EventRecord[] {
    const events: EventRecord[] = [];
    const seen = new Set<string>();

    document
      .querySelectorAll('.mypageCalendar .datepicker-days tbody td[data-date] ul li.category')
      .forEach((li) => {
        const td = li.closest('td[data-date]');
        const date = td ? td.getAttribute('data-date') : null;

        if (!date) return;

        const anchor = li.querySelector<HTMLAnchorElement>('a[title]');
        if (!anchor) return;

        const title = anchor.getAttribute('title') || '';
        const category = [...anchor.classList].find((c) => c.startsWith('MRC')) || '';
        const popLink = li.querySelector<HTMLAnchorElement>('.calendarPop a.link');
        const snMatch = popLink ? popLink.href.match(/qustnrSn=(\d+)/) : null;
        const sn = snMatch ? snMatch[1] : null;
        const url = popLink ? popLink.href : '#';

        if (sn && seen.has(sn)) return;
        if (sn) seen.add(sn);

        const info: Partial<EventInfo> = (sn && eventMap.get(sn)) || {};

        events.push({
          sn,
          date: info.date || date,
          title,
          category,
          categoryNm: category === 'MRC010' ? '자유 멘토링' : '멘토 특강',
          url,
          isClosed: info.isClosed ?? false,
          current: info.current || '',
          total: info.total || '',
          author: info.author || '',
          timeStart: info.timeStart || '',
          timeEnd: info.timeEnd || '',
        });
      });

    eventMap.forEach((info, sn) => {
      if (seen.has(sn) || !info.date) return;

      const link = document.querySelector<HTMLAnchorElement>(
        `a[href*="qustnrSn=${sn}"][href*="mentoLec/view"]`
      );
      const titleFromDom = link ? (link.textContent ?? '').trim().replace(/^\[(자유 멘토링|멘토 특강)\]\s*/, '') : '';

      const title = info.title || titleFromDom || `(번호 ${sn})`;
      const titleRaw = link ? (link.textContent ?? '').trim() : info.title || '';
      const category = titleRaw.startsWith('[자유 멘토링]') ? 'MRC010' : 'MRC020';
      const url = link ? link.href : `${location.origin}/busan/sw/mypage/mentoLec/view.do?qustnrSn=${sn}&menuNo=200046`;

      events.push({
        sn,
        date: info.date,
        title,
        category,
        categoryNm: category === 'MRC010' ? '자유 멘토링' : '멘토 특강',
        url,
        isClosed: info.isClosed,
        current: info.current,
        total: info.total,
        author: info.author,
        timeStart: info.timeStart,
        timeEnd: info.timeEnd,
      });
    });

    return events;
  }

  // ── 검색 필터 ─────────────────────────────────────────────────────────────

  function filterEventsBySearch(
    events: EventRecord[],
    searchType: 'title' | 'author',
    searchKeyword: string
  ): EventRecord[] {
    const keyword = normalizeText(searchKeyword);
    if (!keyword) return events;

    return events.filter((ev) => {
      const target = searchType === 'title' ? normalizeText(ev.title) : normalizeText(ev.author);
      return target.includes(keyword);
    });
  }

  function getEventStatusGroup(ev: EventRecord, todayStr: string): number {
    const isPast = ev.date < todayStr;
    const isClosed = ev.isClosed;
    return isPast || isClosed ? 1 : 0;
  }

  function timeToMinutes(time: string): number {
    if (!time) return 24 * 60 + 999;
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 24 * 60 + 999;
    return h * 60 + m;
  }

  function getComparableAuthor(author: string): string {
    return (author || '').replace(/\s*멘토\s*$/g, '').trim().normalize('NFC');
  }

  function getComparableTitle(title: string): string {
    return (title || '')
      .replace(/^\s*\[(온라인|오프라인)\]\s*/g, '')
      .replace(/^\s*\((온라인|오프라인)\)\s*/g, '')
      .replace(/^\s*\[(자유 멘토링|멘토 특강)\]\s*/g, '')
      .trim()
      .normalize('NFC');
  }

  function compareKoreanText(aText: string, bText: string): number {
    return aText.localeCompare(bText, 'ko-KR', {
      usage: 'sort',
      sensitivity: 'variant',
      numeric: true,
      ignorePunctuation: true,
    });
  }

  function sortEventsByStatusTimeAuthor(a: EventRecord, b: EventRecord, todayStr: string): number {
    const groupA = getEventStatusGroup(a, todayStr);
    const groupB = getEventStatusGroup(b, todayStr);

    if (groupA !== groupB) return groupA - groupB;

    const timeA = timeToMinutes(a.timeStart);
    const timeB = timeToMinutes(b.timeStart);

    if (timeA !== timeB) return timeA - timeB;

    const authorA = getComparableAuthor(a.author);
    const authorB = getComparableAuthor(b.author);

    const authorCompare = compareKoreanText(authorA, authorB);
    if (authorCompare !== 0) return authorCompare;

    const titleA = getComparableTitle(a.title);
    const titleB = getComparableTitle(b.title);

    const titleCompare = compareKoreanText(titleA, titleB);
    if (titleCompare !== 0) return titleCompare;

    return String(a.sn || '').localeCompare(String(b.sn || ''), 'ko-KR', { numeric: true });
  }

  // ── 이벤트 카드 생성 ──────────────────────────────────────────────────────

  function makeCard(ev: EventRecord, todayStr: string): HTMLDivElement {
    const isPast = ev.date < todayStr;
    const isGray = isPast || ev.isClosed;

    const card = document.createElement('div');
    card.className = `asm-event-card ${isGray ? 'asm-card-gray' : 'asm-card-open asm-cat-' + ev.category}${
      ev.hasMentoringConflict ? ' asm-card-conflict' : ''
    }${ev.hasPersonalConflict ? ' asm-card-personal-conflict' : ''}${ev.isEnrolled ? ' asm-card-enrolled' : ''}`;
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');

    card.addEventListener('click', () => {
      const safeUrl = getSafeSomaUrl(ev.url);
      if (safeUrl) {
        window.open(safeUrl, '_blank', 'noopener');
      }
    });

    card.addEventListener('keydown', (e) => {
      const safeUrl = getSafeSomaUrl(ev.url);
      if ((e.key === 'Enter' || e.key === ' ') && safeUrl) {
        e.preventDefault();
        window.open(safeUrl, '_blank', 'noopener');
      }
    });

    const badges = document.createElement('div');
    badges.className = 'asm-card-badges';

    const catBadge = document.createElement('span');
    catBadge.className = `asm-badge asm-cat-badge asm-cat-${ev.category}`;
    catBadge.textContent = ev.categoryNm;
    badges.appendChild(catBadge);

    const locInfo = ev.location ? classifyLocation(ev.location) : null;

    if (locInfo) {
      badges.appendChild(mkBadge(locInfo.label, locInfo.type === 'online' ? 'asm-online' : 'asm-offline'));
    } else if (ev.title.includes('[온라인]') || ev.title.includes('(온라인)')) {
      badges.appendChild(mkBadge('온라인', 'asm-online'));
    } else if (ev.title.includes('[오프라인]') || ev.title.includes('(오프라인)')) {
      badges.appendChild(mkBadge('오프라인', 'asm-offline'));
    }

    const statusLabel = isPast ? '진행완료' : ev.isClosed ? '마감' : '접수중';
    const statusCls = isPast ? 'asm-done' : ev.isClosed ? 'asm-closed' : 'asm-open-badge';

    badges.appendChild(mkBadge(statusLabel, statusCls));

    if (ev.isEnrolled) {
      badges.appendChild(mkBadge('✓ 수강중', 'asm-enrolled'));
    }

    if (ev.hasPersonalConflict) {
      badges.appendChild(mkBadge('개인일정주의', 'asm-personal-conflict'));
    }

    if (ev.hasMentoringConflict) {
      badges.appendChild(mkBadge('멘토링일정주의', 'asm-conflict'));
    }

    card.appendChild(badges);

    const titleEl = document.createElement('div');
    titleEl.className = 'asm-card-title';
    titleEl.textContent = ev.title;
    card.appendChild(titleEl);

    const footer = document.createElement('div');
    footer.className = 'asm-card-footer';

    if (ev.author) {
      const author = document.createElement('div');
      author.className = 'asm-card-author';
      author.textContent = ev.author + ' 멘토';
      footer.appendChild(author);
    }

    if (ev.timeStart) {
      const time = document.createElement('div');
      time.className = 'asm-card-time';
      time.textContent = `${ev.timeStart} ~ ${ev.timeEnd}`;
      footer.appendChild(time);
    }

    const bottom = document.createElement('div');
    bottom.className = 'asm-card-footer-bottom';

    if (ev.current !== '' && ev.total !== '') {
      const cap = document.createElement('span');
      cap.className = 'asm-cap';
      cap.textContent = `${ev.current}/${ev.total}명`;
      bottom.appendChild(cap);
    } else {
      bottom.appendChild(document.createElement('span'));
    }

    const linkEl = document.createElement('a');
    linkEl.className = 'asm-card-link';
    linkEl.href = getSafeSomaUrl(ev.url) || '#';
    linkEl.target = '_blank';
    linkEl.textContent = '바로가기 →';
    linkEl.addEventListener('click', (e) => e.stopPropagation());

    bottom.appendChild(linkEl);
    footer.appendChild(bottom);

    const exporter = globalThis.ASMCalendarExport;
    if (ev.timeStart && ev.timeEnd && ev.date && exporter) {
      const exportRow = document.createElement('div');
      exportRow.className = 'asm-card-export-row';
      exporter.appendExportButtons(
        exportRow,
        () => {
          const safeUrl = getSafeSomaUrl(ev.url);
          const description = [
            ev.categoryNm,
            ev.author ? `${ev.author} 멘토` : '',
            safeUrl ? `상세: ${safeUrl}` : '',
          ]
            .filter(Boolean)
            .join('\n');
          return {
            title: ev.title,
            description,
            location: ev.location || '',
            startsAt: exporter.kstToIso(ev.date, ev.timeStart),
            endsAt: exporter.kstToIso(ev.date, ev.timeEnd),
          };
        },
        ev.title
      );
      footer.appendChild(exportRow);
    }

    card.appendChild(footer);

    return card;
  }

  function mkBadge(text: string, cls: string): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = `asm-badge ${cls}`;
    el.textContent = text;
    return el;
  }

  // ── 날짜 클릭 이벤트 패널 렌더 ───────────────────────────────────────────

  function renderEventPanel(
    container: HTMLElement,
    dayEvents: EventRecord[],
    dateStr: string,
    todayStr: string,
    isLoading: boolean
  ): void {
    container.innerHTML = '';

    const d = new Date(dateStr + 'T00:00:00');

    const headerEl = document.createElement('div');
    headerEl.className = 'asm-event-panel-header';

    const dateLabel = document.createElement('span');
    dateLabel.className = 'asm-event-panel-date';
    dateLabel.textContent = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}(${DAY_KO[d.getDay()]})`;

    const cntLabel = document.createElement('span');
    cntLabel.className = 'asm-event-panel-cnt';
    cntLabel.textContent = `${dayEvents.length}건`;

    headerEl.appendChild(dateLabel);
    headerEl.appendChild(cntLabel);
    container.appendChild(headerEl);

    if (isLoading) {
      const loadingRow = document.createElement('div');
      loadingRow.className = 'asm-cards-loading';
      loadingRow.innerHTML = '<span class="asm-loading-spinner"></span><span>불러오는 중…</span>';
      container.appendChild(loadingRow);
      return;
    }

    const cards = document.createElement('div');
    cards.className = 'asm-day-cards';

    [...dayEvents]
      .sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr))
      .forEach((ev) => cards.appendChild(makeCard(ev, todayStr)));

    container.appendChild(cards);
  }

  // ── 검색 UI ───────────────────────────────────────────────────────────────

  type SearchCallback = (type: 'title' | 'author', keyword: string) => void;

  function createSearchRow(
    searchDraft: SearchDraft,
    onSearchChange: SearchCallback,
    onSearchSubmit: SearchCallback,
    onSearchReset: () => void
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'asm-search-row';
    let isComposing = false;

    const select = document.createElement('select');
    select.className = 'asm-search-select';

    const titleOption = document.createElement('option');
    titleOption.value = 'title';
    titleOption.textContent = '제목';

    const authorOption = document.createElement('option');
    authorOption.value = 'author';
    authorOption.textContent = '작성자';

    select.appendChild(titleOption);
    select.appendChild(authorOption);
    select.value = searchDraft.type;

    const input = document.createElement('input');
    input.className = 'asm-search-input';
    input.type = 'text';
    input.placeholder = '검색어를 입력해주세요.';
    input.value = searchDraft.keyword;

    const searchBtn = document.createElement('button');
    searchBtn.type = 'button';
    searchBtn.className = 'asm-search-btn';
    searchBtn.textContent = '검색';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'asm-search-reset';
    resetBtn.textContent = '초기화';

    select.addEventListener('change', () => {
      onSearchChange(select.value as 'title' | 'author', input.value);
    });

    input.addEventListener('input', () => {
      onSearchChange(select.value as 'title' | 'author', input.value);
    });

    input.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    input.addEventListener('compositionend', () => {
      isComposing = false;
      onSearchChange(select.value as 'title' | 'author', input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (e.isComposing || isComposing || e.keyCode === 229) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        onSearchSubmit(select.value as 'title' | 'author', input.value);
      }
    });

    searchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onSearchSubmit(select.value as 'title' | 'author', input.value);
    });

    resetBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onSearchReset();
    });

    const searchBox = document.createElement('div');
    searchBox.className = 'asm-search-box';
    searchBox.appendChild(input);
    searchBox.appendChild(searchBtn);

    row.appendChild(select);
    row.appendChild(searchBox);
    row.appendChild(resetBtn);

    return row;
  }

  // ── 캘린더 패널 빌드 ─────────────────────────────────────────────────────

  interface BuildPanelResult {
    panel: HTMLDivElement;
    grid: HTMLDivElement;
    eventPanel: HTMLDivElement;
    byDate: Map<string, EventRecord[]>;
    selectedDate: () => string | null;
  }

  function buildPanel(
    events: EventRecord[],
    isLoading: boolean,
    offset = 0,
    onNavigate: ((newOffset: number) => void) | null = null,
    searchDraft: SearchDraft = { type: 'title', keyword: '' },
    onSearchChange: SearchCallback | null = null,
    onSearchSubmit: SearchCallback | null = null,
    onSearchReset: (() => void) | null = null,
    isCollapsed = false,
    onToggleCollapsed: (() => void) | null = null,
    onRefresh: (() => void) | null = null,
    isRefreshing = false
  ): BuildPanelResult {
    const { start, end, today, year, month } = getMonthRange(offset);
    const todayStr = toDateStr(today);
    const defaultSelectedDate = offset === 0 ? todayStr : toDateStr(start);

    const byDate = new Map<string, EventRecord[]>();

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      byDate.set(toDateStr(new Date(d)), []);
    }

    events.forEach((ev) => {
      const list = byDate.get(ev.date);
      if (list) list.push(ev);
    });

    const panel = document.createElement('div');
    panel.id = 'asm-2week-panel';

    const header = document.createElement('div');
    header.className = 'asm-panel-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'asm-panel-title-wrap';
    titleWrap.innerHTML = `<span class="asm-panel-ico">📅</span><span class="asm-panel-title">${year}년 ${month + 1}월</span>`;

    const loadingEl = document.createElement('span');
    loadingEl.className = 'asm-panel-loading';
    loadingEl.id = 'asm-panel-loading';

    titleWrap.appendChild(loadingEl);
    header.appendChild(titleWrap);

    const navWrap = document.createElement('div');
    navWrap.className = 'asm-panel-nav';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'asm-panel-nav-btn';
    prevBtn.textContent = '‹ 이전 달';
    prevBtn.title = '이전 달';
    prevBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onNavigate && onNavigate(offset - 1);
    });
    navWrap.appendChild(prevBtn);

    const todayBtn = document.createElement('button');
    todayBtn.type = 'button';
    todayBtn.className =
      offset === 0
        ? 'asm-panel-nav-btn asm-nav-today asm-nav-today-current'
        : 'asm-panel-nav-btn asm-nav-today';
    todayBtn.textContent = '오늘';
    todayBtn.title = '오늘이 포함된 달로 이동';
    todayBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onNavigate && onNavigate(0);
    });
    navWrap.appendChild(todayBtn);

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'asm-panel-nav-btn';
    nextBtn.textContent = '다음 달 ›';
    nextBtn.title = '다음 달';
    nextBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onNavigate && onNavigate(offset + 1);
    });
    navWrap.appendChild(nextBtn);

    header.appendChild(navWrap);

    const headerActions = document.createElement('div');
    headerActions.className = 'asm-panel-actions';

    const infoWrap = document.createElement('div');
    infoWrap.className = 'asm-panel-info-wrap';

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'asm-panel-info-btn';
    infoBtn.textContent = '!';
    infoBtn.title = '자동 갱신 안내';

    const infoPopover = document.createElement('div');
    infoPopover.className = 'asm-panel-info-popover';
    infoPopover.setAttribute('aria-hidden', 'true');
    infoPopover.innerHTML = `
      <div class="asm-info-title">자동 갱신 주기</div>
      <table class="asm-info-table">
        <tr><td>수강자수</td><td><b>5분</b></td></tr>
        <tr><td>제목 · 시간 · 상태 · 장소</td><td><b>4시간</b></td></tr>
      </table>
      <div class="asm-info-divider"></div>
      <div class="asm-info-subtitle">새로고침이 필요한 경우</div>
      <ul class="asm-info-list">
        <li>방금 신청했는데 수강자수가 아직 반영이 안 됐을 때</li>
        <li>장소·시간이 변경됐다는 공지를 봤을 때</li>
        <li>갱신 주기 전에 즉시 최신 정보가 필요할 때</li>
      </ul>
    `;

    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = infoPopover.classList.toggle('asm-panel-info-popover--open');
      infoPopover.setAttribute('aria-hidden', String(!isOpen));
    });

    document.addEventListener('click', function closePopover(e) {
      if (!infoWrap.contains(e.target as Node)) {
        infoPopover.classList.remove('asm-panel-info-popover--open');
        infoPopover.setAttribute('aria-hidden', 'true');
      }
    });

    infoWrap.appendChild(infoBtn);
    infoWrap.appendChild(infoPopover);
    headerActions.appendChild(infoWrap);

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'asm-panel-refresh';
    refreshBtn.title = '새로고침';
    const refreshIcon = document.createElement('span');
    refreshIcon.className = 'asm-refresh-icon' + (isRefreshing ? ' asm-refresh-icon--spinning' : '');
    refreshIcon.textContent = '↻';
    refreshBtn.appendChild(refreshIcon);
    refreshBtn.disabled = isRefreshing;
    refreshBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onRefresh && onRefresh();
    });
    headerActions.appendChild(refreshBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'asm-panel-toggle';
    toggleBtn.textContent = isCollapsed ? '펼치기' : '접기';
    headerActions.appendChild(toggleBtn);

    header.appendChild(headerActions);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'asm-panel-body';
    body.style.display = isCollapsed ? 'none' : '';

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      onToggleCollapsed && onToggleCollapsed();
    });

    const wdRow = document.createElement('div');
    wdRow.className = 'asm-cal-weekdays';

    ['일', '월', '화', '수', '목', '금', '토'].forEach((wd, i) => {
      const cell = document.createElement('div');
      cell.className = `asm-cal-wd${i === 0 || i === 6 ? ' asm-wd-weekend' : ''}`;
      cell.textContent = wd;
      wdRow.appendChild(cell);
    });

    const grid = document.createElement('div');
    grid.className = 'asm-cal-grid';

    const eventPanel = document.createElement('div');
    eventPanel.className = 'asm-event-panel';

    function showPlaceholder() {
      if (isLoading) {
        eventPanel.innerHTML =
          '<div class="asm-event-panel-placeholder"><span class="asm-loading-spinner"></span><span>데이터 불러오는 중…</span></div>';
      } else {
        eventPanel.innerHTML =
          '<div class="asm-event-panel-placeholder"><span>날짜를 선택하면<br>일정이 표시됩니다</span></div>';
      }
    }

    showPlaceholder();

    let selectedDate: string | null = null;

    function selectDate(dateStr: string) {
      const cell = grid.querySelector<HTMLDivElement>(`[data-date="${dateStr}"]`);
      const dayEvents = byDate.get(dateStr) || [];

      grid.querySelectorAll('.asm-cal-day.asm-cal-selected').forEach((c) => c.classList.remove('asm-cal-selected'));

      selectedDate = dateStr;

      if (cell) {
        cell.classList.add('asm-cal-selected');
      }

      const sortedDayEvents = [...dayEvents].sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr));

      renderEventPanel(eventPanel, sortedDayEvents, dateStr, todayStr, isLoading);
    }

    for (let i = 0; i < start.getDay(); i++) {
      const empty = document.createElement('div');
      empty.className = 'asm-cal-day asm-cal-empty';
      grid.appendChild(empty);
    }

    byDate.forEach((dayEvents, dateStr) => {
      const d = new Date(dateStr + 'T00:00:00');
      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const hasEvents = dayEvents.length > 0;

      const sortedDayEvents = [...dayEvents].sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr));

      const cell = document.createElement('div');

      cell.className = [
        'asm-cal-day',
        isToday ? 'asm-cal-today' : '',
        isPast ? 'asm-cal-past' : '',
        isWeekend ? 'asm-cal-weekend' : '',
        hasEvents ? 'asm-cal-has-events' : '',
      ]
        .filter(Boolean)
        .join(' ');

      cell.dataset.date = dateStr;

      const numEl = document.createElement('div');
      numEl.className = 'asm-cal-daynum';
      numEl.textContent = String(d.getDate());
      cell.appendChild(numEl);

      if (hasEvents) {
        const cntEl = document.createElement('div');
        cntEl.className = 'asm-cal-cnt';
        cntEl.textContent = `${sortedDayEvents.length}건`;
        cell.appendChild(cntEl);

        const dotsEl = document.createElement('div');
        dotsEl.className = 'asm-cal-dots';

        const maxDots = Math.min(sortedDayEvents.length, 5);

        sortedDayEvents.slice(0, maxDots).forEach((ev) => {
          const dot = document.createElement('span');
          const pastEv = ev.date < todayStr;

          dot.className = `asm-dot ${pastEv || ev.isClosed ? 'asm-dot-gray' : 'asm-dot-' + ev.category}`;

          dotsEl.appendChild(dot);
        });

        cell.appendChild(dotsEl);
      }

      cell.addEventListener('click', () => {
        if (!hasEvents) return;

        if (selectedDate === dateStr) {
          selectedDate = null;
          cell.classList.remove('asm-cal-selected');
          showPlaceholder();
          return;
        }

        selectDate(dateStr);
      });

      grid.appendChild(cell);
    });

    const calSection = document.createElement('div');
    calSection.className = 'asm-cal-section';
    calSection.appendChild(wdRow);
    calSection.appendChild(grid);

    const searchRow = createSearchRow(
      searchDraft,
      onSearchChange || (() => {}),
      onSearchSubmit || (() => {}),
      onSearchReset || (() => {})
    );

    const calArea = document.createElement('div');
    calArea.className = 'asm-cal-area';
    calArea.appendChild(searchRow);
    calArea.appendChild(calSection);

    const calendarNotice = document.createElement('div');
    calendarNotice.className = 'asm-calendar-notice';

    const calendarNoticeTitle = document.createElement('div');
    calendarNoticeTitle.className = 'asm-calendar-notice-title';
    calendarNoticeTitle.textContent = '내가 신청한 멘토링 내역이 반영되지 않았다면?';

    const calendarNoticeBody = document.createElement('div');
    calendarNoticeBody.className = 'asm-calendar-notice-body';
    calendarNoticeBody.textContent = '접수 내역 페이지에 한 번 들렀다 오면 자동으로 반영됩니다.';

    calendarNotice.appendChild(calendarNoticeTitle);
    calendarNotice.appendChild(calendarNoticeBody);
    calArea.appendChild(calendarNotice);

    body.appendChild(calArea);
    body.appendChild(eventPanel);
    panel.appendChild(body);

    setTimeout(() => {
      selectDate(defaultSelectedDate);
    }, 0);

    return {
      panel,
      grid,
      eventPanel,
      byDate,
      selectedDate: () => selectedDate,
    };
  }

  // ── 초기화 ────────────────────────────────────────────────────────────────

  async function init(): Promise<void> {
    const calWrapEl = document.querySelector('.mypageCalendar.wrap');
    if (!calWrapEl) return;
    const calWrap: Element = calWrapEl;

    let currentOffset = 0;
    let allEvents: EventRecord[] = [];
    let personalSchedules: PersonalSchedule[] = [];
    let mentoringSchedules: MentoringSchedule[] = [];

    let appliedSearchType: 'title' | 'author' = 'title';
    let appliedSearchKeyword = '';

    let draftSearchType: 'title' | 'author' = 'title';
    let draftSearchKeyword = '';

    let isPanelCollapsed = false;
    let isRefreshing = false;

    function getFilteredEvents(): EventRecord[] {
      const { start, end } = getMonthRange(currentOffset);
      const s = toDateStr(start);
      const e = toDateStr(end);

      const monthEvents = allEvents.map((ev) => ({ ...ev })).filter((ev) => ev.date >= s && ev.date <= e);

      return filterEventsBySearch(monthEvents, appliedSearchType, appliedSearchKeyword);
    }

    function withLocations(events: EventRecord[]): EventRecord[] {
      const cache = locCacheMemory;

      return events.map((ev) => {
        const withConflict = hasPersonalScheduleConflict(ev, personalSchedules);
        const withMentoringConflict = hasMentoringScheduleConflict(ev, mentoringSchedules);
        const isEnrolled = ev.sn ? mentoringSchedules.some((ms) => ms.qustnrSn === ev.sn) : false;

        if (ev.sn && cache.has(ev.sn)) {
          return {
            ...ev,
            location: cache.get(ev.sn) || null,
            hasPersonalConflict: withConflict,
            hasMentoringConflict: withMentoringConflict,
            isEnrolled,
          };
        }

        return {
          ...ev,
          hasPersonalConflict: withConflict,
          hasMentoringConflict: withMentoringConflict,
          isEnrolled,
        };
      });
    }

    function renderPanel(events: EventRecord[], loading: boolean, focusSearch = false): void {
      const existing = document.getElementById('asm-2week-panel');

      const searchDraft: SearchDraft = {
        type: draftSearchType,
        keyword: draftSearchKeyword,
      };

      const { panel } = buildPanel(
        events,
        loading,
        currentOffset,
        navigate,
        searchDraft,
        handleSearchDraftChange,
        handleSearchSubmit,
        handleSearchReset,
        isPanelCollapsed,
        handleToggleCollapsed,
        handleRefresh,
        isRefreshing
      );

      if (existing && existing.parentNode) {
        existing.parentNode.replaceChild(panel, existing);
      } else {
        const tabs = document.querySelector('.tabs-st1');
        if (tabs && tabs.parentNode) {
          tabs.parentNode.insertBefore(panel, tabs.nextSibling);
        } else if (calWrap.parentNode) {
          calWrap.parentNode.insertBefore(panel, calWrap);
        }
      }

      if (focusSearch) {
        const input = panel.querySelector<HTMLInputElement>('.asm-search-input');
        if (input) {
          input.focus();
          const len = input.value.length;
          input.setSelectionRange(len, len);
        }
      }
    }

    function handleSearchDraftChange(nextType: 'title' | 'author', nextKeyword: string): void {
      draftSearchType = nextType;
      draftSearchKeyword = nextKeyword;
    }

    function handleSearchSubmit(nextType: 'title' | 'author', nextKeyword: string): void {
      draftSearchType = nextType;
      draftSearchKeyword = nextKeyword;
      appliedSearchType = nextType;
      appliedSearchKeyword = nextKeyword;

      renderPanel(withLocations(getFilteredEvents()), false, true);
    }

    function handleSearchReset(): void {
      draftSearchType = 'title';
      draftSearchKeyword = '';
      appliedSearchType = 'title';
      appliedSearchKeyword = '';

      renderPanel(withLocations(getFilteredEvents()), false, true);
    }

    function handleToggleCollapsed(): void {
      isPanelCollapsed = !isPanelCollapsed;
      renderPanel(withLocations(getFilteredEvents()), false);
    }

    async function handleRefresh(): Promise<void> {
      if (isRefreshing) return;
      isRefreshing = true;
      renderPanel(withLocations(getFilteredEvents()), true);

      try {
        await removeCacheEntries([STABLE_CACHE_KEY, COUNT_CACHE_KEY, LOC_CACHE_KEY]);
        locCacheMemory = new Map();
        await removeChromeStorage(['soma_mentoring_schedules', 'soma_mentoring_schedules_ts']);

        [personalSchedules, mentoringSchedules] = await Promise.all([
          loadPersonalSchedules(),
          loadMentoringSchedules(),
        ]);

        const completeMap = await buildCompleteEventMap();
        allEvents = collectEvents(completeMap);
        renderPanel(withLocations(getFilteredEvents()), true);

        await fetchLocations(getFilteredEvents());
      } finally {
        isRefreshing = false;
        renderPanel(withLocations(getFilteredEvents()), false);
      }
    }

    async function navigate(newOffset: number): Promise<void> {
      currentOffset = newOffset;

      renderPanel(withLocations(getFilteredEvents()), false);

      await fetchLocations(getFilteredEvents());

      renderPanel(withLocations(getFilteredEvents()), false);
    }

    const [, stableCache, countCache] = await Promise.all([loadLocCache(), loadStableCache(), loadCountCache()]);

    [personalSchedules, mentoringSchedules] = await Promise.all([
      loadPersonalSchedules(),
      loadMentoringSchedules(),
    ]);
    const initialMap = parseTableRows(document);
    allEvents = collectEvents(initialMap);
    renderPanel(withLocations(getFilteredEvents()), !(stableCache && countCache));

    const completeMap = await buildCompleteEventMap();
    allEvents = collectEvents(completeMap);
    renderPanel(withLocations(getFilteredEvents()), true);

    await fetchLocations(getFilteredEvents());
    renderPanel(withLocations(getFilteredEvents()), false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
