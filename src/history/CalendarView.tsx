// Two-week dashboard calendar — orchestrator. State (week offset, personal
// schedules, alarm settings, gcal match, refreshing) lives here; rendering
// is split across CalendarHeader / CalendarCell / LectureCard /
// PersonalScheduleCard. Keeps the existing global class names so
// calendar-styles.css ports verbatim.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isLectureEnded, parseLectureDateTimeText } from '../lib/date-time';
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
import { cx } from '../lib/cx';
import { openModalForEditing, openModalWithDate } from './modal';
import { triggerCancellation } from './cancel';
import {
  CalendarHeader,
  EMPTY_ALARM_SETTINGS,
  type AlarmSettings,
} from './CalendarHeader';
import {
  CalendarCell,
  type EventEntry,
  type GcalMatchResponse,
} from './CalendarCell';
import type { Lecture } from './types';

const CALENDAR_DAY_COUNT = 14;
const CALENDAR_SHIFT_WEEKS = 2;
const DAY_KOREAN = ['일', '월', '화', '수', '목', '금', '토'];

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
