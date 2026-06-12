// One personal-schedule entry inside a CalendarCell. Two flavors:
// - fixed shared (공통 일정) — no edit/delete buttons
// - regular personal — full edit / delete actions

import { Icon } from '@shared/ui/Icon';
import { cx } from '@shared/ui/cx';
import { ExportSlot } from '@shared/ui/ExportSlot';
import { kstToIso } from '@shared/date/date-time';
import type { PersonalSchedule } from '@features/schedules/personal-schedule';
import cellStyles from './CalendarCell.module.css';
import styles from './PersonalScheduleCard.module.css';
import css from './PersonalScheduleCard.module.css?inline';

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
      className={cx(
        cellStyles.calendarLecture,
        styles.eventPersonal,
        {
          [cellStyles.ended]: ended,
          [styles.ended]: ended,
        },
      )}
      title={ps.title}
    >
      <div className={cellStyles.infoGroup}>
        <div className={cellStyles.textTitle} data-role="title">
          {ps.title}
        </div>
        <div className={cx(cellStyles.textTypeBadge, styles.personalBadge)}>
          <Icon name={ps.isFixedShared ? 'pin' : 'user'} size={12} />
          <span>{ps.isFixedShared ? '공통 일정' : '개인 일정'}</span>
        </div>
        <div className={cellStyles.infoRow} data-role="time">
          <strong>시간</strong> {ps.startTime} ~ {ps.endTime}
        </div>
        {ps.locationType && (
          <div className={cellStyles.infoRow} data-role="location">
            <strong>장소</strong> {locationLabel}
            {ps.location ? ` · ${ps.location}` : ''}
          </div>
        )}
        {ps.description && (
          <div className={cx(cellStyles.infoRow, cellStyles.descRow)} data-role="desc">
            <strong>메모</strong> {ps.description}
          </div>
        )}
      </div>

      {exporter && (
        <ExportSlot
          className={cellStyles.exportGroup}
          uid={ps.id ? `personal-${ps.id}@asm-schedule-manager` : undefined}
          title={ps.title}
          description={ps.description || ''}
          location={ps.location || ''}
          startsAt={kstToIso(ps.dateStr, ps.startTime)}
          endsAt={kstToIso(ps.dateStr, ps.endTime)}
          filenameBase={ps.title}
        />
      )}

      {!ps.isFixedShared && (
        <div className={cellStyles.buttonGroup}>
          <button
            className={styles.editBtn}
            title="개인 일정 수정"
            onClick={(e) => {
              e.preventDefault();
              onEdit();
            }}
          >
            수정
          </button>
          <button
            className={styles.deleteBtn}
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
