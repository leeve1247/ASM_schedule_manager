// One event card in the mentoLec board. Wraps category / location / status
// badges, title, time, capacity, the SOMA detail link, and the GCal/ICS
// export buttons (bridged through lib/ExportSlot).

import { useCallback, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { classifyLocation } from '@shared/soma/location';
import { getSafeSomaUrl } from '@shared/soma/safe-url';
import { cx } from '@shared/ui/cx';
import { Icon } from '@shared/ui/Icon';
import type { IconName } from '@shared/ui/icons';
import { ExportSlot } from '@shared/ui/ExportSlot';
import type { EventRecord } from './events';

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return <span className={cx('asm-badge', className)}>{children}</span>;
}

function IconBadge({
  icon,
  text,
  className,
}: {
  icon: IconName;
  text: string;
  className: string;
}) {
  return (
    <span className={cx('asm-badge', 'asm-badge-icon', className)}>
      <Icon name={icon} size={12} />
      <span>{text}</span>
    </span>
  );
}

export interface EventCardProps {
  ev: EventRecord;
  todayStr: string;
}

export function EventCard({ ev, todayStr }: EventCardProps) {
  const isPast = ev.date < todayStr;
  const isGray = isPast || ev.isClosed;
  const safeUrl = getSafeSomaUrl(ev.url);
  const exporter = globalThis.ASMCalendarExport;
  const locInfo = ev.location ? classifyLocation(ev.location) : null;

  const openLecture = useCallback(() => {
    if (safeUrl) window.open(safeUrl, '_blank', 'noopener');
  }, [safeUrl]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLecture();
      }
    },
    [openLecture],
  );

  const statusLabel = isPast ? '진행완료' : ev.isClosed ? '마감' : '접수중';
  const statusCls = isPast ? 'asm-done' : ev.isClosed ? 'asm-closed' : 'asm-open-badge';

  const exportDescription = useMemo(() => {
    const safe = getSafeSomaUrl(ev.url);
    return [
      ev.categoryNm,
      ev.author ? `${ev.author} 멘토` : '',
      safe ? `상세: ${safe}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [ev.categoryNm, ev.author, ev.url]);

  return (
    <div
      className={cx(
        'asm-event-card',
        isGray ? 'asm-card-gray' : `asm-card-open asm-cat-${ev.category}`,
        {
          'asm-card-conflict': ev.hasMentoringConflict,
          'asm-card-personal-conflict': ev.hasPersonalConflict,
          'asm-card-enrolled': ev.isEnrolled,
        },
      )}
      role="link"
      tabIndex={0}
      onClick={openLecture}
      onKeyDown={handleKeyDown}
    >
      <div className="asm-card-badges">
        <span className={cx('asm-badge', 'asm-cat-badge', `asm-cat-${ev.category}`)}>
          {ev.categoryNm}
        </span>

        {locInfo ? (
          <Badge className={locInfo.type === 'online' ? 'asm-online' : 'asm-offline'}>
            {locInfo.label}
          </Badge>
        ) : ev.title.includes('[온라인]') || ev.title.includes('(온라인)') ? (
          <Badge className="asm-online">온라인</Badge>
        ) : ev.title.includes('[오프라인]') || ev.title.includes('(오프라인)') ? (
          <Badge className="asm-offline">오프라인</Badge>
        ) : null}

        <Badge className={statusCls}>{statusLabel}</Badge>

        {ev.isEnrolled && <IconBadge icon="check" text="수강중" className="asm-enrolled" />}

        {ev.hasPersonalConflict && (
          <Badge className="asm-personal-conflict">개인일정주의</Badge>
        )}

        {ev.hasMentoringConflict && (
          <Badge className="asm-conflict">멘토링일정주의</Badge>
        )}
      </div>

      <div className="asm-card-title">{ev.title}</div>

      <div className="asm-card-footer">
        {ev.author && <div className="asm-card-author">{ev.author} 멘토</div>}
        {ev.timeStart && (
          <div className="asm-card-time">
            {ev.timeStart} ~ {ev.timeEnd}
          </div>
        )}
        <div className="asm-card-footer-bottom">
          {ev.current !== '' && ev.total !== '' ? (
            <span className="asm-cap">
              {ev.current}/{ev.total}명
            </span>
          ) : (
            <span />
          )}
          <a
            className="asm-card-link"
            href={safeUrl || '#'}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
          >
            바로가기 →
          </a>
        </div>
        {ev.timeStart && ev.timeEnd && ev.date && exporter && (
          <ExportSlot
            className="asm-card-export-row"
            title={ev.title}
            description={exportDescription}
            location={ev.location || ''}
            startsAt={exporter.kstToIso(ev.date, ev.timeStart)}
            endsAt={exporter.kstToIso(ev.date, ev.timeEnd)}
            filenameBase={ev.title}
          />
        )}
      </div>
    </div>
  );
}
