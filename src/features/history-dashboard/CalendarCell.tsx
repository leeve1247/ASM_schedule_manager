// One day-cell in the 14-day dashboard grid. Renders the date header with a
// quick-add button and the ordered list of LectureCard / PersonalScheduleCard
// entries.

import { cx } from '@shared/ui/cx';
import { LectureCard, lectureCardCss } from './LectureCard';
import { PersonalScheduleCard, personalScheduleCardCss } from './PersonalScheduleCard';
import type { Lecture } from './types';
import type { PersonalSchedule } from '@features/schedules/personal-schedule';
import css from './CalendarCell.css?inline';

export const calendarCellCss = [css, lectureCardCss, personalScheduleCardCss].join('\n');

export interface GcalMatchResponse {
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
  gcalMatch: GcalMatchResponse;
  registeredFeedbackIds: Set<string>;
  onAddPersonal(dateStr: string): void;
  onEditPersonal(ps: PersonalSchedule): void;
  onDeletePersonal(ps: PersonalSchedule): void | Promise<void>;
  onCancelLecture(qustnrSn: string): void;
}

export function CalendarCell({
  dateStr,
  isToday,
  isPast,
  formattedDateText,
  events,
  gcalMatch,
  registeredFeedbackIds,
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
        const justRegistered =
          !missingFromGcal &&
          Boolean(lec.qustnrSn) &&
          registeredFeedbackIds.has(lec.qustnrSn);
        return (
          <LectureCard
            key={`l-${lec.qustnrSn || idx}`}
            lec={lec}
            ended={evt.ended}
            missingFromGcal={missingFromGcal}
            justRegistered={justRegistered}
            onCancel={() => onCancelLecture(lec.qustnrSn)}
          />
        );
      })}
    </div>
  );
}
