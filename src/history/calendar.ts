// Two-week dashboard calendar for SOMA userAnswer history page.

import { isLectureEnded, parseLectureDateTimeText } from '../lib/date-time';
import { escapeHtml } from '../lib/escape';
import { getSafeSomaUrl } from '../lib/safe-url';
import {
  FIXED_SHARED_SCHEDULES,
  loadPersonalSchedules,
  savePersonalSchedules,
  type PersonalSchedule,
} from '../lib/personal-schedule';
import { saveMentoringSchedules, type MentoringSchedule } from '../lib/mentoring-schedule';
import { iconHtml } from '../lib/icons';
import { openModalForEditing, openModalWithDate } from './modal';
import { triggerCancellation } from './cancel';
import { parseLecturesTable } from './lecture-table';
import { clearLectureDetailCache } from './lecture-detail';
import type { Lecture } from './types';

function alarmLabelHtml(isConfigured: boolean, notificationsEnabled: boolean): string {
  if (!isConfigured) {
    return `${iconHtml('bell', { size: 14 })}<span>알림 받기</span>`;
  }
  if (notificationsEnabled) {
    return `${iconHtml('bell', { size: 14 })}<span>알림 끄기</span>`;
  }
  return `${iconHtml('bellOff', { size: 14 })}<span>알림 받기</span>`;
}

interface HeaderHtmlOptions {
  alarmEnabled: boolean;
  alarmToggleLabel: string;
  alarmChecked: boolean;
  disabled: boolean;
}

function buildHeaderHtml(opts: HeaderHtmlOptions): string {
  const { alarmEnabled, alarmToggleLabel, alarmChecked, disabled } = opts;
  const d = disabled ? ' disabled' : '';
  return `
    <div class="calendar-title-group">
      <h3>통합 일정 대시보드</h3>
      <span class="calendar-subtitle">접수한 일정과 내 개인 일정을 함께 모아 관리합니다.</span>
    </div>
    <div class="calendar-nav-group">
      <button id="btn-prev-weeks" class="control-btn nav-btn"${d}>‹ 2주 전</button>
      <button id="btn-today" class="control-btn nav-btn nav-today"${d}>오늘</button>
      <button id="btn-next-weeks" class="control-btn nav-btn"${d}>2주 후 ›</button>
    </div>
    <div class="calendar-actions">
      ${
        alarmEnabled
          ? `
      <div class="alarm-info-wrap">
        <button id="btn-alarm-info" class="alarm-info-btn" type="button"${d}>!</button>
      </div>
      <label class="alarm-toggle-container" for="btn-toggle-alarm">
        <span class="alarm-toggle-text" id="alarm-toggle-text">${alarmToggleLabel}</span>
        <span class="asm-switch">
          <input type="checkbox" id="btn-toggle-alarm" ${alarmChecked ? 'checked' : ''}${d}>
          <span class="asm-slider"></span>
        </span>
      </label>
      `
          : ''
      }
      <button id="btn-refresh-lectures" class="control-btn nav-btn" title="최신 데이터로 새로고침"${d}>↻ 새로고침</button>
      <button id="btn-add-personal" class="control-btn accent"${d}>+ 개인 일정 추가</button>
    </div>
  `;
}

// Skeleton dashboard rendered synchronously before lectures are fetched.
// Buttons are disabled until renderCalendar() replaces this with the real one.
export function renderCalendarSkeleton(): void {
  const existing = document.getElementById('history-calendar');
  if (existing) existing.remove();

  const targetContainer = document.querySelector('.tabs-st1');
  if (!targetContainer || !targetContainer.parentNode) return;

  const alarmEnabled = Boolean(getAlarmFeature());

  const calendarWrapper = document.createElement('div');
  calendarWrapper.id = 'history-calendar';
  calendarWrapper.classList.add('history-calendar-loading');

  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.innerHTML = buildHeaderHtml({
    alarmEnabled,
    alarmToggleLabel: alarmLabelHtml(false, false),
    alarmChecked: false,
    disabled: true,
  });
  calendarWrapper.appendChild(header);

  const placeholder = document.createElement('div');
  placeholder.className = 'calendar-loading-placeholder';
  placeholder.innerHTML = `
    <span class="calendar-loading-spinner" aria-hidden="true"></span>
    <span class="calendar-loading-text">접수한 강의 정보를 불러오는 중입니다…</span>
    <span class="calendar-loading-subtext">처음 로딩 시 강의 상세를 한 건씩 가져오느라 시간이 걸릴 수 있습니다.</span>
  `;
  calendarWrapper.appendChild(placeholder);

  targetContainer.parentNode.insertBefore(calendarWrapper, targetContainer.nextSibling);
}

const CALENDAR_DAY_COUNT = 14;
const CALENDAR_SHIFT_WEEKS = 2;

// 0 means starting from the Sunday of current week
let startOffsetWeeks = 0;

function getAlarmFeature() {
  return globalThis.ASMAlarmFeature || null;
}

interface GcalMatchResponse {
  connected: boolean;
  matched: Record<string, boolean>;
  error?: string;
}

async function requestGcalMatch(
  schedules: { qustnrSn: string; dateStr: string; startTime: string; endTime: string; title: string }[]
): Promise<GcalMatchResponse> {
  const valid = schedules.filter((s) => s.qustnrSn && s.dateStr && s.startTime && s.endTime);
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'asm-gcal-match',
      lectures: valid,
    });
    if (response && typeof response === 'object' && 'connected' in response) {
      return response as GcalMatchResponse;
    }
    console.warn('[ASM gcal] match response had unexpected shape', response);
  } catch (err) {
    console.warn('[ASM gcal] match failed:', err);
  }
  return { connected: false, matched: {} };
}

export async function updateAlarmButtonState(): Promise<void> {
  const btn = document.getElementById('btn-toggle-alarm') as HTMLInputElement | null;
  const txt = document.getElementById('alarm-toggle-text');
  if (!btn || !txt) return;
  const alarmFeature = getAlarmFeature();
  const alarmSettings = alarmFeature
    ? await alarmFeature.loadSettings()
    : { userId: '', discordWebhookUrl: '', notificationsEnabled: false };
  const isAlarmConfigured = Boolean(alarmSettings.userId && alarmSettings.discordWebhookUrl);

  txt.innerHTML = alarmLabelHtml(isAlarmConfigured, alarmSettings.notificationsEnabled);
  btn.checked = isAlarmConfigured && alarmSettings.notificationsEnabled;
}

export async function renderCalendar(lectures: Lecture[]): Promise<void> {
  const existing = document.getElementById('history-calendar');
  if (existing) existing.remove();

  const targetContainer = document.querySelector('.tabs-st1');
  if (!targetContainer || !targetContainer.parentNode) return;

  const personalSchedules = await loadPersonalSchedules();
  const alarmFeature = getAlarmFeature();
  const alarmEnabled = Boolean(alarmFeature);
  const alarmSettings = alarmFeature
    ? await alarmFeature.loadSettings()
    : { userId: '', discordWebhookUrl: '', notificationsEnabled: false };
  const isAlarmConfigured = Boolean(alarmSettings.userId && alarmSettings.discordWebhookUrl);
  const alarmToggleLabel = alarmLabelHtml(isAlarmConfigured, alarmSettings.notificationsEnabled);

  const mergedPersonalSchedules: PersonalSchedule[] = [...FIXED_SHARED_SCHEDULES, ...personalSchedules];

  // 멘토링 일정 충돌 감지를 위해 접수된 강의를 storage에 저장
  const mentoringSchedules: MentoringSchedule[] = lectures
    .map((l) => {
      const parsed = parseLectureDateTimeText(l.dateTimeText);
      if (!parsed || !l.dateStr) return null;
      return {
        qustnrSn: l.qustnrSn || '',
        title: l.title || '',
        dateStr: l.dateStr,
        startTime: `${parsed.sh}:${parsed.sm}`,
        endTime: `${parsed.eh}:${parsed.em}`,
      } satisfies MentoringSchedule;
    })
    .filter((ms): ms is MentoringSchedule => ms !== null);
  void saveMentoringSchedules(mentoringSchedules);

  const gcalMatchResult = await requestGcalMatch(mentoringSchedules);

  const calendarWrapper = document.createElement('div');
  calendarWrapper.id = 'history-calendar';

  // 1. Calendar Header / Dashboard Toolbar
  const header = document.createElement('div');
  header.className = 'calendar-header';
  header.innerHTML = buildHeaderHtml({
    alarmEnabled,
    alarmToggleLabel,
    alarmChecked: isAlarmConfigured && alarmSettings.notificationsEnabled,
    disabled: false,
  });
  calendarWrapper.appendChild(header);

  // Alarm info popover (only when feature is loaded)
  if (alarmEnabled) {
    const alarmInfoBtn = header.querySelector<HTMLButtonElement>('#btn-alarm-info');
    const alarmInfoWrap = header.querySelector<HTMLDivElement>('.alarm-info-wrap');
    if (alarmInfoBtn && alarmInfoWrap) {
      const alarmInfoPopover = document.createElement('div');
      alarmInfoPopover.className = 'alarm-info-popover';
      alarmInfoPopover.setAttribute('aria-hidden', 'true');
      alarmInfoPopover.innerHTML = `
        <div class="alarm-info-notice">
          <div class="alarm-info-notice-title">베타 버전 안내</div>
          <div class="alarm-info-notice-body">현재 알림의 경우에는 베타 서비스로 운영 중입니다. 동시 사용자가 많아지거나 트래픽이 집중되면 Discord 알림이 일시적으로 차단될 수 있습니다.</div>
        </div>
        <div class="alarm-info-divider"></div>
        <div class="alarm-info-title">알림 방식</div>
        <div class="alarm-info-body">Discord 웹훅을 통해 멘토링 일정 시작 <b>1시간 전</b>에 알림 메시지를 전송합니다.</div>
        <div class="alarm-info-divider"></div>
        <div class="alarm-info-subtitle">알림 대상</div>
        <table class="alarm-info-table">
          <tr><td>멘토링 접수 일정</td><td><b>알림 있음</b></td></tr>
          <tr><td>개인 일정</td><td>알림 없음</td></tr>
        </table>
      `;
      alarmInfoWrap.appendChild(alarmInfoPopover);

      alarmInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = alarmInfoPopover.classList.toggle('alarm-info-popover--open');
        alarmInfoPopover.setAttribute('aria-hidden', String(!isOpen));
      });

      document.addEventListener('click', (e) => {
        if (!alarmInfoWrap.contains(e.target as Node)) {
          alarmInfoPopover.classList.remove('alarm-info-popover--open');
          alarmInfoPopover.setAttribute('aria-hidden', 'true');
        }
      });
    }
  }

  // 2. Calendar Cells Grid
  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  const dayKorean = ['일', '월', '화', '수', '목', '금', '토'];

  // Weekday header row
  dayKorean.forEach((wd, idx) => {
    const wdHeader = document.createElement('div');
    wdHeader.className = `calendar-weekday-header${idx === 0 || idx === 6 ? ' weekend' : ''}`;
    wdHeader.textContent = wd;
    grid.appendChild(wdHeader);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const SundayOfCurrentWeek = new Date(today);
  SundayOfCurrentWeek.setDate(today.getDate() - today.getDay());

  const startDate = new Date(SundayOfCurrentWeek);
  startDate.setDate(startDate.getDate() + startOffsetWeeks * 7);

  interface EventEntry {
    isPersonal: boolean;
    data: Lecture | PersonalSchedule;
    timeKey: string;
    ended: boolean;
  }

  for (let i = 0; i < CALENDAR_DAY_COUNT; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);

    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    const isToday = currentDate.getTime() === today.getTime();
    const isPast = currentDate.getTime() < today.getTime();
    const formattedDateText = `${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일 (${
      dayKorean[currentDate.getDay()]
    })`;

    const dayLectures = lectures.filter((l) => l.dateStr === dateStr);
    const dayPersonal = mergedPersonalSchedules.filter((ps) => ps.dateStr === dateStr);

    const allEvents: EventEntry[] = [];

    dayLectures.forEach((l) => {
      let startKey = '00:00';
      const timeMatch = l.dateTimeText.match(/(\d{2}):(\d{2})/);
      if (timeMatch) startKey = `${timeMatch[1]}:${timeMatch[2]}`;

      allEvents.push({
        isPersonal: false,
        data: l,
        timeKey: startKey,
        ended: isLectureEnded(l.dateTimeText),
      });
    });

    dayPersonal.forEach((ps) => {
      allEvents.push({
        isPersonal: true,
        data: ps,
        timeKey: ps.startTime,
        ended: isLectureEnded(`${ps.dateStr}(요일) ${ps.startTime} ~ ${ps.endTime}`),
      });
    });

    allEvents.sort((a, b) => a.timeKey.localeCompare(b.timeKey));

    const cell = document.createElement('div');
    cell.className = `calendar-cell${isPast ? ' past-day' : ''}`;
    cell.setAttribute('data-calendar-date', dateStr);

    const dateHeader = document.createElement('div');
    dateHeader.className = 'calendar-date-header-row';

    const dateLeft = document.createElement('div');
    dateLeft.className = 'calendar-date-left';

    if (isToday) {
      const todayBadge = document.createElement('span');
      todayBadge.className = 'today-badge';
      todayBadge.textContent = '오늘';
      dateLeft.appendChild(todayBadge);
    }

    const dateSpan = document.createElement('span');
    dateSpan.className = 'calendar-date';
    dateSpan.textContent = formattedDateText;
    dateLeft.appendChild(dateSpan);

    dateHeader.appendChild(dateLeft);

    const quickAddBtn = document.createElement('button');
    quickAddBtn.className = 'quick-add-cell-btn';
    quickAddBtn.innerHTML = '＋';
    quickAddBtn.title = '이 날짜에 개인 일정 추가';
    quickAddBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openModalWithDate(dateStr);
    });
    dateHeader.appendChild(quickAddBtn);
    cell.appendChild(dateHeader);

    allEvents.forEach((evt) => {
      if (evt.isPersonal) {
        const ps = evt.data as PersonalSchedule;
        const card = document.createElement('div');
        card.className = `calendar-lecture ${evt.ended ? 'ended' : ''} event-personal`;
        card.title = ps.title;

        const badgeIcon = ps.isFixedShared ? iconHtml('pin', { size: 12 }) : iconHtml('user', { size: 12 });
        const badgeLabel = ps.isFixedShared ? '공통 일정' : '개인 일정';
        const locationLabel =
          ps.locationType === 'offline' ? '오프라인' : ps.locationType === 'online' ? '온라인' : '';
        const locationDetail = ps.location ? ` · ${escapeHtml(ps.location)}` : '';
        card.innerHTML = `
          <div class="info-group">
            <div class="text-title" data-role="title">${escapeHtml(ps.title)}</div>
            <div class="text-type-badge personal-badge">${badgeIcon}<span>${escapeHtml(badgeLabel)}</span></div>
            <div class="info-row" data-role="time"><strong>시간</strong> ${escapeHtml(ps.startTime)} ~ ${escapeHtml(ps.endTime)}</div>
            ${
              ps.locationType
                ? `<div class="info-row" data-role="location"><strong>장소</strong> ${escapeHtml(locationLabel)}${locationDetail}</div>`
                : ''
            }
            ${
              ps.description
                ? `<div class="info-row desc-row" data-role="desc"><strong>메모</strong> ${escapeHtml(ps.description)}</div>`
                : ''
            }
          </div>
        `;

        const personalExportGroup = document.createElement('div');
        personalExportGroup.className = 'export-group';
        const exporter = globalThis.ASMCalendarExport;
        if (exporter) {
          exporter.appendExportButtons(
            personalExportGroup,
            () => ({
              uid: ps.id ? `personal-${ps.id}@asm-schedule-manager` : undefined,
              title: ps.title,
              description: ps.description || '',
              location: ps.location || '',
              startsAt: exporter.kstToIso(ps.dateStr, ps.startTime),
              endsAt: exporter.kstToIso(ps.dateStr, ps.endTime),
            }),
            ps.title
          );
        }
        card.appendChild(personalExportGroup);

        if (ps.isFixedShared) {
          cell.appendChild(card);
          return;
        }

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';

        const btnEdit = document.createElement('button');
        btnEdit.className = 'edit-btn';
        btnEdit.innerHTML = '수정';
        btnEdit.title = '개인 일정 수정';
        btnEdit.addEventListener('click', (e) => {
          e.preventDefault();
          openModalForEditing(ps);
        });

        const btnDelete = document.createElement('button');
        btnDelete.className = 'delete-btn';
        btnDelete.innerHTML = '삭제';
        btnDelete.title = '개인 일정 삭제';
        btnDelete.addEventListener('click', async (e) => {
          e.preventDefault();
          if (confirm(`개인 일정 "${ps.title}"을(를) 삭제하시겠습니까?`)) {
            const currentList = await loadPersonalSchedules();
            const updatedList = currentList.filter((item) => item.id !== ps.id);
            try {
              await savePersonalSchedules(updatedList);
            } catch (error) {
              console.error('SOMA Schedule Manager: Failed to delete personal schedule:', error);
              const msg = error instanceof Error ? error.message : '개인 일정 삭제에 실패했습니다.';
              alert(msg);
              return;
            }

            const freshLectures = await parseLecturesTable();
            await renderCalendar(freshLectures);
          }
        });

        buttonGroup.appendChild(btnEdit);
        buttonGroup.appendChild(btnDelete);
        card.appendChild(buttonGroup);
        cell.appendChild(card);
      } else {
        const lec = evt.data as Lecture;
        const card = document.createElement('div');
        const missingFromGcal =
          gcalMatchResult.connected &&
          !evt.ended &&
          lec.qustnrSn &&
          gcalMatchResult.matched[lec.qustnrSn] === false;
        card.className = `calendar-lecture ${evt.ended ? 'ended' : ''} ${
          lec.type.includes('특강') ? 'special' : 'mentoring'
        }${missingFromGcal ? ' not-in-gcal' : ''}`;
        card.title = lec.title;

        let timeStr = '';
        const timeMatch = lec.dateTimeText.match(/(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/);
        if (timeMatch) {
          timeStr = `${timeMatch[1]}:${timeMatch[2]} ~ ${timeMatch[3]}:${timeMatch[4]}`;
        } else {
          timeStr = lec.dateTimeText;
        }

        const infoLink = document.createElement('a');
        infoLink.className = 'info-group';
        infoLink.href = getSafeSomaUrl(lec.url) || '#';
        infoLink.innerHTML = `
          <div class="text-title" data-role="title">${escapeHtml(lec.title)}</div>
          <div class="text-type-badge">${escapeHtml(lec.type)}</div>
          <div class="info-row" data-role="mentor"><strong>멘토</strong> ${escapeHtml(lec.mentorName)}</div>
          <div class="info-row" data-role="time"><strong>시간</strong> ${escapeHtml(timeStr)}</div>
          <div class="info-row" data-role="location"><strong>장소</strong> ${escapeHtml(lec.location)}</div>
          <div class="info-row" data-role="people"><strong>신청인원</strong> ${escapeHtml(lec.people)}</div>
          <div class="info-row" data-role="approval"><strong>개설승인</strong> ${escapeHtml(lec.approvalStatus)}</div>
          <div class="info-row" data-role="status"><strong>상태</strong> ${escapeHtml(lec.deadlineStatus)}</div>
        `;
        card.appendChild(infoLink);

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'button-group';
        const btnCancel = document.createElement('button');
        if (lec.cancelAllowed) {
          btnCancel.className = 'cancel-btn';
          btnCancel.innerHTML = '취소';
          btnCancel.title = '신청 취소';
          btnCancel.addEventListener('click', (e) => {
            e.preventDefault();
            triggerCancellation(lec.qustnrSn);
          });
        } else {
          btnCancel.className = 'cancel-btn unavailable';
          btnCancel.innerHTML = `${iconHtml('ban', { size: 12 })}<span>취소 불가</span>`;
          btnCancel.title = evt.ended ? '종료된 일정이므로 취소 불가' : lec.cancelPolicyReason;
          btnCancel.disabled = true;
        }

        buttonGroup.appendChild(btnCancel);
        card.appendChild(buttonGroup);

        const lectureExportGroup = document.createElement('div');
        lectureExportGroup.className = 'export-group';
        const exporter = globalThis.ASMCalendarExport;
        if (exporter) {
          exporter.appendExportButtons(
            lectureExportGroup,
            () => {
              const parsed = parseLectureDateTimeText(lec.dateTimeText);
              if (!parsed) {
                alert('일정 시간을 파싱할 수 없어 내보낼 수 없습니다.');
                return null;
              }
              const exportDateStr = `${parsed.y}-${parsed.m}-${parsed.d}`;
              const description = [
                lec.type,
                lec.mentorName ? `멘토: ${lec.mentorName}` : '',
                lec.url ? `상세: ${lec.url}` : '',
              ]
                .filter(Boolean)
                .join('\n');
              return {
                uid: lec.qustnrSn ? `lecture-${lec.qustnrSn}@asm-schedule-manager` : undefined,
                title: lec.title,
                description,
                location: lec.location || '',
                startsAt: exporter.kstToIso(exportDateStr, `${parsed.sh}:${parsed.sm}`),
                endsAt: exporter.kstToIso(exportDateStr, `${parsed.eh}:${parsed.em}`),
              };
            },
            lec.title
          );
        }
        card.appendChild(lectureExportGroup);

        cell.appendChild(card);
      }
    });

    grid.appendChild(cell);
  }

  calendarWrapper.appendChild(grid);

  // Insert after tab selector list
  targetContainer.parentNode.insertBefore(calendarWrapper, targetContainer.nextSibling);

  // Event hooks
  document.getElementById('btn-prev-weeks')!.addEventListener('click', () => {
    startOffsetWeeks -= CALENDAR_SHIFT_WEEKS;
    renderCalendar(lectures);
  });

  document.getElementById('btn-today')!.addEventListener('click', () => {
    startOffsetWeeks = 0;
    renderCalendar(lectures);
  });

  document.getElementById('btn-next-weeks')!.addEventListener('click', () => {
    startOffsetWeeks += CALENDAR_SHIFT_WEEKS;
    renderCalendar(lectures);
  });

  if (alarmEnabled) {
    document.getElementById('btn-toggle-alarm')!.addEventListener('click', async (e) => {
      const feature = getAlarmFeature();
      if (!feature) {
        alert('알림 기능이 아직 로드되지 않았습니다. 확장 프로그램을 새로고침한 뒤 다시 시도해 주세요.');
        e.preventDefault();
        return;
      }

      const res = await feature.toggleNotifications({
        lectures,
        onChanged: async () => {
          await updateAlarmButtonState();
        },
      });

      if (res && res.configured === false) {
        const btn = document.getElementById('btn-toggle-alarm') as HTMLInputElement | null;
        if (btn) btn.checked = false;
      }
    });
  }

  document.getElementById('btn-add-personal')!.addEventListener('click', () => {
    openModalWithDate();
  });

  document.getElementById('btn-refresh-lectures')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (btn.disabled) return;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '↻ 새로고침 중…';
    try {
      await clearLectureDetailCache();
      try {
        await chrome.runtime.sendMessage({ type: 'asm-gcal-clear-cache' });
      } catch {
        /* gcal cache clear is best-effort */
      }
      const fresh = await parseLecturesTable();
      await renderCalendar(fresh);
    } catch (err) {
      console.error('SOMA Schedule Manager: refresh failed', err);
      btn.disabled = false;
      btn.textContent = originalText;
      alert('새로고침 중 오류가 발생했습니다.');
    }
  });
}
