import { readChromeStorage, writeChromeStorage } from './storage';

export interface MentoringSchedule {
  qustnrSn: string;
  title: string;
  dateStr: string;
  startTime: string;
  endTime: string;
}

const MENTORING_CACHE_TTL = 5 * 60 * 1000;

interface StoredMentoring {
  soma_mentoring_schedules?: MentoringSchedule[];
  soma_mentoring_schedules_ts?: number;
}

export async function loadStoredMentoringSchedules(): Promise<MentoringSchedule[]> {
  const res = (await readChromeStorage([
    'soma_mentoring_schedules',
    'soma_mentoring_schedules_ts',
  ])) as StoredMentoring;
  return Array.isArray(res.soma_mentoring_schedules) ? res.soma_mentoring_schedules : [];
}

export async function saveMentoringSchedules(schedules: MentoringSchedule[]): Promise<void> {
  await writeChromeStorage({
    soma_mentoring_schedules: schedules,
    soma_mentoring_schedules_ts: Date.now(),
  });
}

export async function fetchMentoringSchedulesFromHistory(): Promise<MentoringSchedule[]> {
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
        await saveMentoringSchedules(schedules);
        return schedules;
      }
    } catch (_) {
      /* try next URL */
    }
  }

  return [];
}

export async function loadMentoringSchedules(): Promise<MentoringSchedule[]> {
  const res = (await readChromeStorage([
    'soma_mentoring_schedules',
    'soma_mentoring_schedules_ts',
  ])) as StoredMentoring;

  const ts = res.soma_mentoring_schedules_ts || 0;
  const cached = res.soma_mentoring_schedules;

  if (Array.isArray(cached) && cached.length > 0 && Date.now() - ts < MENTORING_CACHE_TTL) {
    return cached;
  }

  return fetchMentoringSchedulesFromHistory();
}
