// One day-cell in the 14-day dashboard grid. Renders the date header with a
// quick-add button and the ordered list of LectureCard / PersonalScheduleCard
// entries.

import { cx } from '@shared/ui/cx';
import { LectureCard, lectureCardCss } from './LectureCard';
import { PersonalScheduleCard, personalScheduleCardCss } from './PersonalScheduleCard';
import type { PersonalSchedule } from '@features/schedules/personal-schedule';
import type { Lecture } from '../lectures/types';
import styles from './CalendarCell.module.css';
import css from './CalendarCell.module.css?inline';

export const calendarCellCss = [css, lectureCardCss, personalScheduleCardCss].join('\n');

export interface GoogleCalendarMatchResponse {
  connected: boolean;
  matched: Record<string, boolean>;
  error?: string;
}

export interface EventEntry {
  isPersonal: boolean;
  data: Lecture | PersonalSchedule;
  timeKey: string;
  ended: boolean;
}

export interface CalendarCellProps {
  dateStr: string;
  isToday: boolean;
  isPast: boolean;
  formattedDateText: string;
  events: EventEntry[];
  googleCalendarMatch: GoogleCalendarMatchResponse;
  registeredFeedbackIds: Set<string>;
  onAddPersonal(dateStr: string): void;
  onEditPersonal(ps: PersonalSchedule): void;
  onDeletePersonal(ps: PersonalSchedule): void | Promise<void>;
  onCancelLecture(somaLectureId: string): void;
}

export function CalendarCell({
  dateStr,
  isToday,
  isPast,
  formattedDateText,
  events,
  googleCalendarMatch,
  registeredFeedbackIds,
  onAddPersonal,
  onEditPersonal,
  onDeletePersonal,
  onCancelLecture,
}: CalendarCellProps) {
  return (
    <div
      className={cx(styles.calendarCell, { [styles.pastDay]: isPast })}
      data-calendar-date={dateStr}
    >
      <div className={styles.calendarDateHeaderRow}>
        <div className={styles.calendarDateLeft}>
          {isToday && <span className={styles.todayBadge}>오늘</span>}
          <span className={styles.calendarDate}>{formattedDateText}</span>
        </div>
        <button
          className={styles.quickAddCellBtn}
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
        const missingFromGoogleCalendar =
          googleCalendarMatch.connected &&
          !evt.ended &&
          Boolean(lec.somaLectureId) &&
          googleCalendarMatch.matched[lec.somaLectureId] === false;
        const justRegistered =
          !missingFromGoogleCalendar &&
          Boolean(lec.somaLectureId) &&
          registeredFeedbackIds.has(lec.somaLectureId);
        return (
          <LectureCard
            key={`l-${lec.somaLectureId || idx}`}
            lec={lec}
            ended={evt.ended}
            missingFromGoogleCalendar={missingFromGoogleCalendar}
            justRegistered={justRegistered}
            onCancel={() => onCancelLecture(lec.somaLectureId)}
          />
        );
      })}
    </div>
  );
}
