// Detail-page conflict checker: scans for date-time, compares against personal
// and mentoring schedules, and injects warning banners / blocks apply buttons.

import { parseLectureDateTimeText } from '../lib/date-time';
import { escapeHtml } from '../lib/escape';
import {
  FIXED_SHARED_SCHEDULES,
  loadPersonalSchedules,
  type PersonalSchedule,
} from '../lib/personal-schedule';
import {
  loadStoredMentoringSchedules,
  type MentoringSchedule,
} from '../lib/mentoring-schedule';
import {
  findConflictingMentoringSchedule,
  findConflictingPersonalSchedule,
  type DateRange,
} from '../lib/conflict';

export function findLectureDateTimeOnDetailPage(): string | null {
  const eventDateEl = document.querySelector('.eventDt');
  if (eventDateEl) {
    const group = eventDateEl.closest('.group');
    const valueEl = group?.querySelector('.c');
    const valueText = valueEl?.textContent?.trim().replace(/\s+/g, ' ') || '';
    const match = parseLectureDateTimeText(valueText);
    if (match) {
      const { y, m, d, sh, sm, eh, em } = match;
      return `${y}-${m}-${d} ${sh}:${sm} ~ ${eh}:${em}`;
    }
  }

  const groups = document.querySelectorAll('div.group');
  for (const group of groups) {
    const labelEl = group.querySelector('strong.t');
    const valueEl = group.querySelector('div.c');
    if (!labelEl || !valueEl) continue;

    const headerText = (labelEl.textContent || '').trim();
    const valueText = (valueEl.textContent || '').trim().replace(/\s+/g, ' ');

    if (headerText.includes('강의날짜') || headerText.includes('강의일시') || headerText.includes('교육일시')) {
      const match = parseLectureDateTimeText(valueText);
      if (match) {
        const { y, m, d, sh, sm, eh, em } = match;
        return `${y}-${m}-${d} ${sh}:${sm} ~ ${eh}:${em}`;
      }
    }
  }

  const ths = document.querySelectorAll('th');
  let dateStr = '';
  let timeStr = '';

  // Attempt 1: Search table rows with header labels
  for (const th of ths) {
    const headerText = (th.textContent || '').trim();
    const normalizedHeader = headerText.replace(/\s+/g, '');
    const td = th.nextElementSibling;
    if (!td) continue;
    const valueText = (td.textContent || '').trim().replace(/\s+/g, ' ');

    // 강의날짜 헤더를 최우선 처리 — 접수기간보다 먼저 반환
    if (normalizedHeader.includes('강의날짜') || headerText.includes('강의일시') || headerText.includes('교육일시')) {
      const match = parseLectureDateTimeText(valueText);
      if (match) {
        const { y, m, d, sh, sm, eh, em } = match;
        return `${y}-${m}-${d} ${sh}:${sm} ~ ${eh}:${em}`;
      }
    }

    if (headerText.includes('일시') || headerText.includes('강의일시') || headerText.includes('교육일시')) {
      const match = valueText.match(/(\d{4})[-./](\d{2})[-./](\d{2})(?:\([^)]+\))?\s*(\d{2}):(\d{2})/);
      if (match) return valueText;
    }

    if (
      headerText.includes('일자') ||
      headerText.includes('날짜') ||
      headerText.includes('교육일') ||
      headerText.includes('강의일')
    ) {
      const dateMatch = valueText.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
      if (dateMatch) {
        dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }
    }

    if (headerText.includes('시간') || headerText.includes('교육시간') || headerText.includes('강의시간')) {
      const timeMatch = valueText.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/);
      if (timeMatch) {
        timeStr = timeMatch[0];
      }
    }
  }

  if (dateStr && timeStr) {
    return `${dateStr} ${timeStr}`;
  }

  // Attempt 2: Fallback to searching all text nodes
  const leafElements = document.querySelectorAll('td, span, div, p');
  for (const el of leafElements) {
    if (el.children.length > 0) continue;
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    const match = text.match(/(\d{4})[-./](\d{2})[-./](\d{2})(?:\([^)]+\))?\s*(\d{2}):(\d{2})/);
    if (match) {
      return text;
    }
  }

  // Attempt 3: General search in body text
  const bodyText = document.body.innerText.replace(/\s+/g, ' ');
  const dateMatchBody = bodyText.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
  const timeMatchBody = bodyText.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/);
  if (dateMatchBody && timeMatchBody) {
    return `${dateMatchBody[1]}-${dateMatchBody[2]}-${dateMatchBody[3]} ${timeMatchBody[0]}`;
  }

  return null;
}

function removeConflictBanners(): void {
  document.getElementById('soma-conflict-banner')?.remove();
  document.getElementById('soma-conflict-debug-banner')?.remove();
  document.getElementById('soma-mentoring-conflict-banner')?.remove();
}

function findConflictBannerAnchor(): Element | null {
  return (
    document.querySelector('#contentsList .mypage_renew.mypage_main > .inner') ||
    document.querySelector('#contentsList .inner') ||
    document.getElementById('contentsList') ||
    document.getElementById('pageStart') ||
    null
  );
}

function getPersonalScheduleManageUrl(): string {
  const path = window.location.pathname;
  const basePath = path.includes('/busan/sw/') ? '/busan/sw' : '/sw';
  return `${window.location.origin}${basePath}/mypage/userAnswer/history.do?menuNo=200047`;
}

function isApplicationTrigger(el: Element | null): boolean {
  if (!el || el.id === 'soma-conflict-banner' || el.closest('#soma-conflict-banner')) {
    return false;
  }

  const text = (el.textContent || (el as HTMLInputElement).value || '').trim();
  const onclickAttr = el.getAttribute('onclick') || '';
  const hrefAttr = el.getAttribute('href') || '';
  const classText = typeof el.className === 'string' ? el.className : '';

  return (
    /(신청|접수)/.test(text) ||
    /checkApply|checkMento|apply|lectureApply|userAnswer/i.test(onclickAttr) ||
    /apply|lectureApply|userAnswer/i.test(hrefAttr) ||
    /(apply|receipt|request|submit)/i.test(classText)
  );
}

function findApplicationTargets(): Element[] {
  const explicitTargets = [document.getElementById('applyLec'), document.getElementById('applyBtn')].filter(
    (el): el is HTMLElement => el !== null
  );

  if (explicitTargets.length > 0) {
    return explicitTargets.filter(isApplicationTrigger);
  }

  const applyElements = Array.from(
    document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a, [role="button"]')
  );

  return applyElements.filter(isApplicationTrigger);
}

function injectWarningBanner(schedule: PersonalSchedule, detailText = ''): void {
  document.getElementById('soma-conflict-banner')?.remove();

  const mentoringTime = detailText.replace(/^멘토링 시간:\s*/, '') || '확인 불가';
  const manageUrl = getPersonalScheduleManageUrl();

  const banner = document.createElement('div');
  banner.id = 'soma-conflict-banner';
  banner.innerHTML = `
    <div class="conflict-icon">⚠️</div>
    <div class="conflict-content">
      <div class="conflict-title">개인 일정과 중복되는 멘토링입니다</div>
      <div class="conflict-desc">
        현재 선택하신 멘토링 시간대에 겹치는 개인 일정이 등록되어 있습니다. 신청은 가능하지만 일정이 중복될 수 있으니 확인 후 신청해 주세요.
      </div>

      <div class="conflict-timeline">
        <div class="timeline-rows">
          <div class="timeline-row">
            <span class="timeline-label label-mentoring">아래 멘토링 시간</span>
            <span class="timeline-value">${escapeHtml(mentoringTime)}</span>
          </div>
          <div class="timeline-row">
            <span class="timeline-label label-personal">개인 일정</span>
            <span class="timeline-value">
              <strong class="personal-title">"${escapeHtml(schedule.title)}"</strong>
              <span class="personal-time">(${escapeHtml(schedule.startTime)} ~ ${escapeHtml(schedule.endTime)})</span>
            </span>
          </div>
        </div>
        <div class="timeline-action">
          <a class="conflict-link-btn" href="${escapeHtml(manageUrl)}">개인 일정 수정하기</a>
        </div>
      </div>
    </div>
  `;

  const anchor = findConflictBannerAnchor();
  if (!anchor) return;

  if (anchor.firstChild) {
    anchor.insertBefore(banner, anchor.firstChild);
  } else {
    anchor.appendChild(banner);
  }
}

function injectMentoringConflictBanner(conflictingLecture: MentoringSchedule, detailText = ''): void {
  document.getElementById('soma-mentoring-conflict-banner')?.remove();

  const mentoringTime = detailText.replace(/^멘토링 시간:\s*/, '') || '확인 불가';

  const banner = document.createElement('div');
  banner.id = 'soma-mentoring-conflict-banner';
  banner.className = 'soma-mentoring-conflict-banner';
  banner.innerHTML = `
    <div class="conflict-icon">⚠️</div>
    <div class="conflict-content">
      <div class="conflict-title">멘토링 일정과 중복되는 멘토링입니다</div>
      <div class="conflict-desc">
        이미 접수한 멘토링 일정과 시간대가 겹쳐 신청이 제한됩니다. 기존 접수를 취소하거나 다른 멘토링을 선택해 주세요.
      </div>
      <div class="conflict-timeline">
        <div class="timeline-rows">
          <div class="timeline-row">
            <span class="timeline-label label-mentoring">아래 멘토링 시간</span>
            <span class="timeline-value">${escapeHtml(mentoringTime)}</span>
          </div>
          <div class="timeline-row">
            <span class="timeline-label label-personal">기존 멘토링 시간</span>
            <span class="timeline-value">
              <strong class="personal-title">"${escapeHtml(conflictingLecture.title)}"</strong>
              <span class="personal-time">(${escapeHtml(conflictingLecture.startTime)} ~ ${escapeHtml(conflictingLecture.endTime)})</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  `;

  const anchor = findConflictBannerAnchor();
  if (!anchor) return;

  if (anchor.firstChild) {
    anchor.insertBefore(banner, anchor.firstChild);
  } else {
    anchor.appendChild(banner);
  }
}

function blockApplicationButtons(alertMsg: string): void {
  const targetElements = findApplicationTargets();
  targetElements.forEach((el) => {
    if (!el.parentNode) return;
    const htmlEl = el as HTMLElement;
    if (htmlEl.dataset.somaConflictBlocked === 'true') return;

    const clone = el.cloneNode(true) as HTMLElement;
    clone.dataset.somaConflictBlocked = 'true';

    if (clone.tagName === 'INPUT' || clone.tagName === 'BUTTON') {
      (clone as HTMLInputElement).disabled = true;
    }

    clone.classList.add('soma-conflict-disabled');
    clone.style.opacity = '0.5';
    clone.style.cursor = 'not-allowed';
    clone.removeAttribute('onclick');
    clone.removeAttribute('href');

    clone.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        alert(alertMsg);
      },
      true
    );

    el.parentNode.replaceChild(clone, el);
  });
}

async function checkLectureConflict(): Promise<void> {
  console.log('SOMA Schedule Manager: Starting conflict check...');
  const dateTimeText = findLectureDateTimeOnDetailPage();
  console.log('SOMA Schedule Manager: findLectureDateTimeOnDetailPage returned:', dateTimeText);
  if (!dateTimeText) {
    console.log('SOMA Schedule Manager: No lecture date-time string found on detail page.');
    return;
  }

  const parsed = parseLectureDateTimeText(dateTimeText);
  console.log('SOMA Schedule Manager: Regex match result:', parsed);
  if (!parsed) return;

  const { y, m, d, sh, sm, eh, em } = parsed;
  const lectureRange: DateRange = {
    start: new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(sh, 10), parseInt(sm, 10), 0),
    end: new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(eh, 10), parseInt(em, 10), 0),
  };
  console.log('SOMA Schedule Manager: Parsed Lecture bounds:', lectureRange.start, 'to', lectureRange.end);
  const detailText = `멘토링 시간: ${dateTimeText}`;

  const personalSchedules = await loadPersonalSchedules();
  const mergedSchedules: PersonalSchedule[] = [...FIXED_SHARED_SCHEDULES, ...personalSchedules];
  console.log('SOMA Schedule Manager: Loaded personal schedules:', mergedSchedules);

  const conflictingSchedule = findConflictingPersonalSchedule(lectureRange, mergedSchedules);

  if (conflictingSchedule) {
    console.warn(
      `SOMA Schedule Manager: Overlap detected with personal schedule "${conflictingSchedule.title}"`
    );
    injectWarningBanner(conflictingSchedule, detailText);
  } else {
    removeConflictBanners();
    console.log('SOMA Schedule Manager: No scheduling conflict detected.');
  }

  // 접수된 멘토링 일정과의 충돌 체크 → 신청 차단
  const currentQustnrSn = new URL(window.location.href).searchParams.get('qustnrSn') || '';
  const mentoringSchedules = await loadStoredMentoringSchedules();
  const conflictingMentoring = findConflictingMentoringSchedule(
    lectureRange,
    mentoringSchedules,
    currentQustnrSn || undefined
  );

  const existingMentoringBanner = document.getElementById('soma-mentoring-conflict-banner');
  if (conflictingMentoring) {
    console.warn(`SOMA Schedule Manager: Mentoring overlap detected with "${conflictingMentoring.title}"`);
    blockApplicationButtons(
      `⚠️ 이미 접수한 멘토링 "${conflictingMentoring.title}"와 시간이 중복되어 신청할 수 없습니다.`
    );
    if (!existingMentoringBanner) {
      injectMentoringConflictBanner(conflictingMentoring, detailText);
    }
  } else if (existingMentoringBanner) {
    existingMentoringBanner.remove();
  }
}

export async function checkLectureConflictWithRetry(): Promise<void> {
  console.log('SOMA Schedule Manager: Initializing conflict check with retry loop...');
  let retries = 10;
  while (retries > 0) {
    const dateTimeText = findLectureDateTimeOnDetailPage();
    const applyBtn = findApplicationTargets()[0];

    if (dateTimeText && applyBtn) {
      console.log('SOMA Schedule Manager: Target DOM elements resolved.');
      await checkLectureConflict();
      return;
    }

    console.log(`SOMA Schedule Manager: Waiting for page content (retries remaining: ${retries})...`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    retries--;
  }

  // Fallback trigger
  await checkLectureConflict();
}
