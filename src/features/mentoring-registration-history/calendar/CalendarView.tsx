// Two-week dashboard calendar — orchestrator. State (week offset, personal
// schedules, Google Calendar match, refreshing) lives here; rendering
// is split across CalendarHeader / CalendarCell / LectureCard /
// PersonalScheduleCard.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DAY_KO, isLectureEnded, parseLectureDateTimeText, toDateStr } from '@shared/date/date-time';
import {
  deletePersonalSchedule,
  FIXED_SHARED_SCHEDULES,
  loadPersonalSchedules,
  type PersonalSchedule,
} from '@features/schedules/personal-schedule';
import {
  saveMentoringSchedules,
  type MentoringSchedule,
} from '@features/schedules/mentoring-schedule';
import { cx } from '@shared/ui/cx';
import { triggerCancellation } from '../lectures/cancel';
import { openModalForEditing, openModalWithDate } from '../personal-schedules/modal';
import { CalendarHeader, calendarHeaderCss } from './CalendarHeader';
import { CalendarCell, calendarCellCss, type EventEntry } from './CalendarCell';
import { useGoogleCalendarMatch } from './useGoogleCalendarMatch';
import type { Lecture } from '../lectures/types';
import baseStyles from './CalendarView.module.css';
import cellStyles from './CalendarCell.module.css';
import baseCss from './CalendarView.module.css?inline';

export const calendarCss = [baseCss, calendarHeaderCss, calendarCellCss].join('\n');

const CALENDAR_DAY_COUNT = 14;
const CALENDAR_SHIFT_WEEKS = 2;

function buildMentoringSchedules(lectures: Lecture[]): MentoringSchedule[] {
  return lectures
    .map((l) => {
      const parsed = parseLectureDateTimeText(l.dateTimeText);
      if (!parsed || !l.dateStr) return null;
      return {
        somaLectureId: l.somaLectureId || '',
        title: l.title || '',
        dateStr: l.dateStr,
        startTime: `${parsed.sh}:${parsed.sm}`,
        endTime: `${parsed.eh}:${parsed.em}`,
      } satisfies MentoringSchedule;
    })
    .filter((ms): ms is MentoringSchedule => ms !== null);
}

export interface CalendarProps {
  loading: boolean;
  lectures: Lecture[];
  onRefresh(): Promise<void> | void;
}

export function Calendar({ loading, lectures, onRefresh }: CalendarProps) {
  const [startOffsetWeeks, setStartOffsetWeeks] = useState(0);
  const [personalSchedules, setPersonalSchedules] = useState<PersonalSchedule[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void loadPersonalSchedules().then(setPersonalSchedules);
  }, [lectures, refreshKey]);

  const mentoringSchedules = useMemo(
    () => buildMentoringSchedules(lectures),
    [lectures],
  );

  // Persist mentoring schedules so the detail-page conflict checker can read them.
  useEffect(() => {
    if (loading) return;
    void saveMentoringSchedules(mentoringSchedules);
  }, [loading, mentoringSchedules]);

  const { googleCalendarMatch, registeredFeedbackIds } = useGoogleCalendarMatch(
    mentoringSchedules,
    loading,
  );

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
    try {
      await deletePersonalSchedule(ps.id);
    } catch (error) {
      console.error('SOMA Schedule Manager: Failed to delete personal schedule:', error);
      alert(error instanceof Error ? error.message : '개인 일정 삭제에 실패했습니다.');
      return;
    }
    setPersonalSchedules((prev) => prev.filter((item) => item.id !== ps.id));
    await onRefresh();
  }, [onRefresh]);

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
      const dateStr = toDateStr(d);
      out.push({
        date: d,
        dateStr,
        isToday: d.getTime() === today.getTime(),
        isPast: d.getTime() < today.getTime(),
        formattedDateText: `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAY_KO[d.getDay()]})`,
      });
    }
    return out;
  }, [startDate, today]);

  return (
    <div id="registration-history-calendar">
      <CalendarHeader
        disabled={loading}
        refreshing={refreshing}
        onPrevWeeks={() => setStartOffsetWeeks((w) => w - CALENDAR_SHIFT_WEEKS)}
        onToday={() => setStartOffsetWeeks(0)}
        onNextWeeks={() => setStartOffsetWeeks((w) => w + CALENDAR_SHIFT_WEEKS)}
        onAddPersonal={() => openModalWithDate()}
        onRefresh={handleRefresh}
      />

      {loading ? (
        <div className={baseStyles.calendarLoadingPlaceholder}>
          <span className={baseStyles.calendarLoadingSpinner} aria-hidden="true" />
          <span className={baseStyles.calendarLoadingText}>
            접수한 강의 정보를 불러오는 중입니다…
          </span>
          <span className={baseStyles.calendarLoadingSubtext}>
            처음 로딩 시 강의 상세를 한 건씩 가져오느라 시간이 걸릴 수 있습니다.
          </span>
        </div>
      ) : (
        <div className={cellStyles.calendarGrid}>
          {DAY_KO.map((wd, idx) => (
            <div
              key={`wd-${wd}`}
              className={cx(cellStyles.calendarWeekdayHeader, {
                [cellStyles.weekend]: idx === 0 || idx === 6,
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
              const lectureParsed = parseLectureDateTimeText(l.dateTimeText);
              const timeKey = lectureParsed ? `${lectureParsed.sh}:${lectureParsed.sm}` : '00:00';
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
                googleCalendarMatch={googleCalendarMatch}
                registeredFeedbackIds={registeredFeedbackIds}
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
