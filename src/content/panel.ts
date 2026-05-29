import type { EventRecord } from './events';
import { sortEventsByStatusTimeAuthor } from './events';
import { makeCard } from './card';
import { createSearchRow, type SearchCallback, type SearchDraft } from './search-row';
import { DAY_KO, getMonthRange, toDateStr } from '../lib/date-time';
import { iconHtml } from '../lib/icons';

function renderEventPanel(
  container: HTMLElement,
  dayEvents: EventRecord[],
  dateStr: string,
  todayStr: string,
  loadingMessage: string | null
): void {
  container.innerHTML = '';

  const d = new Date(dateStr + 'T00:00:00');

  const headerEl = document.createElement('div');
  headerEl.className = 'asm-event-panel-header';

  const dateLabel = document.createElement('span');
  dateLabel.className = 'asm-event-panel-date';
  dateLabel.textContent = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}(${DAY_KO[d.getDay()]})`;

  const cntLabel = document.createElement('span');
  cntLabel.className = 'asm-event-panel-cnt';
  cntLabel.textContent = `${dayEvents.length}건`;

  headerEl.appendChild(dateLabel);
  headerEl.appendChild(cntLabel);
  container.appendChild(headerEl);

  // 카드는 항상 표시 — 진행 상황은 패널 헤더의 asm-panel-loading에서 보여줌.
  // 장소 등 부분 정보가 비어 있어도 카드 자체는 보이게 해서 "오늘 먼저" 효과를 살림.
  if (dayEvents.length === 0 && loadingMessage) {
    const loadingRow = document.createElement('div');
    loadingRow.className = 'asm-cards-loading';
    const spinner = document.createElement('span');
    spinner.className = 'asm-loading-spinner';
    const span = document.createElement('span');
    span.textContent = loadingMessage;
    loadingRow.appendChild(spinner);
    loadingRow.appendChild(span);
    container.appendChild(loadingRow);
    return;
  }

  const cards = document.createElement('div');
  cards.className = 'asm-day-cards';

  [...dayEvents]
    .sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr))
    .forEach((ev) => cards.appendChild(makeCard(ev, todayStr)));

  container.appendChild(cards);
}

export interface BuildPanelResult {
  panel: HTMLDivElement;
  grid: HTMLDivElement;
  eventPanel: HTMLDivElement;
  byDate: Map<string, EventRecord[]>;
  selectedDate: () => string | null;
}

export function buildPanel(
  events: EventRecord[],
  loadingMessage: string | null,
  offset = 0,
  onNavigate: ((newOffset: number) => void) | null = null,
  searchDraft: SearchDraft = { type: 'title', keyword: '' },
  onSearchChange: SearchCallback | null = null,
  onSearchSubmit: SearchCallback | null = null,
  onSearchReset: (() => void) | null = null,
  isCollapsed = false,
  onToggleCollapsed: (() => void) | null = null,
  onRefresh: (() => void) | null = null,
  isRefreshing = false
): BuildPanelResult {
  const { start, end, today, year, month } = getMonthRange(offset);
  const todayStr = toDateStr(today);
  const defaultSelectedDate = offset === 0 ? todayStr : toDateStr(start);

  const byDate = new Map<string, EventRecord[]>();

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    byDate.set(toDateStr(new Date(d)), []);
  }

  events.forEach((ev) => {
    const list = byDate.get(ev.date);
    if (list) list.push(ev);
  });

  const panel = document.createElement('div');
  panel.id = 'asm-2week-panel';

  const header = document.createElement('div');
  header.className = 'asm-panel-header';

  const titleWrap = document.createElement('div');
  titleWrap.className = 'asm-panel-title-wrap';
  titleWrap.innerHTML = `<span class="asm-panel-ico">${iconHtml('calendar', { size: 16 })}</span><span class="asm-panel-title">${year}년 ${month + 1}월</span>`;

  header.appendChild(titleWrap);

  const navWrap = document.createElement('div');
  navWrap.className = 'asm-panel-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'asm-panel-nav-btn';
  prevBtn.textContent = '‹ 이전 달';
  prevBtn.title = '이전 달';
  prevBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onNavigate && onNavigate(offset - 1);
  });
  navWrap.appendChild(prevBtn);

  const todayBtn = document.createElement('button');
  todayBtn.type = 'button';
  todayBtn.className =
    offset === 0
      ? 'asm-panel-nav-btn asm-nav-today asm-nav-today-current'
      : 'asm-panel-nav-btn asm-nav-today';
  todayBtn.textContent = '오늘';
  todayBtn.title = '오늘이 포함된 달로 이동';
  todayBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onNavigate && onNavigate(0);
  });
  navWrap.appendChild(todayBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'asm-panel-nav-btn';
  nextBtn.textContent = '다음 달 ›';
  nextBtn.title = '다음 달';
  nextBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onNavigate && onNavigate(offset + 1);
  });
  navWrap.appendChild(nextBtn);

  header.appendChild(navWrap);

  const headerActions = document.createElement('div');
  headerActions.className = 'asm-panel-actions';

  const infoWrap = document.createElement('div');
  infoWrap.className = 'asm-panel-info-wrap';

  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'asm-panel-info-btn';
  infoBtn.textContent = '!';
  infoBtn.title = '자동 갱신 안내';

  const infoPopover = document.createElement('div');
  infoPopover.className = 'asm-panel-info-popover';
  infoPopover.setAttribute('aria-hidden', 'true');
  infoPopover.innerHTML = `
    <div class="asm-info-title">자동 갱신 주기</div>
    <table class="asm-info-table">
      <tr><td>수강자수</td><td><b>5분</b></td></tr>
      <tr><td>제목 · 시간 · 상태 · 장소</td><td><b>4시간</b></td></tr>
    </table>
    <div class="asm-info-divider"></div>
    <div class="asm-info-subtitle">새로고침이 필요한 경우</div>
    <ul class="asm-info-list">
      <li>방금 신청했는데 수강자수가 아직 반영이 안 됐을 때</li>
      <li>장소·시간이 변경됐다는 공지를 봤을 때</li>
      <li>갱신 주기 전에 즉시 최신 정보가 필요할 때</li>
    </ul>
  `;

  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = infoPopover.classList.toggle('asm-panel-info-popover--open');
    infoPopover.setAttribute('aria-hidden', String(!isOpen));
  });

  document.addEventListener('click', function closePopover(e) {
    if (!infoWrap.contains(e.target as Node)) {
      infoPopover.classList.remove('asm-panel-info-popover--open');
      infoPopover.setAttribute('aria-hidden', 'true');
    }
  });

  infoWrap.appendChild(infoBtn);
  infoWrap.appendChild(infoPopover);
  headerActions.appendChild(infoWrap);

  const loadingEl = document.createElement('span');
  loadingEl.className = 'asm-panel-loading';
  loadingEl.id = 'asm-panel-loading';
  if (loadingMessage) {
    const spinner = document.createElement('span');
    spinner.className = 'asm-loading-spinner';
    const text = document.createElement('span');
    text.textContent = loadingMessage;
    loadingEl.appendChild(spinner);
    loadingEl.appendChild(text);
  }
  headerActions.appendChild(loadingEl);

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'asm-panel-refresh';
  refreshBtn.title = '새로고침';
  const refreshIcon = document.createElement('span');
  refreshIcon.className = 'asm-refresh-icon' + (isRefreshing ? ' asm-refresh-icon--spinning' : '');
  refreshIcon.textContent = '↻';
  refreshBtn.appendChild(refreshIcon);
  refreshBtn.disabled = isRefreshing;
  refreshBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onRefresh && onRefresh();
  });
  headerActions.appendChild(refreshBtn);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'asm-panel-toggle';
  toggleBtn.textContent = isCollapsed ? '펼치기' : '접기';
  headerActions.appendChild(toggleBtn);

  header.appendChild(headerActions);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'asm-panel-body';
  body.style.display = isCollapsed ? 'none' : '';

  toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    onToggleCollapsed && onToggleCollapsed();
  });

  const wdRow = document.createElement('div');
  wdRow.className = 'asm-cal-weekdays';

  ['일', '월', '화', '수', '목', '금', '토'].forEach((wd, i) => {
    const cell = document.createElement('div');
    cell.className = `asm-cal-wd${i === 0 || i === 6 ? ' asm-wd-weekend' : ''}`;
    cell.textContent = wd;
    wdRow.appendChild(cell);
  });

  const grid = document.createElement('div');
  grid.className = 'asm-cal-grid';

  const eventPanel = document.createElement('div');
  eventPanel.className = 'asm-event-panel';

  function showPlaceholder() {
    if (loadingMessage) {
      eventPanel.innerHTML = '';
      const ph = document.createElement('div');
      ph.className = 'asm-event-panel-placeholder';
      const spinner = document.createElement('span');
      spinner.className = 'asm-loading-spinner';
      const text = document.createElement('span');
      text.textContent = loadingMessage;
      ph.appendChild(spinner);
      ph.appendChild(text);
      eventPanel.appendChild(ph);
    } else {
      eventPanel.innerHTML =
        '<div class="asm-event-panel-placeholder"><span>날짜를 선택하면<br>일정이 표시됩니다</span></div>';
    }
  }

  showPlaceholder();

  let selectedDate: string | null = null;

  function selectDate(dateStr: string) {
    const cell = grid.querySelector<HTMLDivElement>(`[data-date="${dateStr}"]`);
    const dayEvents = byDate.get(dateStr) || [];

    grid.querySelectorAll('.asm-cal-day.asm-cal-selected').forEach((c) => c.classList.remove('asm-cal-selected'));

    selectedDate = dateStr;

    if (cell) {
      cell.classList.add('asm-cal-selected');
    }

    const sortedDayEvents = [...dayEvents].sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr));

    renderEventPanel(eventPanel, sortedDayEvents, dateStr, todayStr, loadingMessage);
  }

  for (let i = 0; i < start.getDay(); i++) {
    const empty = document.createElement('div');
    empty.className = 'asm-cal-day asm-cal-empty';
    grid.appendChild(empty);
  }

  byDate.forEach((dayEvents, dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const isToday = dateStr === todayStr;
    const isPast = dateStr < todayStr;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const hasEvents = dayEvents.length > 0;

    const sortedDayEvents = [...dayEvents].sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr));

    const cell = document.createElement('div');

    cell.className = [
      'asm-cal-day',
      isToday ? 'asm-cal-today' : '',
      isPast ? 'asm-cal-past' : '',
      isWeekend ? 'asm-cal-weekend' : '',
      hasEvents ? 'asm-cal-has-events' : '',
    ]
      .filter(Boolean)
      .join(' ');

    cell.dataset.date = dateStr;

    const numEl = document.createElement('div');
    numEl.className = 'asm-cal-daynum';
    numEl.textContent = String(d.getDate());
    cell.appendChild(numEl);

    if (hasEvents) {
      const cntEl = document.createElement('div');
      cntEl.className = 'asm-cal-cnt';
      cntEl.textContent = `${sortedDayEvents.length}건`;
      cell.appendChild(cntEl);

      const dotsEl = document.createElement('div');
      dotsEl.className = 'asm-cal-dots';

      const maxDots = Math.min(sortedDayEvents.length, 5);

      sortedDayEvents.slice(0, maxDots).forEach((ev) => {
        const dot = document.createElement('span');
        const pastEv = ev.date < todayStr;

        dot.className = `asm-dot ${pastEv || ev.isClosed ? 'asm-dot-gray' : 'asm-dot-' + ev.category}`;

        dotsEl.appendChild(dot);
      });

      cell.appendChild(dotsEl);
    }

    cell.addEventListener('click', () => {
      if (!hasEvents) return;

      if (selectedDate === dateStr) {
        selectedDate = null;
        cell.classList.remove('asm-cal-selected');
        showPlaceholder();
        return;
      }

      selectDate(dateStr);
    });

    grid.appendChild(cell);
  });

  const calSection = document.createElement('div');
  calSection.className = 'asm-cal-section';
  calSection.appendChild(wdRow);
  calSection.appendChild(grid);

  const searchRow = createSearchRow(
    searchDraft,
    onSearchChange || (() => {}),
    onSearchSubmit || (() => {}),
    onSearchReset || (() => {})
  );

  const calArea = document.createElement('div');
  calArea.className = 'asm-cal-area';
  calArea.appendChild(searchRow);
  calArea.appendChild(calSection);

  const calendarNotice = document.createElement('div');
  calendarNotice.className = 'asm-calendar-notice';

  const calendarNoticeTitle = document.createElement('div');
  calendarNoticeTitle.className = 'asm-calendar-notice-title';
  calendarNoticeTitle.textContent = '내가 신청한 멘토링 내역이 반영되지 않았다면?';

  const calendarNoticeBody = document.createElement('div');
  calendarNoticeBody.className = 'asm-calendar-notice-body';
  calendarNoticeBody.textContent = '접수 내역 페이지에 한 번 들렀다 오면 자동으로 반영됩니다.';

  calendarNotice.appendChild(calendarNoticeTitle);
  calendarNotice.appendChild(calendarNoticeBody);
  calArea.appendChild(calendarNotice);

  body.appendChild(calArea);
  body.appendChild(eventPanel);
  panel.appendChild(body);

  setTimeout(() => {
    selectDate(defaultSelectedDate);
  }, 0);

  return {
    panel,
    grid,
    eventPanel,
    byDate,
    selectedDate: () => selectedDate,
  };
}
