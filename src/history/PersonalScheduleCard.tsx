// One personal-schedule entry inside a CalendarCell. Two flavors:
// - fixed shared (공통 일정) — no edit/delete buttons
// - regular personal — full edit / delete actions

import { Icon } from '../lib/Icon';
import { cx } from '../lib/cx';
import { ExportSlot } from '../lib/ExportSlot';
import type { PersonalSchedule } from '../lib/personal-schedule';
import css from './PersonalScheduleCard.css?inline';

export const personalScheduleCardCss = css;

export interface PersonalScheduleCardProps {
  ps: PersonalSchedule;
  ended: boolean;
  onEdit(): void;
  onDelete(): void | Promise<void>;
}

export function PersonalScheduleCard({
  ps,
  ended,
  onEdit,
  onDelete,
}: PersonalScheduleCardProps) {
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
          className="export-group"
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
