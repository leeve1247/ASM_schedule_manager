// One enrolled-lecture card inside a CalendarCell. Shows mentor/time/
// location/status, a SOMA detail link wrapping the info block, and a
// cancel button (or a disabled "취소 불가" pill).

import { useMemo, useState } from 'react';
import { Icon } from '@shared/ui/Icon';
import { cx } from '@shared/ui/cx';
import { ExportSlot } from '@shared/ui/ExportSlot';
import { kstToIso, parseLectureDateTimeText } from '@shared/date/date-time';
import { getSafeSomaUrl } from '@shared/soma/safe-url';
import type { Lecture } from '../lectures/types';
import cellStyles from './CalendarCell.module.css';
import styles from './LectureCard.module.css';
import css from './LectureCard.module.css?inline';

export const lectureCardCss = css;

export interface LectureCardProps {
  lec: Lecture;
  ended: boolean;
  missingFromGoogleCalendar: boolean;
  justRegistered: boolean;
  onCancel(): void;
}

export function LectureCard({
  lec,
  ended,
  missingFromGoogleCalendar,
  justRegistered,
  onCancel,
}: LectureCardProps) {
  const parsed = useMemo(
    () => parseLectureDateTimeText(lec.dateTimeText),
    [lec.dateTimeText],
  );
  const timeStr = parsed
    ? `${parsed.sh}:${parsed.sm} ~ ${parsed.eh}:${parsed.em}`
    : lec.dateTimeText;

  const isSpecial = lec.type.includes('특강');
  const safeUrl = getSafeSomaUrl(lec.url);
  const exporter = globalThis.ASMCalendarExport;

  // Mentor-deleted lectures collapse their detail rows + actions behind a toggle
  // (the lecture is gone, so the info is low-value clutter by default).
  const [expanded, setExpanded] = useState(false);
  const collapsible = lec.mentorDeleted;
  const detailsVisible = !collapsible || expanded;

  const exportDateStr = parsed ? `${parsed.y}-${parsed.m}-${parsed.d}` : '';
  const exportStarts = parsed ? kstToIso(exportDateStr, `${parsed.sh}:${parsed.sm}`) : null;
  const exportEnds = parsed ? kstToIso(exportDateStr, `${parsed.eh}:${parsed.em}`) : null;

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
        cellStyles.calendarLecture,
        isSpecial ? styles.special : styles.mentoring,
        {
          [cellStyles.ended]: ended,
          [styles.notInGoogleCalendar]: missingFromGoogleCalendar,
          [styles.googleCalendarJustRegistered]: justRegistered,
          [styles.mentorDeleted]: lec.mentorDeleted,
        },
      )}
      title={lec.title}
    >
      <a className={cellStyles.infoGroup} href={safeUrl || undefined}>
        <div className={cellStyles.textTitle} data-role="title">
          {lec.title}
        </div>
        {detailsVisible && (
          <>
            <div className={cellStyles.textTypeBadge} data-role="type">{lec.type}</div>
            <div className={cellStyles.infoRow} data-role="mentor">
              <strong>멘토</strong> {lec.mentorName}
            </div>
            <div className={cellStyles.infoRow} data-role="time">
              <strong>시간</strong> {timeStr}
            </div>
            <div className={cellStyles.infoRow} data-role="location">
              <strong>장소</strong> {lec.location}
            </div>
            <div className={cellStyles.infoRow} data-role="people">
              <strong>신청인원</strong> {lec.people}
            </div>
            <div className={cellStyles.infoRow} data-role="approval">
              <strong>개설승인</strong> {lec.approvalStatus}
            </div>
            <div className={cellStyles.infoRow} data-role="status">
              <strong>상태</strong> {lec.deadlineStatus}
            </div>
          </>
        )}
      </a>

      {collapsible && (
        <button
          type="button"
          className={styles.expandToggle}
          aria-expanded={expanded}
          onClick={(e) => {
            e.preventDefault();
            setExpanded((v) => !v);
          }}
        >
          <span>{expanded ? '접기' : '펼치기'}</span>
          <Icon
            name="chevronDown"
            size={12}
            className={cx(styles.chevron, { [styles.expanded]: expanded })}
          />
        </button>
      )}

      {detailsVisible && (
        <div className={cellStyles.buttonGroup}>
          {lec.cancelAllowed ? (
            <button
              className={styles.cancelBtn}
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
              className={cx(styles.cancelBtn, styles.unavailable)}
              title={ended ? '종료된 일정이므로 취소 불가' : lec.cancelPolicyReason}
              disabled
            >
              <Icon name="ban" size={12} />
              <span>취소 불가</span>
            </button>
          )}
        </div>
      )}

      {detailsVisible && exporter && (
        <ExportSlot
          className={cellStyles.exportGroup}
          uid={lec.somaLectureId ? `lecture-${lec.somaLectureId}@asm-schedule-manager` : undefined}
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
