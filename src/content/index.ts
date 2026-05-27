// SOMA mentoring board enhancement (content script for mentoLec list pages).
// Replaces the default SOMA monthly calendar UI with a richer panel that adds
// fetched-on-demand details (capacity, location), conflict warnings against the
// user's enrolled lectures and personal schedules, and export buttons (via
// ASMCalendarExport on the global object).

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
import { collectEvents, filterEventsBySearch, type EventRecord } from './events';
import { buildPanel } from './panel';
import type { SearchDraft } from './search-row';
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

if (location.href.includes('mentoLec')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}

async function init(): Promise<void> {
  const calWrapEl = document.querySelector('.mypageCalendar.wrap');
  if (!calWrapEl) return;
  const calWrap: Element = calWrapEl;

  let currentOffset = 0;
  let allEvents: EventRecord[] = [];
  let personalSchedules: PersonalSchedule[] = [];
  let mentoringSchedules: MentoringSchedule[] = [];

  let appliedSearchType: 'title' | 'author' = 'title';
  let appliedSearchKeyword = '';

  let draftSearchType: 'title' | 'author' = 'title';
  let draftSearchKeyword = '';

  let isPanelCollapsed = false;
  let isRefreshing = false;

  function getFilteredEvents(): EventRecord[] {
    const { start, end } = getMonthRange(currentOffset);
    const s = toDateStr(start);
    const e = toDateStr(end);

    const monthEvents = allEvents.map((ev) => ({ ...ev })).filter((ev) => ev.date >= s && ev.date <= e);

    return filterEventsBySearch(monthEvents, appliedSearchType, appliedSearchKeyword);
  }

  function withLocations(events: EventRecord[]): EventRecord[] {
    const cache = getLocCacheMemory();

    return events.map((ev) => {
      const withConflict = hasPersonalScheduleConflict(ev, personalSchedules);
      const withMentoringConflict = hasMentoringScheduleConflict(ev, mentoringSchedules);
      const isEnrolled = ev.sn ? mentoringSchedules.some((ms) => ms.qustnrSn === ev.sn) : false;

      if (ev.sn && cache.has(ev.sn)) {
        return {
          ...ev,
          location: cache.get(ev.sn) || null,
          hasPersonalConflict: withConflict,
          hasMentoringConflict: withMentoringConflict,
          isEnrolled,
        };
      }

      return {
        ...ev,
        hasPersonalConflict: withConflict,
        hasMentoringConflict: withMentoringConflict,
        isEnrolled,
      };
    });
  }

  function renderPanel(events: EventRecord[], loadingMessage: string | null, focusSearch = false): void {
    const existing = document.getElementById('asm-2week-panel');

    const searchDraft: SearchDraft = {
      type: draftSearchType,
      keyword: draftSearchKeyword,
    };

    const { panel } = buildPanel(
      events,
      loadingMessage,
      currentOffset,
      navigate,
      searchDraft,
      handleSearchDraftChange,
      handleSearchSubmit,
      handleSearchReset,
      isPanelCollapsed,
      handleToggleCollapsed,
      handleRefresh,
      isRefreshing
    );

    if (existing && existing.parentNode) {
      existing.parentNode.replaceChild(panel, existing);
    } else {
      const tabs = document.querySelector('.tabs-st1');
      if (tabs && tabs.parentNode) {
        tabs.parentNode.insertBefore(panel, tabs.nextSibling);
      } else if (calWrap.parentNode) {
        calWrap.parentNode.insertBefore(panel, calWrap);
      }
    }

    if (focusSearch) {
      const input = panel.querySelector<HTMLInputElement>('.asm-search-input');
      if (input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }
  }

  function handleSearchDraftChange(nextType: 'title' | 'author', nextKeyword: string): void {
    draftSearchType = nextType;
    draftSearchKeyword = nextKeyword;
  }

  function handleSearchSubmit(nextType: 'title' | 'author', nextKeyword: string): void {
    draftSearchType = nextType;
    draftSearchKeyword = nextKeyword;
    appliedSearchType = nextType;
    appliedSearchKeyword = nextKeyword;

    renderPanel(withLocations(getFilteredEvents()), null, true);
  }

  function handleSearchReset(): void {
    draftSearchType = 'title';
    draftSearchKeyword = '';
    appliedSearchType = 'title';
    appliedSearchKeyword = '';

    renderPanel(withLocations(getFilteredEvents()), null, true);
  }

  function handleToggleCollapsed(): void {
    isPanelCollapsed = !isPanelCollapsed;
    renderPanel(withLocations(getFilteredEvents()), null);
  }

  function locMessage(done: number, total: number): string {
    return `장소 정보 가져오는 중… (${done}/${total})`;
  }

  // 패널 전체 리렌더 없이 헤더의 로딩 표시만 in-place로 갱신.
  // fetchLocations 진행 중 매 배치마다 renderPanel을 부르면 day panel이 통째로 새로 만들어져 깜빡임.
  function updateLoadingIndicator(msg: string | null): void {
    const el = document.getElementById('asm-panel-loading');
    if (!el) return;
    el.innerHTML = '';
    if (msg) {
      const spinner = document.createElement('span');
      spinner.className = 'asm-loading-spinner';
      const text = document.createElement('span');
      text.textContent = msg;
      el.appendChild(spinner);
      el.appendChild(text);
    }
  }

  async function handleRefresh(): Promise<void> {
    if (isRefreshing) return;
    isRefreshing = true;
    renderPanel(withLocations(getFilteredEvents()), '강의 목록 동기화 중…');

    try {
      await removeCacheEntries([STABLE_CACHE_KEY, COUNT_CACHE_KEY, LOC_CACHE_KEY]);
      clearLocCacheMemory();
      await removeChromeStorage(['soma_mentoring_schedules', 'soma_mentoring_schedules_ts']);

      [personalSchedules, mentoringSchedules] = await Promise.all([
        loadPersonalSchedules(),
        loadMentoringSchedules(),
      ]);

      const completeMap = await buildCompleteEventMap();
      allEvents = collectEvents(completeMap);
      renderPanel(withLocations(getFilteredEvents()), '장소 정보 가져오는 중…');

      await fetchLocations(getFilteredEvents(), (done, total) => {
        updateLoadingIndicator(locMessage(done, total));
      });
    } finally {
      isRefreshing = false;
      renderPanel(withLocations(getFilteredEvents()), null);
    }
  }

  async function navigate(newOffset: number): Promise<void> {
    currentOffset = newOffset;

    renderPanel(withLocations(getFilteredEvents()), null);

    await fetchLocations(getFilteredEvents(), (done, total) => {
      updateLoadingIndicator(locMessage(done, total));
    });

    renderPanel(withLocations(getFilteredEvents()), null);
  }

  const [, stableCache, countCache] = await Promise.all([loadLocCache(), loadStableCache(), loadCountCache()]);

  [personalSchedules, mentoringSchedules] = await Promise.all([
    loadPersonalSchedules(),
    loadMentoringSchedules(),
  ]);
  const initialMap = parseTableRows(document);
  allEvents = collectEvents(initialMap);
  renderPanel(
    withLocations(getFilteredEvents()),
    stableCache && countCache ? null : '강의 목록 동기화 중…'
  );

  const completeMap = await buildCompleteEventMap();
  allEvents = collectEvents(completeMap);
  renderPanel(withLocations(getFilteredEvents()), '장소 정보 가져오는 중…');

  await fetchLocations(getFilteredEvents(), (done, total) => {
    updateLoadingIndicator(locMessage(done, total));
  });
  renderPanel(withLocations(getFilteredEvents()), null);
}
