// One enrolled-lecture card inside a CalendarCell. Shows mentor/time/
// location/status, a SOMA detail link wrapping the info block, and a
// cancel button (or a disabled "취소 불가" pill).

import { useMemo } from 'react';
import { Icon } from '../lib/Icon';
import { cx } from '../lib/cx';
import { ExportSlot } from '../lib/ExportSlot';
import { parseLectureDateTimeText } from '../lib/date-time';
import { getSafeSomaUrl } from '../lib/safe-url';
import type { Lecture } from './types';

export interface LectureCardProps {
  lec: Lecture;
  ended: boolean;
  missingFromGcal: boolean;
  onCancel(): void;
}

export function LectureCard({ lec, ended, missingFromGcal, onCancel }: LectureCardProps) {
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
          className="export-group"
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
