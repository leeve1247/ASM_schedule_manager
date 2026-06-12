// Detail-page conflict checker: scans for date-time, compares against personal
// and mentoring schedules, and injects warning banners / blocks apply buttons.

import { getLectureDateBounds, parseLectureDateTimeText } from '@shared/date/date-time';
import {
  FIXED_SHARED_SCHEDULES,
  loadPersonalSchedules,
  type PersonalSchedule,
} from '@features/schedules/personal-schedule';
import {
  loadStoredMentoringSchedules,
  type MentoringSchedule,
} from '@features/schedules/mentoring-schedule';
import {
  findConflictingMentoringSchedules,
  findConflictingPersonalSchedule,
} from '@features/schedules/conflict';
import { mountReact, type MountHandle } from '@shared/dom/react-mount';
import { ConflictBanner, conflictBannerCss, type ConflictBannerVariant } from './ConflictBanner';

let personalBannerHandle: MountHandle | null = null;
let mentoringBannerHandle: MountHandle | null = null;
let mentoringBannerVariant: ConflictBannerVariant | null = null;

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

const TITLE_LABEL_RE = /(모집명|과정명|강의명|강좌명|교육명|프로그램명|강의제목|제목)/;

export function findLectureTitleOnDetailPage(): string | null {
  const tryLabeled = (labelEl: Element | null, valueEl: Element | null): string | null => {
    if (!labelEl || !valueEl) return null;
    if (!TITLE_LABEL_RE.test((labelEl.textContent || '').replace(/\s+/g, ''))) return null;
    const val = (valueEl.textContent || '').trim().replace(/\s+/g, ' ');
    return val || null;
  };

  for (const group of document.querySelectorAll('div.group')) {
    const val = tryLabeled(group.querySelector('strong.t'), group.querySelector('div.c'));
    if (val) return val;
  }
  for (const th of document.querySelectorAll('th')) {
    const val = tryLabeled(th, th.nextElementSibling);
    if (val) return val;
  }
  for (const dt of document.querySelectorAll('dt')) {
    const val = tryLabeled(dt, dt.nextElementSibling);
    if (val) return val;
  }

  const headingEl = document.querySelector(
    '.eventTit, .view_top .tit, .board_view .tit, .bbsView .tit, .view_tit, h3.tit, h2.tit'
  );
  const headingText = (headingEl?.textContent || '').trim().replace(/\s+/g, ' ');
  return headingText || null;
}

// 두 출처(상세 페이지 제목 vs 신청내역 테이블 제목)의 표기 차이를 흡수한다.
// 멘토특강/자유멘토링 같은 앞쪽 [태그]·(태그)·【태그】는 제거 후 공백을 정규화한다.
export function normalizeLectureTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.replace(/\s+/g, ' ').trim();
  let prev = '';
  while (s !== prev) {
    prev = s;
    s = s.replace(/^[[(【（［][^\])】）］]*[\])】）］]\s*/, '').trim();
  }
  return s;
}

function removeConflictBanners(): void {
  // 개인 일정 배너만 정리한다. 멘토링 배너(차단/재신청 안내)는
  // checkLectureConflict 의 멘토링 섹션이 매 실행마다 단독으로 관리한다.
  personalBannerHandle?.unmount();
  personalBannerHandle = null;
  document.getElementById('soma-conflict-debug-banner')?.remove();
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

function findApplyButtonWrapper(): Element | null {
  const wrappers = Array.from(document.querySelectorAll('.btn_w-st1.mt50'));
  if (wrappers.length === 0) return null;

  const applyTargets = findApplicationTargets();
  const wrapperWithApplyTarget = wrappers.find((wrapper) =>
    applyTargets.some((target) => wrapper.contains(target))
  );
  if (wrapperWithApplyTarget) return wrapperWithApplyTarget;

  const wrapperWithApplyText = wrappers.find((wrapper) => /(신청|접수)/.test(wrapper.textContent || ''));
  return wrapperWithApplyText || wrappers[wrappers.length - 1] || null;
}

function getPersonalScheduleManageUrl(): string {
  const path = window.location.pathname;
  const basePath = path.includes('/busan/sw/') ? '/busan/sw' : '/sw';
  return `${window.location.origin}${basePath}/mypage/userAnswer/history.do?menuNo=200047`;
}

function isApplicationTrigger(el: Element | null): boolean {
  if (!el || el.closest('.asm-conflict-banner-host')) {
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

interface ConflictBannerMountProps {
  variant: ConflictBannerVariant;
  detailText: string;
  conflictTitle: string;
  conflictStart: string;
  conflictEnd: string;
  manageUrl?: string;
}

// 신청하기 버튼 바로 위(버튼을 못 찾으면 페이지 상단)에 ConflictBanner 를 마운트한다.
function mountConflictBanner(props: ConflictBannerMountProps): MountHandle | null {
  const applyButtonWrapper = findApplyButtonWrapper();
  const anchor = applyButtonWrapper?.parentElement || findConflictBannerAnchor();
  if (!anchor) return null;

  const mentoringTime = props.detailText.replace(/^멘토링 시간:\s*/, '') || '확인 불가';

  return mountReact(
    anchor,
    (
      <ConflictBanner
        variant={props.variant}
        mentoringTime={mentoringTime}
        conflictTitle={props.conflictTitle}
        conflictStart={props.conflictStart}
        conflictEnd={props.conflictEnd}
        manageUrl={props.manageUrl}
      />
    ),
    {
      styles: [conflictBannerCss],
      hostClass: 'asm-conflict-banner-host',
      insertBefore: applyButtonWrapper || undefined,
      insertAt: applyButtonWrapper ? 'end' : 'start',
    },
  );
}

function injectWarningBanner(schedule: PersonalSchedule, detailText = ''): void {
  personalBannerHandle?.unmount();
  personalBannerHandle = mountConflictBanner({
    variant: 'personal',
    detailText,
    conflictTitle: schedule.title,
    conflictStart: schedule.startTime,
    conflictEnd: schedule.endTime,
    manageUrl: getPersonalScheduleManageUrl(),
  });
}

function injectMentoringConflictBanner(
  conflictingLecture: MentoringSchedule,
  detailText = '',
  variant: ConflictBannerVariant = 'mentoring'
): void {
  // 같은 배너가 이미 떠 있으면 MutationObserver 재실행마다 깜빡이지 않도록 건너뛴다.
  if (mentoringBannerHandle && mentoringBannerVariant === variant) return;

  mentoringBannerHandle?.unmount();
  mentoringBannerVariant = null;

  mentoringBannerHandle = mountConflictBanner({
    variant,
    detailText,
    conflictTitle: conflictingLecture.title,
    conflictStart: conflictingLecture.startTime,
    conflictEnd: conflictingLecture.endTime,
  });
  if (mentoringBannerHandle) mentoringBannerVariant = variant;
}

// 차단된 버튼은 원본을 잃지 않도록 (clone, original) 쌍으로 보관한다.
// 제목 로딩 타이밍 등으로 한 번 차단된 뒤 "같은 강의 재신청"으로 판정이 바뀌면
// unblockApplicationButtons 로 원래 버튼을 되돌려 신청이 막히지 않게 한다.
let blockedButtons: { clone: HTMLElement; original: HTMLElement }[] = [];

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
    blockedButtons.push({ clone, original: htmlEl });
  });
}

function unblockApplicationButtons(): void {
  if (blockedButtons.length === 0) return;
  blockedButtons.forEach(({ clone, original }) => {
    clone.parentNode?.replaceChild(original, clone);
  });
  blockedButtons = [];
}

async function checkLectureConflict(): Promise<void> {
  const dateTimeText = findLectureDateTimeOnDetailPage();
  if (!dateTimeText) return;

  const lectureRange = getLectureDateBounds(dateTimeText);
  if (!lectureRange) return;

  const detailText = `멘토링 시간: ${dateTimeText}`;

  const personalSchedules = await loadPersonalSchedules();
  const mergedSchedules: PersonalSchedule[] = [...FIXED_SHARED_SCHEDULES, ...personalSchedules];

  const conflictingSchedule = findConflictingPersonalSchedule(lectureRange, mergedSchedules);

  if (conflictingSchedule) {
    console.warn(
      `SOMA Schedule Manager: Overlap detected with personal schedule "${conflictingSchedule.title}"`
    );
    injectWarningBanner(conflictingSchedule, detailText);
  } else {
    removeConflictBanners();
  }

  // 접수된 멘토링 일정과의 충돌 체크 → 신청 차단
  // 단, 멘토특강 → 자유멘토링 전환처럼 "같은 이름의 강의가 새 qustnrSn 으로 재개설"된
  // 경우는 자기 자신의 재신청이므로 차단하지 않고 안내 배너만 표시한다.
  const currentSomaLectureId = new URL(window.location.href).searchParams.get('qustnrSn') || '';
  const mentoringSchedules = await loadStoredMentoringSchedules();
  const conflictingMentorings = findConflictingMentoringSchedules(
    lectureRange,
    mentoringSchedules,
    currentSomaLectureId || undefined
  );

  const currentTitle = normalizeLectureTitle(findLectureTitleOnDetailPage());
  // 제목을 못 읽으면(빈 문자열) 안전하게 기존 동작(차단)을 유지한다.
  const blockingConflict = conflictingMentorings.find(
    (ms) => !currentTitle || normalizeLectureTitle(ms.title) !== currentTitle
  );
  const reofferConflict = currentTitle
    ? conflictingMentorings.find((ms) => normalizeLectureTitle(ms.title) === currentTitle)
    : undefined;

  if (blockingConflict) {
    console.warn(`SOMA Schedule Manager: Mentoring overlap detected with "${blockingConflict.title}"`);
    blockApplicationButtons(
      `이미 접수한 멘토링 "${blockingConflict.title}"와 시간이 중복되어 신청할 수 없습니다.`
    );
    injectMentoringConflictBanner(blockingConflict, detailText, 'mentoring');
  } else if (reofferConflict) {
    unblockApplicationButtons();
    injectMentoringConflictBanner(reofferConflict, detailText, 'reoffer');
  } else {
    unblockApplicationButtons();
    if (mentoringBannerHandle) {
      mentoringBannerHandle.unmount();
      mentoringBannerHandle = null;
      mentoringBannerVariant = null;
    }
  }
}

export async function checkLectureConflictWithRetry(): Promise<void> {
  let retries = 10;
  while (retries > 0) {
    const dateTimeText = findLectureDateTimeOnDetailPage();
    const applyBtn = findApplicationTargets()[0];

    if (dateTimeText && applyBtn) {
      await checkLectureConflict();
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
    retries--;
  }

  // Fallback trigger
  await checkLectureConflict();
}
