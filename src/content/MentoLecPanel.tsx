// SOMA mentoLec board enhancement — orchestrator. State (month offset,
// search, collapsed, refresh, loadingMessage, selectedDate, infoOpen,
// loc-cache version) lives here; the header / search row / info popover /
// event grid / day events are split into their own files.
//
// Mounted once inside a Shadow DOM; content.css is injected at the boundary
// so the existing global selectors keep working without a BEM rewrite.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
import { getMonthRange, toDateStr } from '../lib/date-time';
import { removeCacheEntries } from '../lib/cache';
import { removeChromeStorage } from '../lib/storage';
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
import { cx } from '../lib/cx';
import { SearchRow, type SearchState } from './SearchRow';
import { InfoPopover } from './InfoPopover';
import { DayEventPanel } from './DayEventPanel';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const ENROLLMENT_LOADING_MESSAGE = '수강중·겹침 표시 확인 중…';
const LIST_STATUS_LOADING_MESSAGE = '정원·마감 표시 확인 중…';

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
      setLoadingMessage(ENROLLMENT_LOADING_MESSAGE);
      const [ps, ms] = await Promise.all([
        loadPersonalSchedules(),
        loadMentoringSchedules(),
      ]);
      setPersonalSchedules(ps);
      setMentoringSchedules(ms);

      const initialMap = parseTableRows(document);
      setAllEvents(collectEvents(initialMap));
      if (!(stableCache && countCache)) {
        setLoadingMessage(LIST_STATUS_LOADING_MESSAGE);
      } else {
        setLoadingMessage(null);
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

      setLoadingMessage(ENROLLMENT_LOADING_MESSAGE);
      const [ps, ms] = await Promise.all([
        loadPersonalSchedules(),
        loadMentoringSchedules(),
      ]);
      setPersonalSchedules(ps);
      setMentoringSchedules(ms);

      setLoadingMessage(LIST_STATUS_LOADING_MESSAGE);
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
