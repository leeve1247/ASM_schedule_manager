// Parse SOMA userAnswer history list, fetch additional pages, merge details.

import { isLectureEnded } from '../lib/date-time';
import { getCancelPolicyReason } from '../lib/location';
import { isLectureCancelable } from './cancel';
import {
  fetchLectureDetails,
  formatApprovalStatus,
  formatDeadlineStatus,
  formatPeopleSummary,
} from './lecture-detail';
import type { Lecture, LectureDetails, RawLectureRow } from './types';

const LOADING_DETAILS: LectureDetails = {
  mentorName: '로딩 중...',
  location: '로딩 중...',
  people: '로딩 중...',
  approvalStatus: '로딩 중...',
  deadlineStatus: '로딩 중...',
};

export function extractRawRowsFromDoc(doc: Document, isCurrentPage: boolean): RawLectureRow[] {
  const rows = doc.querySelectorAll('.boardlist table tbody tr');
  const rawList: RawLectureRow[] = [];

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 8) continue;

    const no = (cells[0].textContent || '').trim();
    const type = (cells[1].textContent || '').trim();

    const titleLink = cells[2].querySelector<HTMLAnchorElement>('a');
    const title = titleLink ? (titleLink.textContent || '').trim() : (cells[2].textContent || '').trim();
    const url = titleLink ? titleLink.getAttribute('href') || '' : '';

    let qustnrSn = '';
    if (url) {
      const match = url.match(/[?&]qustnrSn=(\d+)/);
      if (match) qustnrSn = match[1];
    }

    const author = (cells[3].textContent || '').trim();
    const dateTimeText = cells[4].innerHTML
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const dateMatch = dateTimeText.match(/(\d{4})-(\d{2})-(\d{2})/);
    const dateStr = dateMatch ? dateMatch[0] : '';

    const registerDate = (cells[5].textContent || '').trim().replace(/\s+/g, ' ');
    const status = (cells[6].textContent || '').trim();
    const approval = (cells[7].textContent || '').trim();

    // Cancel button only exists in live DOM of the current page
    const hasCancelButton = isCurrentPage ? !!row.querySelector('[onclick*="delDate"]') : false;

    // Mentor-deleted lectures show plain "삭제" text in a trailing action cell
    // (no button/anchor) — distinct from the user's own delDate cancel button.
    let mentorDeleted = false;
    for (let i = 8; i < cells.length; i++) {
      const cellText = (cells[i].textContent || '').replace(/\s+/g, ' ').trim();
      const hasInteractive = cells[i].querySelector('button, a, [onclick]');
      if (!hasInteractive && /^삭제/.test(cellText)) {
        mentorDeleted = true;
        break;
      }
    }

    rawList.push({
      no,
      type,
      title,
      url,
      qustnrSn,
      author,
      dateTimeText,
      dateStr,
      registerDate,
      status,
      approval,
      hasCancelButton,
      mentorDeleted,
    });
  }

  return rawList;
}

export function collectPageIndexes(doc: Document): Set<number> {
  const indexes = new Set<number>();

  const pagingEl = doc.querySelector('.paging, .pagination, [class*="paging"]');
  if (!pagingEl) return indexes;

  pagingEl.querySelectorAll('a').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const onclick = link.getAttribute('onclick') || '';

    const fromHref = href.match(/pageIndex=(\d+)/);
    if (fromHref) indexes.add(parseInt(fromHref[1], 10));

    // fn_link_page(N) or similar JS pagination
    const fromOnclick = onclick.match(/\((\d+)\)/);
    if (fromOnclick) indexes.add(parseInt(fromOnclick[1], 10));
  });

  return indexes;
}

async function fetchAllRawRows(): Promise<RawLectureRow[]> {
  const rawList = extractRawRowsFromDoc(document, true);

  const currentUrl = new URL(window.location.href);
  const seenIndexes = new Set<number>([
    parseInt(currentUrl.searchParams.get('pageIndex') || '1', 10),
  ]);
  const pendingIndexes = new Set<number>(collectPageIndexes(document));

  for (const idx of pendingIndexes) {
    if (seenIndexes.has(idx)) continue;
    seenIndexes.add(idx);

    const pageUrl = new URL(currentUrl.href);
    pageUrl.searchParams.set('pageIndex', String(idx));

    try {
      const resp = await fetch(pageUrl.toString(), { credentials: 'include' });
      if (!resp.ok) continue;
      const html = await resp.text();
      const pageDoc = new DOMParser().parseFromString(html, 'text/html');

      rawList.push(...extractRawRowsFromDoc(pageDoc, false));

      // Discover additional page links from fetched page (handles non-sequential pagers)
      for (const newIdx of collectPageIndexes(pageDoc)) {
        if (!seenIndexes.has(newIdx)) pendingIndexes.add(newIdx);
      }
    } catch (e) {
      console.error(`Failed to fetch page ${idx}:`, e);
    }
  }

  // Deduplicate by qustnrSn — same lecture can appear across multiple pages
  const seenQustnrSn = new Set<string>();
  return rawList.filter((raw) => {
    if (!raw.qustnrSn) return true;
    if (seenQustnrSn.has(raw.qustnrSn)) return false;
    seenQustnrSn.add(raw.qustnrSn);
    return true;
  });
}

export async function parseLecturesTable(): Promise<Lecture[]> {
  const allRaw = await fetchAllRawRows();

  // Filter out cancelled registrations ("취소불가" = still active, must keep)
  // and lectures the mentor has deleted (no longer in catalog).
  const rawList = allRaw.filter((raw) => {
    if (raw.mentorDeleted) return false;
    const combined = `${raw.status} ${raw.approval}`;
    return !/취소/.test(combined) || /취소불가/.test(combined);
  });

  const lectures: Lecture[] = [];

  for (const raw of rawList) {
    let details: LectureDetails = { ...LOADING_DETAILS };
    if (raw.qustnrSn && raw.url) {
      details = await fetchLectureDetails(raw.qustnrSn, raw.url, raw.dateTimeText);
    }

    // 상세 페이지의 강의날짜(시간 포함)를 우선 사용, 없으면 리스트 페이지 값 fallback
    const resolvedDateTimeText = details.lectureDateTimeText || raw.dateTimeText;
    const ended = isLectureEnded(resolvedDateTimeText);

    lectures.push({
      ...raw,
      dateTimeText: resolvedDateTimeText,
      mentorName: details.mentorName === '정보 없음' ? raw.author : details.mentorName,
      location: details.location,
      people: formatPeopleSummary(details.people),
      approvalStatus: formatApprovalStatus(
        details.approvalStatus === '정보 없음' ? raw.approval : details.approvalStatus
      ),
      deadlineStatus: formatDeadlineStatus(details.deadlineStatus, `${raw.status} ${raw.approval}`, ended),
      cancelAllowed: raw.hasCancelButton && !ended && isLectureCancelable(resolvedDateTimeText, details.location),
      cancelPolicyReason: getCancelPolicyReason(details.location),
    });
  }

  return lectures;
}
