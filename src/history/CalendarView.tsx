// Two-week dashboard calendar — React port of the imperative version in
// calendar.ts. Keeps the existing global class names (calendar-header,
// calendar-cell, info-group, ...) so calendar-styles.css ports verbatim and
// external integrations (appendExportButtons) keep matching the same classes
// when their elements are appended into our DOM.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isLectureEnded, parseLectureDateTimeText } from '../lib/date-time';
import { getSafeSomaUrl } from '../lib/safe-url';
import {
  FIXED_SHARED_SCHEDULES,
  loadPersonalSchedules,
  savePersonalSchedules,
  type PersonalSchedule,
} from '../lib/personal-schedule';
import {
  saveMentoringSchedules,
  type MentoringSchedule,
} from '../lib/mentoring-schedule';
import { Icon } from '../lib/Icon';
import { cx } from '../lib/cx';
import { openModalForEditing, openModalWithDate } from './modal';
import { triggerCancellation } from './cancel';
import type { Lecture } from './types';

const CALENDAR_DAY_COUNT = 14;
const CALENDAR_SHIFT_WEEKS = 2;
const DAY_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

interface AlarmSettings {
  userId: string;
  discordWebhookUrl: string;
  notificationsEnabled: boolean;
}

const EMPTY_ALARM_SETTINGS: AlarmSettings = {
  userId: '',
  discordWebhookUrl: '',
  notificationsEnabled: false,
};

interface GcalMatchResponse {
  connected: boolean;
  matched: Record<string, boolean>;
  error?: string;
}

function getAlarmFeature() {
  return globalThis.ASMAlarmFeature || null;
}

async function requestGcalMatch(
  schedules: MentoringSchedule[],
): Promise<GcalMatchResponse> {
  const valid = schedules.filter(
    (s) => s.qustnrSn && s.dateStr && s.startTime && s.endTime,
  );
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

function buildMentoringSchedules(lectures: Lecture[]): MentoringSchedule[] {
  return lectures
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
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

interface EventEntry {
  isPersonal: boolean;
  data: Lecture | PersonalSchedule;
  timeKey: string;
  ended: boolean;
}

function AlarmInfoPopoverBody() {
  return (
    <>
      <div className="alarm-info-notice">
        <div className="alarm-info-notice-title">베타 버전 안내</div>
        <div className="alarm-info-notice-body">
          현재 알림의 경우에는 베타 서비스로 운영 중입니다. 동시 사용자가 많아지거나 트래픽이 집중되면 Discord 알림이 일시적으로 차단될 수 있습니다.
        </div>
      </div>
      <div className="alarm-info-divider" />
      <div className="alarm-info-title">알림 방식</div>
      <div className="alarm-info-body">
        Discord 웹훅을 통해 멘토링 일정 시작 <b>1시간 전</b>에 알림 메시지를 전송합니다.
      </div>
      <div className="alarm-info-divider" />
      <div className="alarm-info-subtitle">알림 대상</div>
      <table className="alarm-info-table">
        <tbody>
          <tr>
            <td>멘토링 접수 일정</td>
            <td>
              <b>알림 있음</b>
            </td>
          </tr>
          <tr>
            <td>개인 일정</td>
            <td>알림 없음</td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function AlarmLabel({
  isConfigured,
  notificationsEnabled,
}: {
  isConfigured: boolean;
  notificationsEnabled: boolean;
}) {
  if (!isConfigured) {
    return (
      <>
        <Icon name="bell" size={14} />
        <span>알림 받기</span>
      </>
    );
  }
  if (notificationsEnabled) {
    return (
      <>
        <Icon name="bell" size={14} />
        <span>알림 끄기</span>
      </>
    );
  }
  return (
    <>
      <Icon name="bellOff" size={14} />
      <span>알림 받기</span>
    </>
  );
}

interface CalendarHeaderProps {
  disabled: boolean;
  alarmEnabled: boolean;
  alarmSettings: AlarmSettings;
  alarmInfoOpen: boolean;
  refreshing: boolean;
  onPrevWeeks(): void;
  onToday(): void;
  onNextWeeks(): void;
  onToggleAlarmInfo(): void;
  onCloseAlarmInfo(): void;
  onToggleAlarm(): void | Promise<void>;
  onAddPersonal(): void;
  onRefresh(): void | Promise<void>;
}

function CalendarHeader({
  disabled,
  alarmEnabled,
  alarmSettings,
  alarmInfoOpen,
  refreshing,
  onPrevWeeks,
  onToday,
  onNextWeeks,
  onToggleAlarmInfo,
  onCloseAlarmInfo,
  onToggleAlarm,
  onAddPersonal,
  onRefresh,
}: CalendarHeaderProps) {
  const isAlarmConfigured = Boolean(
    alarmSettings.userId && alarmSettings.discordWebhookUrl,
  );
  const alarmChecked = isAlarmConfigured && alarmSettings.notificationsEnabled;

  const alarmInfoWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!alarmInfoOpen) return;
    const wrap = alarmInfoWrapRef.current;
    if (!wrap) return;

    const handler = (e: globalThis.MouseEvent) => {
      const path = e.composedPath();
      if (!path.includes(wrap)) {
        onCloseAlarmInfo();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [alarmInfoOpen, onCloseAlarmInfo]);

  return (
    <div className="calendar-header">
      <div className="calendar-title-group">
        <h3>통합 일정 대시보드</h3>
        <span className="calendar-subtitle">
          접수한 일정과 내 개인 일정을 함께 모아 관리합니다.
        </span>
      </div>
      <div className="calendar-nav-group">
        <button className="control-btn nav-btn" disabled={disabled} onClick={onPrevWeeks}>
          ‹ 2주 전
        </button>
        <button
          className="control-btn nav-btn nav-today"
          disabled={disabled}
          onClick={onToday}
        >
          오늘
        </button>
        <button className="control-btn nav-btn" disabled={disabled} onClick={onNextWeeks}>
          2주 후 ›
        </button>
      </div>
      <div className="calendar-actions">
        {alarmEnabled && (
          <>
            <div className="alarm-info-wrap" ref={alarmInfoWrapRef}>
              <button
                className="alarm-info-btn"
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleAlarmInfo();
                }}
              >
                !
              </button>
              <div
                className={cx('alarm-info-popover', {
                  'alarm-info-popover--open': alarmInfoOpen,
                })}
                aria-hidden={!alarmInfoOpen}
              >
                <AlarmInfoPopoverBody />
              </div>
            </div>
            <label className="alarm-toggle-container">
              <span className="alarm-toggle-text">
                <AlarmLabel
                  isConfigured={isAlarmConfigured}
                  notificationsEnabled={alarmSettings.notificationsEnabled}
                />
              </span>
              <span className="asm-switch">
                <input
                  type="checkbox"
                  checked={alarmChecked}
                  disabled={disabled}
                  onChange={() => {
                    void onToggleAlarm();
                  }}
                />
                <span className="asm-slider" />
              </span>
            </label>
          </>
        )}
        <button
          className="control-btn nav-btn"
          title="최신 데이터로 새로고침"
          disabled={disabled || refreshing}
          onClick={() => void onRefresh()}
        >
          {refreshing ? '↻ 새로고침 중…' : '↻ 새로고침'}
        </button>
        <button
          className="control-btn accent"
          disabled={disabled}
          onClick={onAddPersonal}
        >
          + 개인 일정 추가
        </button>
      </div>
    </div>
  );
}

interface ExportSlotProps {
  uid?: string;
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
  filenameBase: string;
}

// Bridges to globalThis.ASMCalendarExport.appendExportButtons, which mutates
// its argument element directly. We hand it our ref'd div once on mount and
// keep a live ref to the latest event payload so the callback closure stays
// fresh across re-renders.
function ExportSlot(props: ExportSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const exporter = globalThis.ASMCalendarExport;
    if (!exporter) return;

    exporter.appendExportButtons(
      el,
      () => {
        const p = propsRef.current;
        if (!p.startsAt || !p.endsAt) return null;
        return {
          uid: p.uid,
          title: p.title,
          description: p.description,
          location: p.location,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
        };
      },
      props.filenameBase,
    );

    return () => {
      el.innerHTML = '';
    };
  }, [props.filenameBase]);

  return <div className="export-group" ref={ref} />;
}

interface PersonalScheduleCardProps {
  ps: PersonalSchedule;
  ended: boolean;
  onEdit(): void;
  onDelete(): void | Promise<void>;
}

function PersonalScheduleCard({ ps, ended, onEdit, onDelete }: PersonalScheduleCardProps) {
  const locationLabel =
    ps.locationType === 'offline'
      ? '오프라인'
      : ps.locationType === 'online'
        ? '온라인'
        : '';
  const exporter = globalThis.ASMCalendarExport;

  return (
    <div
      className={cx('calendar-lecture', 'event-personal', { ended })}
      title={ps.title}
    >
      <div className="info-group">
        <div className="text-title" data-role="title">
          {ps.title}
        </div>
        <div className="text-type-badge personal-badge">
          <Icon name={ps.isFixedShared ? 'pin' : 'user'} size={12} />
          <span>{ps.isFixedShared ? '공통 일정' : '개인 일정'}</span>
        </div>
        <div className="info-row" data-role="time">
          <strong>시간</strong> {ps.startTime} ~ {ps.endTime}
        </div>
        {ps.locationType && (
          <div className="info-row" data-role="location">
            <strong>장소</strong> {locationLabel}
            {ps.location ? ` · ${ps.location}` : ''}
          </div>
        )}
        {ps.description && (
          <div className="info-row desc-row" data-role="desc">
            <strong>메모</strong> {ps.description}
          </div>
        )}
      </div>

      {exporter && (
        <ExportSlot
          uid={ps.id ? `personal-${ps.id}@asm-schedule-manager` : undefined}
          title={ps.title}
          description={ps.description || ''}
          location={ps.location || ''}
          startsAt={exporter.kstToIso(ps.dateStr, ps.startTime)}
          endsAt={exporter.kstToIso(ps.dateStr, ps.endTime)}
          filenameBase={ps.title}
        />
      )}

      {!ps.isFixedShared && (
        <div className="button-group">
          <button
            className="edit-btn"
            title="개인 일정 수정"
            onClick={(e) => {
              e.preventDefault();
              onEdit();
            }}
          >
            수정
          </button>
          <button
            className="delete-btn"
            title="개인 일정 삭제"
            onClick={(e) => {
              e.preventDefault();
              void onDelete();
            }}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

interface LectureCardProps {
  lec: Lecture;
  ended: boolean;
  missingFromGcal: boolean;
  onCancel(): void;
}

function LectureCard({ lec, ended, missingFromGcal, onCancel }: LectureCardProps) {
  const timeStr = useMemo(() => {
    const m = lec.dateTimeText.match(
      /(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/,
    );
    return m ? `${m[1]}:${m[2]} ~ ${m[3]}:${m[4]}` : lec.dateTimeText;
  }, [lec.dateTimeText]);

  const isSpecial = lec.type.includes('특강');
  const safeUrl = getSafeSomaUrl(lec.url) || '#';
  const exporter = globalThis.ASMCalendarExport;

  const exportStarts = useMemo(() => {
    if (!exporter) return null;
    const parsed = parseLectureDateTimeText(lec.dateTimeText);
    if (!parsed) return null;
    const exportDateStr = `${parsed.y}-${parsed.m}-${parsed.d}`;
    return exporter.kstToIso(exportDateStr, `${parsed.sh}:${parsed.sm}`);
  }, [exporter, lec.dateTimeText]);
  const exportEnds = useMemo(() => {
    if (!exporter) return null;
    const parsed = parseLectureDateTimeText(lec.dateTimeText);
    if (!parsed) return null;
    const exportDateStr = `${parsed.y}-${parsed.m}-${parsed.d}`;
    return exporter.kstToIso(exportDateStr, `${parsed.eh}:${parsed.em}`);
  }, [exporter, lec.dateTimeText]);

  const description = [
    lec.type,
    lec.mentorName ? `멘토: ${lec.mentorName}` : '',
    lec.url ? `상세: ${lec.url}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      className={cx(
        'calendar-lecture',
        isSpecial ? 'special' : 'mentoring',
        { ended, 'not-in-gcal': missingFromGcal },
      )}
      title={lec.title}
    >
      <a className="info-group" href={safeUrl}>
        <div className="text-title" data-role="title">
          {lec.title}
        </div>
        <div className="text-type-badge">{lec.type}</div>
        <div className="info-row" data-role="mentor">
          <strong>멘토</strong> {lec.mentorName}
        </div>
        <div className="info-row" data-role="time">
          <strong>시간</strong> {timeStr}
        </div>
        <div className="info-row" data-role="location">
          <strong>장소</strong> {lec.location}
        </div>
        <div className="info-row" data-role="people">
          <strong>신청인원</strong> {lec.people}
        </div>
        <div className="info-row" data-role="approval">
          <strong>개설승인</strong> {lec.approvalStatus}
        </div>
        <div className="info-row" data-role="status">
          <strong>상태</strong> {lec.deadlineStatus}
        </div>
      </a>

      <div className="button-group">
        {lec.cancelAllowed ? (
          <button
            className="cancel-btn"
            title="신청 취소"
            onClick={(e) => {
              e.preventDefault();
              onCancel();
            }}
          >
            취소
          </button>
        ) : (
          <button
            className="cancel-btn unavailable"
            title={ended ? '종료된 일정이므로 취소 불가' : lec.cancelPolicyReason}
            disabled
          >
            <Icon name="ban" size={12} />
            <span>취소 불가</span>
          </button>
        )}
      </div>

      {exporter && (
        <ExportSlot
          uid={lec.qustnrSn ? `lecture-${lec.qustnrSn}@asm-schedule-manager` : undefined}
          title={lec.title}
          description={description}
          location={lec.location || ''}
          startsAt={exportStarts}
          endsAt={exportEnds}
          filenameBase={lec.title}
        />
      )}
    </div>
  );
}

interface CalendarCellProps {
  dateStr: string;
  isToday: boolean;
  isPast: boolean;
  formattedDateText: string;
  events: EventEntry[];
  gcalMatch: GcalMatchResponse;
  onAddPersonal(dateStr: string): void;
  onEditPersonal(ps: PersonalSchedule): void;
  onDeletePersonal(ps: PersonalSchedule): void | Promise<void>;
  onCancelLecture(qustnrSn: string): void;
}

function CalendarCell({
  dateStr,
  isToday,
  isPast,
  formattedDateText,
  events,
  gcalMatch,
  onAddPersonal,
  onEditPersonal,
  onDeletePersonal,
  onCancelLecture,
}: CalendarCellProps) {
  return (
    <div className={cx('calendar-cell', { 'past-day': isPast })} data-calendar-date={dateStr}>
      <div className="calendar-date-header-row">
        <div className="calendar-date-left">
          {isToday && <span className="today-badge">오늘</span>}
          <span className="calendar-date">{formattedDateText}</span>
        </div>
        <button
          className="quick-add-cell-btn"
          title="이 날짜에 개인 일정 추가"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAddPersonal(dateStr);
          }}
        >
          ＋
        </button>
      </div>

      {events.map((evt, idx) => {
        if (evt.isPersonal) {
          const ps = evt.data as PersonalSchedule;
          return (
            <PersonalScheduleCard
              key={`p-${ps.id || idx}`}
              ps={ps}
              ended={evt.ended}
              onEdit={() => onEditPersonal(ps)}
              onDelete={() => onDeletePersonal(ps)}
            />
          );
        }
        const lec = evt.data as Lecture;
        const missingFromGcal =
          gcalMatch.connected &&
          !evt.ended &&
          Boolean(lec.qustnrSn) &&
          gcalMatch.matched[lec.qustnrSn] === false;
        return (
          <LectureCard
            key={`l-${lec.qustnrSn || idx}`}
            lec={lec}
            ended={evt.ended}
            missingFromGcal={missingFromGcal}
            onCancel={() => onCancelLecture(lec.qustnrSn)}
          />
        );
      })}
    </div>
  );
}

export interface CalendarProps {
  loading: boolean;
  lectures: Lecture[];
  onRefresh(): Promise<void> | void;
}

export function Calendar({ loading, lectures, onRefresh }: CalendarProps) {
  const [startOffsetWeeks, setStartOffsetWeeks] = useState(0);
  const [personalSchedules, setPersonalSchedules] = useState<PersonalSchedule[]>([]);
  const [alarmSettings, setAlarmSettings] = useState<AlarmSettings>(EMPTY_ALARM_SETTINGS);
  const [gcalMatch, setGcalMatch] = useState<GcalMatchResponse>({
    connected: false,
    matched: {},
  });
  const [alarmInfoOpen, setAlarmInfoOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const alarmFeature = getAlarmFeature();
  const alarmEnabled = Boolean(alarmFeature);

  useEffect(() => {
    void loadPersonalSchedules().then(setPersonalSchedules);
  }, [lectures, refreshKey]);

  useEffect(() => {
    if (!alarmFeature) return;
    void alarmFeature.loadSettings().then((s) => setAlarmSettings(s as AlarmSettings));
  }, [alarmFeature, lectures]);

  const mentoringSchedules = useMemo(
    () => buildMentoringSchedules(lectures),
    [lectures],
  );

  useEffect(() => {
    if (loading) return;
    void saveMentoringSchedules(mentoringSchedules);
    void requestGcalMatch(mentoringSchedules).then(setGcalMatch);
  }, [loading, mentoringSchedules]);

  const handleToggleAlarm = useCallback(async () => {
    const feature = getAlarmFeature();
    if (!feature) {
      alert('알림 기능이 아직 로드되지 않았습니다. 확장 프로그램을 새로고침한 뒤 다시 시도해 주세요.');
      return;
    }
    await feature.toggleNotifications({
      lectures,
      onChanged: async () => {
        const s = await feature.loadSettings();
        setAlarmSettings(s as AlarmSettings);
      },
    });
    // Re-read after toggle to capture the post-toggle state even when the
    // feature didn't fire onChanged (e.g. when it was already in that state).
    const s = await feature.loadSettings();
    setAlarmSettings(s as AlarmSettings);
  }, [lectures]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('SOMA Schedule Manager: refresh failed', err);
      alert('새로고침 중 오류가 발생했습니다.');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  const handleDeletePersonal = useCallback(async (ps: PersonalSchedule) => {
    if (!confirm(`개인 일정 "${ps.title}"을(를) 삭제하시겠습니까?`)) return;
    const list = await loadPersonalSchedules();
    const updated = list.filter((item) => item.id !== ps.id);
    try {
      await savePersonalSchedules(updated);
    } catch (error) {
      console.error('SOMA Schedule Manager: Failed to delete personal schedule:', error);
      alert(error instanceof Error ? error.message : '개인 일정 삭제에 실패했습니다.');
      return;
    }
    setPersonalSchedules(updated);
    await onRefresh();
  }, [onRefresh]);

  const handleHeaderToggleInfo = useCallback(() => {
    setAlarmInfoOpen((v) => !v);
  }, []);
  const handleHeaderCloseInfo = useCallback(() => {
    setAlarmInfoOpen(false);
  }, []);

  // --- Render ---

  const mergedPersonals = useMemo(
    () => [...FIXED_SHARED_SCHEDULES, ...personalSchedules],
    [personalSchedules],
  );

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const startDate = useMemo(() => {
    const sun = new Date(today);
    sun.setDate(today.getDate() - today.getDay());
    sun.setDate(sun.getDate() + startOffsetWeeks * 7);
    return sun;
  }, [today, startOffsetWeeks]);

  const days = useMemo(() => {
    const out: { date: Date; dateStr: string; isToday: boolean; isPast: boolean; formattedDateText: string }[] = [];
    for (let i = 0; i < CALENDAR_DAY_COUNT; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      const dateStr = dateKey(d);
      out.push({
        date: d,
        dateStr,
        isToday: d.getTime() === today.getTime(),
        isPast: d.getTime() < today.getTime(),
        formattedDateText: `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_KOREAN[d.getDay()]})`,
      });
    }
    return out;
  }, [startDate, today]);

  return (
    <div
      id="history-calendar"
      className={cx({ 'history-calendar-loading': loading })}
    >
      <CalendarHeader
        disabled={loading}
        alarmEnabled={alarmEnabled}
        alarmSettings={alarmSettings}
        alarmInfoOpen={alarmInfoOpen}
        refreshing={refreshing}
        onPrevWeeks={() => setStartOffsetWeeks((w) => w - CALENDAR_SHIFT_WEEKS)}
        onToday={() => setStartOffsetWeeks(0)}
        onNextWeeks={() => setStartOffsetWeeks((w) => w + CALENDAR_SHIFT_WEEKS)}
        onToggleAlarmInfo={handleHeaderToggleInfo}
        onCloseAlarmInfo={handleHeaderCloseInfo}
        onToggleAlarm={handleToggleAlarm}
        onAddPersonal={() => openModalWithDate()}
        onRefresh={handleRefresh}
      />

      {loading ? (
        <div className="calendar-loading-placeholder">
          <span className="calendar-loading-spinner" aria-hidden="true" />
          <span className="calendar-loading-text">
            접수한 강의 정보를 불러오는 중입니다…
          </span>
          <span className="calendar-loading-subtext">
            처음 로딩 시 강의 상세를 한 건씩 가져오느라 시간이 걸릴 수 있습니다.
          </span>
        </div>
      ) : (
        <div className="calendar-grid">
          {DAY_KOREAN.map((wd, idx) => (
            <div
              key={`wd-${wd}`}
              className={cx('calendar-weekday-header', {
                weekend: idx === 0 || idx === 6,
              })}
            >
              {wd}
            </div>
          ))}
          {days.map((day) => {
            const dayLectures = lectures.filter((l) => l.dateStr === day.dateStr);
            const dayPersonals = mergedPersonals.filter((ps) => ps.dateStr === day.dateStr);
            const events: EventEntry[] = [];
            for (const l of dayLectures) {
              const m = l.dateTimeText.match(/(\d{2}):(\d{2})/);
              const timeKey = m ? `${m[1]}:${m[2]}` : '00:00';
              events.push({
                isPersonal: false,
                data: l,
                timeKey,
                ended: isLectureEnded(l.dateTimeText),
              });
            }
            for (const ps of dayPersonals) {
              events.push({
                isPersonal: true,
                data: ps,
                timeKey: ps.startTime,
                ended: isLectureEnded(`${ps.dateStr}(요일) ${ps.startTime} ~ ${ps.endTime}`),
              });
            }
            events.sort((a, b) => a.timeKey.localeCompare(b.timeKey));

            return (
              <CalendarCell
                key={day.dateStr}
                dateStr={day.dateStr}
                isToday={day.isToday}
                isPast={day.isPast}
                formattedDateText={day.formattedDateText}
                events={events}
                gcalMatch={gcalMatch}
                onAddPersonal={openModalWithDate}
                onEditPersonal={openModalForEditing}
                onDeletePersonal={handleDeletePersonal}
                onCancelLecture={triggerCancellation}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
