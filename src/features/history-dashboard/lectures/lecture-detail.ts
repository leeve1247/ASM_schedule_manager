// Fetch SOMA lecture detail page and extract mentor/location/people/status.

import { readChromeStorage, removeChromeStorage, writeChromeStorage } from '@shared/storage/storage';
import { isLectureEnded } from '@shared/date/date-time';
import type { LectureDetails } from './types';

const CACHE_KEY_PREFIX = 'soma_lecture_detail_';

export async function clearLectureDetailCache(): Promise<void> {
  const all = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(null, (res) => resolve(res || {}));
  });
  const keys = Object.keys(all).filter((k) => k.startsWith(CACHE_KEY_PREFIX));
  if (keys.length === 0) return;
  await removeChromeStorage(keys);
}

// Stable lecture detail fields rarely change; keep a longer cache.
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

interface CachedLectureDetail extends LectureDetails {
  dateTimeText: string;
  timestamp: number;
}

const UNKNOWN = '정보 없음';
const LOADING = '로딩 중...';

const PLACEHOLDER_DETAILS: LectureDetails = {
  mentorName: UNKNOWN,
  location: UNKNOWN,
  people: UNKNOWN,
  approvalStatus: UNKNOWN,
  deadlineStatus: UNKNOWN,
};

export function formatPeopleSummary(peopleText: string | undefined | null): string {
  const normalized = (peopleText || '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === UNKNOWN || normalized === LOADING) return UNKNOWN;

  const slashMatch = normalized.match(/(\d+)\s*\/\s*(\d+)/);
  if (slashMatch) {
    return `${slashMatch[1]} / ${slashMatch[2]}`;
  }

  const numberMatches = normalized.match(/\d+/g);
  if (numberMatches && numberMatches.length >= 2) {
    return `${numberMatches[0]} / ${numberMatches[1]}`;
  }

  return normalized;
}

export function extractApplicantCount(doc: Document): string {
  const summaryText =
    doc.querySelector('.total-normal')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const summaryMatch = summaryText.match(/\[\s*(\d+)\s*명\s*\]/);
  if (summaryMatch) return summaryMatch[1];

  const scriptText = Array.from(doc.scripts).map((s) => s.textContent || '').join('\n');
  const appCountMatch = scriptText.match(/appCnt\s*:\s*"(\d+)"/);
  if (appCountMatch) return appCountMatch[1];

  const activeApplicants = Array.from(doc.querySelectorAll('.boardlist table tbody tr')).filter(
    (row) => !row.querySelector('.color-red') && (row.textContent || '').includes('[신청완료]')
  ).length;

  return activeApplicants > 0 ? String(activeApplicants) : '';
}

export function formatDeadlineStatus(
  rawStatus: string | undefined,
  approval: string | undefined,
  isEnded: boolean
): string {
  if (isEnded) return '마감';

  const normalizedStatus = (rawStatus || '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (normalizedStatus && normalizedStatus !== UNKNOWN && normalizedStatus !== LOADING) {
    if (/접수중|모집중/.test(normalizedStatus)) return '접수중';
    if (/마감|종료|불가|완료/.test(normalizedStatus)) return '마감';
    return normalizedStatus;
  }

  const combined = [rawStatus, approval].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  if (!combined || combined === UNKNOWN || combined === LOADING) {
    return UNKNOWN;
  }

  if (/마감|종료|불가|완료/.test(combined)) return '마감';
  if (/진행|가능|접수중|모집중|승인/.test(combined)) return '진행중';
  return combined;
}

export function formatApprovalStatus(rawApproval: string | undefined): string {
  const normalized = (rawApproval || '').replace(/\s+/g, ' ').trim();
  if (!normalized || normalized === UNKNOWN || normalized === LOADING) {
    return UNKNOWN;
  }

  if (/승인|개설/.test(normalized) && !/미승인|승인대기|대기/.test(normalized)) {
    return '승인';
  }

  if (/대기/.test(normalized)) return '대기';
  if (/미승인|반려|취소/.test(normalized)) return '미승인';
  return normalized;
}

export async function fetchLectureDetails(
  qustnrSn: string,
  url: string,
  dateTimeText: string
): Promise<LectureDetails> {
  if (!url) {
    return { ...PLACEHOLDER_DETAILS };
  }

  const cacheKey = `${CACHE_KEY_PREFIX}${qustnrSn}`;
  const stored = await readChromeStorage([cacheKey]);
  const cached = stored[cacheKey] as CachedLectureDetail | undefined;

  const isPast = isLectureEnded(dateTimeText);
  const now = Date.now();

  const hasDetailCacheShape =
    cached &&
    Object.prototype.hasOwnProperty.call(cached, 'approvalStatus') &&
    Object.prototype.hasOwnProperty.call(cached, 'lectureDateTimeText');

  if (cached && hasDetailCacheShape) {
    if (isPast || (cached.timestamp && now - cached.timestamp < CACHE_TTL_MS)) {
      return {
        mentorName: cached.mentorName || UNKNOWN,
        location: cached.location,
        people: cached.people,
        approvalStatus: cached.approvalStatus || UNKNOWN,
        deadlineStatus: cached.deadlineStatus || UNKNOWN,
        lectureDateTimeText: cached.lectureDateTimeText || '',
      };
    }
  }

  try {
    const absoluteUrl = url.startsWith('http')
      ? url
      : `${window.location.origin}${url.startsWith('/') ? url : '/' + url}`;
    const response = await fetch(absoluteUrl, { credentials: 'include' });
    if (!response.ok) throw new Error('Network error');
    const htmlText = await response.text();
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');

    let mentorName = '';
    let location = '';
    let people = '';
    let approvalStatus = '';
    let deadlineStatus = '';
    let lectureDateTimeText = '';

    const captureDetailField = (label: string, value: string) => {
      const normalizedLabel = label.replace(/\s+/g, '');
      const normalizedValue = value.replace(/\s+/g, ' ').trim();

      if (!mentorName && /작성자|멘토명|멘토/.test(normalizedLabel) && !/멘토링/.test(normalizedLabel)) {
        mentorName = normalizedValue;
        return;
      }

      if (!location && /장소|위치/.test(normalizedLabel)) {
        location = normalizedValue;
        return;
      }

      if (
        !people &&
        /(?:모집|신청)?인원|정원/.test(normalizedLabel) &&
        !/모집명|과정명|강의명|제목/.test(normalizedLabel)
      ) {
        people = normalizedValue;
        return;
      }

      if (!approvalStatus && /개설승인여부|개설승인|승인여부|개설여부/.test(normalizedLabel)) {
        approvalStatus = normalizedValue;
        return;
      }

      if (
        !deadlineStatus &&
        /마감여부|접수상태|신청상태|모집상태|진행상태|상태/.test(normalizedLabel) &&
        !/승인/.test(normalizedLabel)
      ) {
        deadlineStatus = normalizedValue;
        return;
      }

      if (!lectureDateTimeText && /강의날짜|강의일시|진행날짜|진행일시|교육일시/.test(normalizedLabel)) {
        lectureDateTimeText = normalizedValue;
      }
    };

    // Attempt 1: div.group > strong.t + div.c (SOMA mentoring detail page structure)
    doc.querySelectorAll('div.group').forEach((group) => {
      const labelEl = group.querySelector('strong.t');
      const valueEl = group.querySelector('div.c');
      if (!labelEl || !valueEl) return;
      const label = (labelEl.textContent || '').trim();
      const val = (valueEl.textContent || '').trim().replace(/\s+/g, ' ');
      captureDetailField(label, val);
    });

    // Attempt 2: th/td table structure
    if (!mentorName || !location || !people || !approvalStatus || !deadlineStatus) {
      doc.querySelectorAll('th').forEach((th) => {
        const label = (th.textContent || '').trim();
        const td = th.nextElementSibling;
        if (!td) return;
        const val = (td.textContent || '').trim().replace(/\s+/g, ' ');
        captureDetailField(label, val);
      });
    }

    // Attempt 3: dt/dd structure
    if (!mentorName || !location || !people || !approvalStatus || !deadlineStatus) {
      doc.querySelectorAll('dt').forEach((dt) => {
        const label = (dt.textContent || '').trim();
        const dd = dt.nextElementSibling;
        if (!dd) return;
        const val = (dd.textContent || '').trim().replace(/\s+/g, ' ');
        captureDetailField(label, val);
      });
    }

    // Attempt 4: keyword scan in td
    if (!location) {
      const tds = doc.querySelectorAll('td');
      for (const td of tds) {
        const text = td.textContent || '';
        if (
          text.includes('온라인(webex)') ||
          text.includes('회의실') ||
          text.includes('하이스퀘어') ||
          text.includes('하이텐')
        ) {
          location = text.trim().replace(/\s+/g, ' ');
          break;
        }
      }
    }

    const applicantCount = extractApplicantCount(doc);
    if (people && applicantCount) {
      const capacityMatch = people.match(/(\d+)/);
      if (capacityMatch) {
        people = `${applicantCount} / ${capacityMatch[1]}`;
      }
    }

    const finalDetails: LectureDetails = {
      mentorName: mentorName || UNKNOWN,
      location: location || UNKNOWN,
      people: people || UNKNOWN,
      approvalStatus: approvalStatus || UNKNOWN,
      deadlineStatus: deadlineStatus || UNKNOWN,
      lectureDateTimeText,
    };

    const detailsToCache: CachedLectureDetail = {
      ...finalDetails,
      dateTimeText,
      timestamp: Date.now(),
    };

    try {
      await writeChromeStorage({ [cacheKey]: detailsToCache });
    } catch {
      /* ignore cache write failure */
    }

    return finalDetails;
  } catch (e) {
    console.error(`Failed to fetch details for lecture ${qustnrSn}:`, e);
    return { ...PLACEHOLDER_DETAILS };
  }
}
