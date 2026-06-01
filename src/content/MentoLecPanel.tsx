// SOMA mentoLec board enhancement — React port of buildPanel + card +
// search-row + the init() orchestrator that previously lived in content/index.ts.
// Mounted once inside a Shadow DOM; content.css is injected at the boundary
// so the existing global selectors keep working without a BEM rewrite.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  STABLE_CACHE_KEY,
  COUNT_CACHE_KEY,
  buildCompleteEventMap,
  loadCountCache,
  loadStableCache,
  parseTableRows,
} from './list-cache';
import {
  LOC_CACHE_KEY,
  clearLocCacheMemory,
  fetchLocations,
  getLocCacheMemory,
  loadLocCache,
} from './loc-cache';
import {
  collectEvents,
  filterEventsBySearch,
  sortEventsByStatusTimeAuthor,
  type EventRecord,
} from './events';
import { DAY_KO, getMonthRange, toDateStr } from '../lib/date-time';
import { removeCacheEntries } from '../lib/cache';
import { removeChromeStorage } from '../lib/storage';
import { classifyLocation } from '../lib/location';
import { getSafeSomaUrl } from '../lib/safe-url';
import {
  loadPersonalSchedules,
  type PersonalSchedule,
} from '../lib/personal-schedule';
import {
  loadMentoringSchedules,
  type MentoringSchedule,
} from '../lib/mentoring-schedule';
import {
  hasMentoringScheduleConflict,
  hasPersonalScheduleConflict,
} from '../lib/conflict';
import { Icon } from '../lib/Icon';
import type { IconName } from '../lib/icons';
import { cx } from '../lib/cx';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type SearchType = 'title' | 'author';
interface SearchState {
  type: SearchType;
  keyword: string;
}

function locMessage(done: number, total: number): string {
  return `장소 정보 가져오는 중… (${done}/${total})`;
}

function enrichEvent(
  ev: EventRecord,
  locCache: Map<string, string>,
  personalSchedules: PersonalSchedule[],
  mentoringSchedules: MentoringSchedule[],
): EventRecord {
  const hasPersonalConflict = hasPersonalScheduleConflict(ev, personalSchedules);
  const hasMentoringConflict = hasMentoringScheduleConflict(ev, mentoringSchedules);
  const isEnrolled = ev.sn ? mentoringSchedules.some((ms) => ms.qustnrSn === ev.sn) : false;
  if (ev.sn && locCache.has(ev.sn)) {
    return {
      ...ev,
      location: locCache.get(ev.sn) || null,
      hasPersonalConflict,
      hasMentoringConflict,
      isEnrolled,
    };
  }
  return { ...ev, hasPersonalConflict, hasMentoringConflict, isEnrolled };
}

// ─── Sub-components ─────────────────────────────────────────────────────

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

interface ExportSlotProps {
  title: string;
  description: string;
  location: string;
  startsAt: string | null;
  endsAt: string | null;
  filenameBase: string;
}

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

  return <div className="asm-card-export-row" ref={ref} />;
}

interface EventCardProps {
  ev: EventRecord;
  todayStr: string;
}

function EventCard({ ev, todayStr }: EventCardProps) {
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

interface SearchRowProps {
  draft: SearchState;
  focusVersion: number;
  onChange(next: SearchState): void;
  onSubmit(next: SearchState): void;
  onReset(): void;
}

function SearchRow({ draft, focusVersion, onChange, onSubmit, onReset }: SearchRowProps) {
  const [isComposing, setIsComposing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusVersion === 0) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
  }, [focusVersion]);

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // 한글 IME 조합 중 Enter 는 무시
    if (e.nativeEvent.isComposing || isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      onSubmit(draft);
    }
  };

  return (
    <div className="asm-search-row">
      <select
        className="asm-search-select"
        value={draft.type}
        onChange={(e) => onChange({ ...draft, type: e.target.value as SearchType })}
      >
        <option value="title">제목</option>
        <option value="author">작성자</option>
      </select>
      <div className="asm-search-box">
        <input
          ref={inputRef}
          className="asm-search-input"
          type="text"
          placeholder="검색어를 입력해주세요."
          value={draft.keyword}
          onChange={(e) => onChange({ ...draft, keyword: e.target.value })}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setIsComposing(false);
            onChange({ ...draft, keyword: (e.target as HTMLInputElement).value });
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="asm-search-btn"
          onClick={(e) => {
            e.preventDefault();
            onSubmit(draft);
          }}
        >
          검색
        </button>
      </div>
      <button
        type="button"
        className="asm-search-reset"
        onClick={(e) => {
          e.preventDefault();
          onReset();
        }}
      >
        초기화
      </button>
    </div>
  );
}

interface InfoPopoverProps {
  open: boolean;
  onToggle(): void;
  onClose(): void;
}

function InfoPopover({ open, onToggle, onClose }: InfoPopoverProps) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handler = (e: globalThis.MouseEvent) => {
      const path = e.composedPath();
      if (!path.includes(wrap)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open, onClose]);

  return (
    <div className="asm-panel-info-wrap" ref={wrapRef}>
      <button
        type="button"
        className="asm-panel-info-btn"
        title="자동 갱신 안내"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        !
      </button>
      <div
        className={cx('asm-panel-info-popover', { 'asm-panel-info-popover--open': open })}
        aria-hidden={!open}
      >
        <div className="asm-info-title">자동 갱신 주기</div>
        <table className="asm-info-table">
          <tbody>
            <tr>
              <td>수강자수</td>
              <td>
                <b>5분</b>
              </td>
            </tr>
            <tr>
              <td>제목 · 시간 · 상태 · 장소</td>
              <td>
                <b>4시간</b>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="asm-info-divider" />
        <div className="asm-info-subtitle">새로고침이 필요한 경우</div>
        <ul className="asm-info-list">
          <li>방금 신청했는데 수강자수가 아직 반영이 안 됐을 때</li>
          <li>장소·시간이 변경됐다는 공지를 봤을 때</li>
          <li>갱신 주기 전에 즉시 최신 정보가 필요할 때</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────

export function MentoLecPanel() {
  const [currentOffset, setCurrentOffset] = useState(0);
  const [allEvents, setAllEvents] = useState<EventRecord[]>([]);
  const [personalSchedules, setPersonalSchedules] = useState<PersonalSchedule[]>([]);
  const [mentoringSchedules, setMentoringSchedules] = useState<MentoringSchedule[]>([]);

  const [searchDraft, setSearchDraft] = useState<SearchState>({ type: 'title', keyword: '' });
  const [appliedSearch, setAppliedSearch] = useState<SearchState>({
    type: 'title',
    keyword: '',
  });

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [locVersion, setLocVersion] = useState(0);
  const [searchFocusVersion, setSearchFocusVersion] = useState(0);

  const lastFetchedOffsetRef = useRef<number | null>(null);

  // ── Initial mount ──
  useEffect(() => {
    void (async () => {
      const [, stableCache, countCache] = await Promise.all([
        loadLocCache(),
        loadStableCache(),
        loadCountCache(),
      ]);
      const [ps, ms] = await Promise.all([
        loadPersonalSchedules(),
        loadMentoringSchedules(),
      ]);
      setPersonalSchedules(ps);
      setMentoringSchedules(ms);

      const initialMap = parseTableRows(document);
      setAllEvents(collectEvents(initialMap));
      if (!(stableCache && countCache)) {
        setLoadingMessage('강의 목록 동기화 중…');
      }

      const completeMap = await buildCompleteEventMap();
      setAllEvents(collectEvents(completeMap));
      // Location fetch is kicked off by the effect that depends on allEvents+offset
    })();
  }, []);

  // ── Range / filter ──
  const monthRange = useMemo(() => getMonthRange(currentOffset), [currentOffset]);
  const todayStr = useMemo(() => toDateStr(monthRange.today), [monthRange.today]);
  const startDateStr = useMemo(() => toDateStr(monthRange.start), [monthRange.start]);
  const endDateStr = useMemo(() => toDateStr(monthRange.end), [monthRange.end]);
  const defaultSelectedDate = currentOffset === 0 ? todayStr : startDateStr;

  const monthEvents = useMemo(
    () =>
      allEvents.filter((ev) => ev.date >= startDateStr && ev.date <= endDateStr),
    [allEvents, startDateStr, endDateStr],
  );

  // Used only as filter input — location enrichment is applied below.
  const filteredEvents = useMemo(
    () => filterEventsBySearch(monthEvents, appliedSearch.type, appliedSearch.keyword),
    [monthEvents, appliedSearch],
  );

  // locVersion is bumped by fetchLocations progress; it forces this memo
  // to re-evaluate the (non-React) locCacheMemory map.
  const enrichedFiltered = useMemo(() => {
    const cache = getLocCacheMemory();
    return filteredEvents.map((ev) =>
      enrichEvent(ev, cache, personalSchedules, mentoringSchedules),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents, personalSchedules, mentoringSchedules, locVersion]);

  const byDate = useMemo(() => {
    const map = new Map<string, EventRecord[]>();
    for (let d = new Date(monthRange.start); d <= monthRange.end; d.setDate(d.getDate() + 1)) {
      map.set(toDateStr(new Date(d)), []);
    }
    enrichedFiltered.forEach((ev) => {
      const list = map.get(ev.date);
      if (list) list.push(ev);
    });
    return map;
  }, [enrichedFiltered, monthRange.start, monthRange.end]);

  // ── Auto-select default date on month change ──
  useEffect(() => {
    setSelectedDate(defaultSelectedDate);
  }, [defaultSelectedDate]);

  // ── Location fetch on offset / event-set change ──
  useEffect(() => {
    if (isRefreshing) return;
    if (allEvents.length === 0) return;
    if (lastFetchedOffsetRef.current === currentOffset) return;
    lastFetchedOffsetRef.current = currentOffset;

    void (async () => {
      setLoadingMessage('장소 정보 가져오는 중…');
      try {
        await fetchLocations(monthEvents, (done, total) => {
          setLoadingMessage(locMessage(done, total));
          setLocVersion((v) => v + 1);
        });
      } finally {
        setLoadingMessage(null);
        setLocVersion((v) => v + 1);
      }
    })();
  }, [currentOffset, allEvents, monthEvents, isRefreshing]);

  // ── Handlers ──
  const handleNavigate = useCallback((next: number) => {
    setCurrentOffset(next);
  }, []);

  const handleSearchChange = useCallback((next: SearchState) => {
    setSearchDraft(next);
  }, []);

  const handleSearchSubmit = useCallback((next: SearchState) => {
    setSearchDraft(next);
    setAppliedSearch(next);
    setSearchFocusVersion((v) => v + 1);
  }, []);

  const handleSearchReset = useCallback(() => {
    const reset: SearchState = { type: 'title', keyword: '' };
    setSearchDraft(reset);
    setAppliedSearch(reset);
    setSearchFocusVersion((v) => v + 1);
  }, []);

  const handleToggleCollapsed = useCallback(() => {
    setIsCollapsed((v) => !v);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setLoadingMessage('강의 목록 동기화 중…');
    try {
      await removeCacheEntries([STABLE_CACHE_KEY, COUNT_CACHE_KEY, LOC_CACHE_KEY]);
      clearLocCacheMemory();
      await removeChromeStorage(['soma_mentoring_schedules', 'soma_mentoring_schedules_ts']);

      const [ps, ms] = await Promise.all([
        loadPersonalSchedules(),
        loadMentoringSchedules(),
      ]);
      setPersonalSchedules(ps);
      setMentoringSchedules(ms);

      const completeMap = await buildCompleteEventMap();
      const fresh = collectEvents(completeMap);
      setAllEvents(fresh);

      setLoadingMessage('장소 정보 가져오는 중…');
      // After a full refresh the loc cache was wiped, so re-fetch unconditionally.
      lastFetchedOffsetRef.current = null;
      await fetchLocations(
        fresh.filter((ev) => ev.date >= startDateStr && ev.date <= endDateStr),
        (done, total) => {
          setLoadingMessage(locMessage(done, total));
          setLocVersion((v) => v + 1);
        },
      );
    } finally {
      // Tag the just-fetched offset so the auto-fetch effect doesn't re-run
      // for this same month when isRefreshing flips back to false.
      lastFetchedOffsetRef.current = currentOffset;
      setIsRefreshing(false);
      setLoadingMessage(null);
      setLocVersion((v) => v + 1);
    }
  }, [isRefreshing, currentOffset, startDateStr, endDateStr]);

  // ── Derived values for render ──
  const selectedDayEvents = useMemo(() => {
    if (!selectedDate) return null;
    const dayEvents = byDate.get(selectedDate) || [];
    return [...dayEvents].sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr));
  }, [selectedDate, byDate, todayStr]);

  const bodyStyle: CSSProperties = isCollapsed ? { display: 'none' } : {};

  // ── Render ──
  return (
    <div id="asm-2week-panel">
      <div className="asm-panel-header">
        <div className="asm-panel-title-wrap">
          <span className="asm-panel-ico">
            <Icon name="calendar" size={16} />
          </span>
          <span className="asm-panel-title">
            {monthRange.year}년 {monthRange.month + 1}월
          </span>
        </div>

        <div className="asm-panel-nav">
          <button
            type="button"
            className="asm-panel-nav-btn"
            title="이전 달"
            onClick={() => handleNavigate(currentOffset - 1)}
          >
            ‹ 이전 달
          </button>
          <button
            type="button"
            className={cx('asm-panel-nav-btn', 'asm-nav-today', {
              'asm-nav-today-current': currentOffset === 0,
            })}
            title="오늘이 포함된 달로 이동"
            onClick={() => handleNavigate(0)}
          >
            오늘
          </button>
          <button
            type="button"
            className="asm-panel-nav-btn"
            title="다음 달"
            onClick={() => handleNavigate(currentOffset + 1)}
          >
            다음 달 ›
          </button>
        </div>

        <div className="asm-panel-actions">
          <InfoPopover
            open={infoOpen}
            onToggle={() => setInfoOpen((v) => !v)}
            onClose={() => setInfoOpen(false)}
          />

          <span className="asm-panel-loading" id="asm-panel-loading">
            {loadingMessage && (
              <>
                <span className="asm-loading-spinner" />
                <span>{loadingMessage}</span>
              </>
            )}
          </span>

          <button
            type="button"
            className="asm-panel-refresh"
            title="새로고침"
            disabled={isRefreshing}
            onClick={(e) => {
              e.preventDefault();
              void handleRefresh();
            }}
          >
            <span
              className={cx('asm-refresh-icon', {
                'asm-refresh-icon--spinning': isRefreshing,
              })}
            >
              ↻
            </span>
          </button>

          <button
            type="button"
            className="asm-panel-toggle"
            onClick={(e) => {
              e.preventDefault();
              handleToggleCollapsed();
            }}
          >
            {isCollapsed ? '펼치기' : '접기'}
          </button>
        </div>
      </div>

      <div className="asm-panel-body" style={bodyStyle}>
        <div className="asm-cal-area">
          <SearchRow
            draft={searchDraft}
            focusVersion={searchFocusVersion}
            onChange={handleSearchChange}
            onSubmit={handleSearchSubmit}
            onReset={handleSearchReset}
          />

          <div className="asm-cal-section">
            <div className="asm-cal-weekdays">
              {WEEKDAYS.map((wd, i) => (
                <div
                  key={wd}
                  className={cx('asm-cal-wd', {
                    'asm-wd-weekend': i === 0 || i === 6,
                  })}
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="asm-cal-grid">
              {Array.from({ length: monthRange.start.getDay() }, (_, i) => (
                <div key={`empty-${i}`} className="asm-cal-day asm-cal-empty" />
              ))}
              {[...byDate.entries()].map(([dateStr, dayEvents]) => {
                const d = new Date(dateStr + 'T00:00:00');
                const isToday = dateStr === todayStr;
                const isPast = dateStr < todayStr;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const sortedDay = [...dayEvents].sort((a, b) =>
                  sortEventsByStatusTimeAuthor(a, b, todayStr),
                );
                const hasEvents = sortedDay.length > 0;
                const isSelected = selectedDate === dateStr;
                const maxDots = Math.min(sortedDay.length, 5);

                return (
                  <div
                    key={dateStr}
                    data-date={dateStr}
                    className={cx('asm-cal-day', {
                      'asm-cal-today': isToday,
                      'asm-cal-past': isPast,
                      'asm-cal-weekend': isWeekend,
                      'asm-cal-has-events': hasEvents,
                      'asm-cal-selected': isSelected,
                    })}
                    onClick={() => {
                      if (!hasEvents) return;
                      setSelectedDate((cur) => (cur === dateStr ? null : dateStr));
                    }}
                  >
                    <div className="asm-cal-daynum">{d.getDate()}</div>
                    {hasEvents && (
                      <>
                        <div className="asm-cal-cnt">{sortedDay.length}건</div>
                        <div className="asm-cal-dots">
                          {sortedDay.slice(0, maxDots).map((ev, i) => {
                            const isGray = ev.date < todayStr || ev.isClosed;
                            return (
                              <span
                                key={`${ev.sn || i}-dot`}
                                className={cx(
                                  'asm-dot',
                                  isGray ? 'asm-dot-gray' : `asm-dot-${ev.category}`,
                                )}
                              />
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="asm-calendar-notice">
            <div className="asm-calendar-notice-title">
              내가 신청한 멘토링 내역이 반영되지 않았다면?
            </div>
            <div className="asm-calendar-notice-body">
              접수 내역 페이지에 한 번 들렀다 오면 자동으로 반영됩니다.
            </div>
          </div>
        </div>

        <div className="asm-event-panel">
          {selectedDate && selectedDayEvents ? (
            <DayEventPanel
              dateStr={selectedDate}
              dayEvents={selectedDayEvents}
              todayStr={todayStr}
              loadingMessage={loadingMessage}
            />
          ) : loadingMessage ? (
            <div className="asm-event-panel-placeholder">
              <span className="asm-loading-spinner" />
              <span>{loadingMessage}</span>
            </div>
          ) : (
            <div className="asm-event-panel-placeholder">
              <span>
                날짜를 선택하면
                <br />
                일정이 표시됩니다
              </span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

interface DayEventPanelProps {
  dateStr: string;
  dayEvents: EventRecord[];
  todayStr: string;
  loadingMessage: string | null;
}

function DayEventPanel({ dateStr, dayEvents, todayStr, loadingMessage }: DayEventPanelProps) {
  const d = new Date(dateStr + 'T00:00:00');
  return (
    <>
      <div className="asm-event-panel-header">
        <span className="asm-event-panel-date">
          {d.getMonth() + 1}.{String(d.getDate()).padStart(2, '0')}({DAY_KO[d.getDay()]})
        </span>
        <span className="asm-event-panel-cnt">{dayEvents.length}건</span>
      </div>
      {dayEvents.length === 0 && loadingMessage ? (
        <div className="asm-cards-loading">
          <span className="asm-loading-spinner" />
          <span>{loadingMessage}</span>
        </div>
      ) : (
        <div className="asm-day-cards">
          {dayEvents.map((ev, i) => (
            <EventCard key={ev.sn || `${ev.title}-${i}`} ev={ev} todayStr={todayStr} />
          ))}
        </div>
      )}
    </>
  );
}
