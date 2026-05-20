(function () {
  "use strict";

  if (!location.href.includes("mentoLec")) return;

  // ── 날짜 유틸 ─────────────────────────────────────────────────────────────

  const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function getMonthRange(offset = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const base = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    return { start: base, end, today, year: base.getFullYear(), month: base.getMonth() };
  }

  // ── 리스트 테이블 파싱 (DOM 또는 HTML 문자열에서) ──────────────────────────
  // td 인덱스: [0]=NO [1]=tit [2]=접수기간 [3]=진행날짜 [4]=모집인원 [5]=개설승인 [6]=상태 [7]=작성자 [8]=등록일
  // pc_only td: [0]=NO [1]=접수기간 [2]=진행날짜 [3]=모집인원 [4]=개설승인 [5]=상태 [6]=작성자

  function parseTableRows(root) {
    const map = new Map();

    root.querySelectorAll("tbody tr").forEach((tr) => {
      const link = tr.querySelector('a[href*="mentoLec/view.do"]');
      if (!link) return;

      const snMatch = link.href.match(/qustnrSn=(\d+)/);
      if (!snMatch) return;

      const sn = snMatch[1];

      const allTds = tr.querySelectorAll("td");
      const pcTds = [...allTds].filter((td) => td.classList.contains("pc_only"));

      const dateTimeRaw = pcTds[2] ? pcTds[2].textContent : "";
      const dateMatch = dateTimeRaw.match(/(\d{4}-\d{2}-\d{2})/);
      const timeMatch = dateTimeRaw.match(/(\d{2}:\d{2})\s*~\s*(\d{2}:\d{2})/);

      const capRaw = pcTds[3] ? pcTds[3].textContent : "";
      const capMatch = capRaw.match(/(\d+)\s*\/\s*(\d+)/);

      const statusRaw = pcTds[5] ? pcTds[5].textContent.trim() : "";
      const author = pcTds[6] ? pcTds[6].textContent.trim() : "";

      // 제목: [자유 멘토링]/[멘토 특강] 접두어 제거, [온라인]/[오프라인]은 보존
      const titleRaw = link.textContent.trim();
      const title = titleRaw.replace(/^\[(자유 멘토링|멘토 특강)\]\s*/, "");

      map.set(sn, {
        date: dateMatch ? dateMatch[1] : "",
        title,
        timeStart: timeMatch ? timeMatch[1] : "",
        timeEnd: timeMatch ? timeMatch[2] : "",
        current: capMatch ? capMatch[1] : "",
        total: capMatch ? capMatch[2] : "",
        isClosed: statusRaw.includes("마감"),
        author,
      });
    });

    return map;
  }

  // ── 전체 페이지 fetch + sessionStorage 캐시 ───────────────────────────────

  const CACHE_KEY = "asm_event_map_v4";
  const LOC_CACHE_KEY = "asm_location_v1";
  const CACHE_TTL = 10 * 60 * 1000; // 10분

  function loadCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;

      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CACHE_TTL) return null;

      return new Map(data);
    } catch {
      return null;
    }
  }

  function saveCache(map) {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data: [...map] })
      );
    } catch {}
  }

  async function fetchPageMap(pageIndex, baseUrl) {
    const url = `${baseUrl}&scdate=2026-01-01&ecdate=2026-12-31&edcDateOrder=&regDateOrder=&pageIndex=${pageIndex}`;
    const res = await fetch(url, { credentials: "include" });

    if (!res.ok) return new Map();

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    return parseTableRows(doc);
  }

  // ── 장소 캐시 ─────────────────────────────────────────────────────────────

  function loadLocCache() {
    try {
      const raw = sessionStorage.getItem(LOC_CACHE_KEY);
      if (!raw) return new Map();

      const { ts, data } = JSON.parse(raw);

      // 장소는 30분 캐시
      if (Date.now() - ts > 30 * 60 * 1000) return new Map();

      return new Map(data);
    } catch {
      return new Map();
    }
  }

  function saveLocCache(map) {
    try {
      sessionStorage.setItem(
        LOC_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data: [...map] })
      );
    } catch {}
  }

  // ── 상세 페이지에서 장소 파싱 ─────────────────────────────────────────────

  function parseLocationFromDoc(doc) {
    // th → 다음 td (같은 tr 또는 형제 tr)
    for (const th of doc.querySelectorAll("th")) {
      if (th.textContent.trim() === "장소") {
        const td =
          th.nextElementSibling ||
          th.closest("tr")?.nextElementSibling?.querySelector("td");

        if (td) return td.textContent.trim();
      }
    }

    // dt → 다음 dd
    for (const dt of doc.querySelectorAll("dt")) {
      if (dt.textContent.trim() === "장소") {
        const dd = dt.nextElementSibling;
        if (dd) return dd.textContent.trim();
      }
    }

    // label 형태
    for (const el of doc.querySelectorAll(".label, .tit, strong")) {
      if (el.textContent.trim() === "장소") {
        const next = el.nextElementSibling || el.parentElement?.nextElementSibling;
        if (next) return next.textContent.trim();
      }
    }

    return null;
  }

  function classifyLocation(text) {
    if (!text) return null;

    const t = text.trim();
    if (!t) return null;

    if (t.includes("온라인") || /zoom|meet|teams|webex/i.test(t)) {
      return { type: "online", label: "온라인" };
    }

    return { type: "offline", label: "오프라인" };
  }

  // ── 2주 이벤트 상세 페이지 fetch → 장소 정보 수집 ────────────────────────

  async function fetchLocations(events) {
    const locCache = loadLocCache();
    const missing = events.filter((ev) => ev.sn && !locCache.has(ev.sn));

    if (missing.length === 0) return locCache;

    const origin = location.origin;

    const results = await Promise.allSettled(
      missing.map(async (ev) => {
        const url = `${origin}/busan/sw/mypage/mentoLec/view.do?qustnrSn=${ev.sn}&menuNo=200046`;
        const res = await fetch(url, { credentials: "include" });

        if (!res.ok) return { sn: ev.sn, loc: null };

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        return { sn: ev.sn, loc: parseLocationFromDoc(doc) };
      })
    );

    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value.sn) {
        locCache.set(r.value.sn, r.value.loc ?? "");
      }
    });

    saveLocCache(locCache);

    return locCache;
  }

  function getBaseUrl() {
    const u = new URL(location.href);
    return `${u.origin}${u.pathname}?menuNo=${u.searchParams.get("menuNo") || "200046"}`;
  }

  function getTotalPages() {
    const lastLink = document.querySelector(
      '.paginationSet a[title="마지막 목록"], .paginationSet .i.last a'
    );

    if (lastLink) {
      const m = lastLink.href.match(/pageIndex=(\d+)/);
      if (m) return parseInt(m[1], 10);
    }

    // 페이지 번호 링크 중 최대값
    const pageLinks = document.querySelectorAll(".paginationSet li a");
    let max = 1;

    pageLinks.forEach((a) => {
      const m = a.href.match(/pageIndex=(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });

    return max;
  }

  async function buildCompleteEventMap(onProgress) {
    const cached = loadCache();
    if (cached) return cached;

    const merged = parseTableRows(document); // 현재 페이지 즉시 반영
    const totalPages = getTotalPages();
    const baseUrl = getBaseUrl();

    if (totalPages <= 1) {
      saveCache(merged);
      return merged;
    }

    // 나머지 페이지 병렬 fetch
    const pageNums = [];
    for (let i = 2; i <= totalPages; i++) pageNums.push(i);

    const results = await Promise.allSettled(
      pageNums.map((n) => fetchPageMap(n, baseUrl))
    );

    results.forEach((r) => {
      if (r.status === "fulfilled") {
        r.value.forEach((v, k) => {
          if (!merged.has(k)) merged.set(k, v);
        });
      }
    });

    saveCache(merged);

    if (onProgress) onProgress(merged);

    return merged;
  }

  // ── 이벤트 수집 ───────────────────────────────────────────────────────────

  function collectEvents(eventMap) {
    const events = [];
    const seen = new Set();

    document
      .querySelectorAll(".mypageCalendar .datepicker-days tbody td[data-date] ul li.category")
      .forEach((li) => {
        const td = li.closest("td[data-date]");
        const date = td ? td.getAttribute("data-date") : null;

        if (!date) return;

        const anchor = li.querySelector("a[title]");
        if (!anchor) return;

        const title = anchor.getAttribute("title") || "";
        const category = [...anchor.classList].find((c) => c.startsWith("MRC")) || "";
        const popLink = li.querySelector(".calendarPop a.link");
        const snMatch = popLink ? popLink.href.match(/qustnrSn=(\d+)/) : null;
        const sn = snMatch ? snMatch[1] : null;
        const url = popLink ? popLink.href : "#";

        if (sn && seen.has(sn)) return;
        if (sn) seen.add(sn);

        const info = (sn && eventMap.get(sn)) || {};

        events.push({
          sn,
          date: info.date || date,
          title,
          category,
          categoryNm: category === "MRC010" ? "자유 멘토링" : "멘토 특강",
          url,
          isClosed: info.isClosed ?? false,
          current: info.current || "",
          total: info.total || "",
          author: info.author || "",
          timeStart: info.timeStart || "",
          timeEnd: info.timeEnd || "",
        });
      });

    // 리스트 테이블에서 캘린더 DOM에 없는 이벤트 보완 (다음 달 등)
    eventMap.forEach((info, sn) => {
      if (seen.has(sn) || !info.date) return;

      // info.title: parseTableRows에서 저장한 제목 (페이지2+ fetch 포함)
      // DOM에서 링크를 찾을 수 없는 경우에도 제목 사용 가능
      const link = document.querySelector(`a[href*="qustnrSn=${sn}"][href*="mentoLec/view"]`);
      const titleFromDom = link
        ? link.textContent.trim().replace(/^\[(자유 멘토링|멘토 특강)\]\s*/, "")
        : "";

      const title = info.title || titleFromDom || `(번호 ${sn})`;
      const titleRaw = link ? link.textContent.trim() : info.title || "";
      const category = titleRaw.startsWith("[자유 멘토링]") ? "MRC010" : "MRC020";
      const url = link
        ? link.href
        : `${location.origin}/busan/sw/mypage/mentoLec/view.do?qustnrSn=${sn}&menuNo=200046`;

      events.push({
        sn,
        date: info.date,
        title,
        category,
        categoryNm: category === "MRC010" ? "자유 멘토링" : "멘토 특강",
        url,
        isClosed: info.isClosed,
        current: info.current,
        total: info.total,
        author: info.author,
        timeStart: info.timeStart,
        timeEnd: info.timeEnd,
      });
    });

    return events;
  }

  // ── 이벤트 정렬 유틸 ──────────────────────────────────────────────────────
  // 정렬 기준:
  // 1. 신청가능/접수중 위
  // 2. 마감/진행완료 아래
  // 3. 각 그룹 안에서 시작시간 오름차순
  // 4. 시작시간이 같으면 멘토 이름 가나다순
  // 5. 멘토 이름도 같으면 제목 가나다순
  // 6. 전부 같으면 sn 기준 보조 정렬

  function getEventStatusGroup(ev, todayStr) {
    const isPast = ev.date < todayStr;
    const isClosed = ev.isClosed;

    // 0: 신청가능 / 접수중
    // 1: 마감 / 진행완료
    return isPast || isClosed ? 1 : 0;
  }

  function timeToMinutes(time) {
    if (!time) return 24 * 60 + 999;

    const [h, m] = time.split(":").map(Number);

    if (Number.isNaN(h) || Number.isNaN(m)) {
      return 24 * 60 + 999;
    }

    return h * 60 + m;
  }

  function getComparableAuthor(author) {
    return (author || "")
      .replace(/\s*멘토\s*$/g, "")
      .trim()
      .normalize("NFC");
  }

  function getComparableTitle(title) {
    return (title || "")
      .replace(/^\s*\[(온라인|오프라인)\]\s*/g, "")
      .replace(/^\s*\((온라인|오프라인)\)\s*/g, "")
      .replace(/^\s*\[(자유 멘토링|멘토 특강)\]\s*/g, "")
      .trim()
      .normalize("NFC");
  }

  function compareKoreanText(aText, bText) {
    return aText.localeCompare(bText, "ko-KR", {
      usage: "sort",
      sensitivity: "variant",
      numeric: true,
      ignorePunctuation: true,
    });
  }

  function sortEventsByStatusTimeAuthor(a, b, todayStr) {
    const groupA = getEventStatusGroup(a, todayStr);
    const groupB = getEventStatusGroup(b, todayStr);

    // 1. 신청가능/접수중 먼저, 마감/진행완료 나중
    if (groupA !== groupB) return groupA - groupB;

    const timeA = timeToMinutes(a.timeStart);
    const timeB = timeToMinutes(b.timeStart);

    // 2. 같은 그룹 안에서는 시작시간순
    if (timeA !== timeB) return timeA - timeB;

    const authorA = getComparableAuthor(a.author);
    const authorB = getComparableAuthor(b.author);

    // 3. 시작시간이 같으면 멘토 이름 가나다순
    const authorCompare = compareKoreanText(authorA, authorB);
    if (authorCompare !== 0) return authorCompare;

    const titleA = getComparableTitle(a.title);
    const titleB = getComparableTitle(b.title);

    // 4. 멘토 이름도 같으면 제목 가나다순
    const titleCompare = compareKoreanText(titleA, titleB);
    if (titleCompare !== 0) return titleCompare;

    // 5. 전부 같으면 sn 기준 보조 정렬
    return String(a.sn || "").localeCompare(String(b.sn || ""), "ko-KR", {
      numeric: true,
    });
  }

  // ── 이벤트 카드 생성 ──────────────────────────────────────────────────────

  function makeCard(ev, todayStr) {
    const isPast = ev.date < todayStr;
    const isGray = isPast || ev.isClosed;

    const card = document.createElement("div");
    card.className = `asm-event-card ${isGray ? "asm-card-gray" : "asm-card-open asm-cat-" + ev.category}`;

    const badges = document.createElement("div");
    badges.className = "asm-card-badges";

    const catBadge = document.createElement("span");
    catBadge.className = `asm-badge asm-cat-badge asm-cat-${ev.category}`;
    catBadge.textContent = ev.categoryNm;
    badges.appendChild(catBadge);

    // 장소: 상세 페이지 데이터 우선, 없으면 제목에서 감지
    const locInfo = ev.location ? classifyLocation(ev.location) : null;

    if (locInfo) {
      badges.appendChild(
        mkBadge(locInfo.label, locInfo.type === "online" ? "asm-online" : "asm-offline")
      );
    } else if (ev.title.includes("[온라인]") || ev.title.includes("(온라인)")) {
      badges.appendChild(mkBadge("온라인", "asm-online"));
    } else if (ev.title.includes("[오프라인]") || ev.title.includes("(오프라인)")) {
      badges.appendChild(mkBadge("오프라인", "asm-offline"));
    }

    const statusLabel = isPast ? "진행완료" : ev.isClosed ? "마감" : "접수중";
    const statusCls = isPast ? "asm-done" : ev.isClosed ? "asm-closed" : "asm-open-badge";

    badges.appendChild(mkBadge(statusLabel, statusCls));

    card.appendChild(badges);

    const titleEl = document.createElement("div");
    titleEl.className = "asm-card-title";
    titleEl.textContent = ev.title;
    card.appendChild(titleEl);

    const footer = document.createElement("div");
    footer.className = "asm-card-footer";

    // 1행: 멘토명
    if (ev.author) {
      const author = document.createElement("div");
      author.className = "asm-card-author";
      author.textContent = ev.author + " 멘토";
      footer.appendChild(author);
    }

    // 2행: 시간
    if (ev.timeStart) {
      const time = document.createElement("div");
      time.className = "asm-card-time";
      time.textContent = `${ev.timeStart} ~ ${ev.timeEnd}`;
      footer.appendChild(time);
    }

    // 3행: 인원수 + 바로가기
    const bottom = document.createElement("div");
    bottom.className = "asm-card-footer-bottom";

    if (ev.current !== "" && ev.total !== "") {
      const cap = document.createElement("span");
      cap.className = "asm-cap";
      cap.textContent = `${ev.current}/${ev.total}명`;
      bottom.appendChild(cap);
    } else {
      bottom.appendChild(document.createElement("span"));
    }

    const linkEl = document.createElement("a");
    linkEl.className = "asm-card-link";
    linkEl.href = ev.url;
    linkEl.target = "_blank";
    linkEl.textContent = "바로가기 →";

    bottom.appendChild(linkEl);
    footer.appendChild(bottom);

    card.appendChild(footer);

    return card;
  }

  function mkBadge(text, cls) {
    const el = document.createElement("span");
    el.className = `asm-badge ${cls}`;
    el.textContent = text;
    return el;
  }

  // ── 날짜 클릭 이벤트 패널 렌더 ───────────────────────────────────────────

  function renderEventPanel(container, dayEvents, dateStr, todayStr) {
    container.innerHTML = "";

    const d = new Date(dateStr + "T00:00:00");

    const headerEl = document.createElement("div");
    headerEl.className = "asm-event-panel-header";

    const dateLabel = document.createElement("span");
    dateLabel.className = "asm-event-panel-date";
    dateLabel.textContent = `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}(${DAY_KO[d.getDay()]})`;

    const cntLabel = document.createElement("span");
    cntLabel.className = "asm-event-panel-cnt";
    cntLabel.textContent = `${dayEvents.length}건`;

    headerEl.appendChild(dateLabel);
    headerEl.appendChild(cntLabel);
    container.appendChild(headerEl);

    const cards = document.createElement("div");
    cards.className = "asm-day-cards";

    [...dayEvents]
      .sort((a, b) => sortEventsByStatusTimeAuthor(a, b, todayStr))
      .forEach((ev) => cards.appendChild(makeCard(ev, todayStr)));

    container.appendChild(cards);
  }

  // ── 캘린더 패널 빌드 ─────────────────────────────────────────────────────

  function buildPanel(events, isLoading, offset = 0, onNavigate = null) {
    const { start, end, today, year, month } = getMonthRange(offset);
    const todayStr = toDateStr(today);

    const byDate = new Map();

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      byDate.set(toDateStr(new Date(d)), []);
    }

    events.forEach((ev) => {
      if (byDate.has(ev.date)) byDate.get(ev.date).push(ev);
    });

    const panel = document.createElement("div");
    panel.id = "asm-2week-panel";

    // 헤더
    const header = document.createElement("div");
    header.className = "asm-panel-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "asm-panel-title-wrap";
    titleWrap.innerHTML = `<span class="asm-panel-ico">📅</span><span class="asm-panel-title">${year}년 ${month + 1}월</span>`;

    // 로딩 표시
    const loadingEl = document.createElement("span");
    loadingEl.className = "asm-panel-loading";
    loadingEl.id = "asm-panel-loading";
    loadingEl.textContent = isLoading ? "데이터 불러오는 중…" : "";

    titleWrap.appendChild(loadingEl);
    header.appendChild(titleWrap);

    // 네비게이션 버튼
    const navWrap = document.createElement("div");
    navWrap.className = "asm-panel-nav";

    const prevBtn = document.createElement("button");
    prevBtn.className = "asm-panel-nav-btn";
    prevBtn.textContent = "‹ 이전달";
    prevBtn.title = "이전 달";
    prevBtn.addEventListener("click", () => onNavigate && onNavigate(offset - 1));
    navWrap.appendChild(prevBtn);

    if (offset !== 0) {
      const todayBtn = document.createElement("button");
      todayBtn.className = "asm-panel-nav-btn asm-nav-today";
      todayBtn.textContent = "오늘";
      todayBtn.addEventListener("click", () => onNavigate && onNavigate(0));
      navWrap.appendChild(todayBtn);
    }

    const nextBtn = document.createElement("button");
    nextBtn.className = "asm-panel-nav-btn";
    nextBtn.textContent = "다음달 ›";
    nextBtn.title = "다음 달";
    nextBtn.addEventListener("click", () => onNavigate && onNavigate(offset + 1));
    navWrap.appendChild(nextBtn);

    header.appendChild(navWrap);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "asm-panel-toggle";
    toggleBtn.textContent = "접기";

    let collapsed = false;

    toggleBtn.addEventListener("click", () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? "none" : "";
      toggleBtn.textContent = collapsed ? "펼치기" : "접기";
    });

    header.appendChild(toggleBtn);
    panel.appendChild(header);

    // 본문
    const body = document.createElement("div");
    body.className = "asm-panel-body";

    // 요일 헤더
    const wdRow = document.createElement("div");
    wdRow.className = "asm-cal-weekdays";

    ["일", "월", "화", "수", "목", "금", "토"].forEach((wd, i) => {
      const cell = document.createElement("div");
      cell.className = `asm-cal-wd${i === 0 || i === 6 ? " asm-wd-weekend" : ""}`;
      cell.textContent = wd;
      wdRow.appendChild(cell);
    });

    // 날짜 그리드
    const grid = document.createElement("div");
    grid.className = "asm-cal-grid";

    const eventPanel = document.createElement("div");
    eventPanel.className = "asm-event-panel";

    function showPlaceholder() {
      eventPanel.innerHTML = '<div class="asm-event-panel-placeholder"><span>날짜를 선택하면<br>일정이 표시됩니다</span></div>';
    }

    showPlaceholder();

    let selectedDate = null;

    // 월 첫째 날 요일 전 빈 셀 (일=0 ~ 토=6)
    for (let i = 0; i < start.getDay(); i++) {
      const empty = document.createElement("div");
      empty.className = "asm-cal-day asm-cal-empty";
      grid.appendChild(empty);
    }

    byDate.forEach((dayEvents, dateStr) => {
      const d = new Date(dateStr + "T00:00:00");
      const isToday = dateStr === todayStr;
      const isPast = dateStr < todayStr;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const hasEvents = dayEvents.length > 0;

      const sortedDayEvents = [...dayEvents].sort((a, b) =>
        sortEventsByStatusTimeAuthor(a, b, todayStr)
      );

      const cell = document.createElement("div");

      cell.className = [
        "asm-cal-day",
        isToday ? "asm-cal-today" : "",
        isPast ? "asm-cal-past" : "",
        isWeekend ? "asm-cal-weekend" : "",
        hasEvents ? "asm-cal-has-events" : "",
      ]
        .filter(Boolean)
        .join(" ");

      cell.dataset.date = dateStr;

      const numEl = document.createElement("div");
      numEl.className = "asm-cal-daynum";
      numEl.textContent = d.getDate();
      cell.appendChild(numEl);

      if (hasEvents) {
        const cntEl = document.createElement("div");
        cntEl.className = "asm-cal-cnt";
        cntEl.textContent = `${sortedDayEvents.length}건`;
        cell.appendChild(cntEl);

        const dotsEl = document.createElement("div");
        dotsEl.className = "asm-cal-dots";

        const maxDots = Math.min(sortedDayEvents.length, 5);

        sortedDayEvents.slice(0, maxDots).forEach((ev) => {
          const dot = document.createElement("span");
          const pastEv = ev.date < todayStr;

          dot.className = `asm-dot ${
            pastEv || ev.isClosed ? "asm-dot-gray" : "asm-dot-" + ev.category
          }`;

          dotsEl.appendChild(dot);
        });

        if (sortedDayEvents.length > maxDots) {
          const more = document.createElement("span");
          more.className = "asm-dot-more";
          more.textContent = `+${sortedDayEvents.length - maxDots}`;
          dotsEl.appendChild(more);
        }

        cell.appendChild(dotsEl);

        cell.addEventListener("click", () => {
          if (selectedDate === dateStr) {
            selectedDate = null;
            cell.classList.remove("asm-cal-selected");
            showPlaceholder();
            return;
          }

          grid.querySelectorAll(".asm-cal-day.asm-cal-selected").forEach((c) =>
            c.classList.remove("asm-cal-selected")
          );

          selectedDate = dateStr;
          cell.classList.add("asm-cal-selected");

          renderEventPanel(eventPanel, sortedDayEvents, dateStr, todayStr);
        });
      }

      grid.appendChild(cell);
    });

    const calSection = document.createElement("div");
    calSection.className = "asm-cal-section";
    calSection.appendChild(wdRow);
    calSection.appendChild(grid);

    body.appendChild(calSection);
    body.appendChild(eventPanel);
    panel.appendChild(body);

    // 오늘 자동 열기
    const todayCell = grid.querySelector(`[data-date="${todayStr}"]`);

    if (todayCell && byDate.get(todayStr)?.length > 0) {
      setTimeout(() => todayCell.click(), 0);
    }

    return {
      panel,
      grid,
      eventPanel,
      byDate,
      selectedDate: () => selectedDate,
    };
  }

  // ── 초기화 ────────────────────────────────────────────────────────────────

  async function init() {
    const calWrap = document.querySelector(".mypageCalendar.wrap");
    if (!calWrap) return;

    let currentOffset = 0;
    let allEvents = [];

    function getFilteredEvents() {
      const { start, end } = getMonthRange(currentOffset);
      const s = toDateStr(start);
      const e = toDateStr(end);

      return allEvents
        .map((ev) => ({ ...ev }))
        .filter((ev) => ev.date >= s && ev.date <= e);
    }

    function withLocations(events) {
      const cache = loadLocCache();

      return events.map((ev) => {
        if (ev.sn && cache.has(ev.sn)) {
          return { ...ev, location: cache.get(ev.sn) || null };
        }

        return ev;
      });
    }

    function renderPanel(events, loading) {
      const existing = document.getElementById("asm-2week-panel");
      const { panel } = buildPanel(events, loading, currentOffset, navigate);

      if (existing) {
        existing.parentNode.replaceChild(panel, existing);
      } else {
        const bbsTop = document.querySelector(".bbs-top.bg");

        if (bbsTop) {
          bbsTop.parentNode.insertBefore(panel, bbsTop);
        } else {
          calWrap.parentNode.insertBefore(panel, calWrap);
        }
      }
    }

    async function navigate(newOffset) {
      currentOffset = newOffset;

      renderPanel(withLocations(getFilteredEvents()), false);

      await fetchLocations(getFilteredEvents());

      renderPanel(withLocations(getFilteredEvents()), false);
    }

    // ① 현재 페이지 데이터로 즉시 렌더
    const initialMap = parseTableRows(document);
    allEvents = collectEvents(initialMap);
    renderPanel(withLocations(getFilteredEvents()), !loadCache());

    // ② 전체 페이지 fetch → 멘토/인원/상태 완성
    const completeMap = await buildCompleteEventMap();
    allEvents = collectEvents(completeMap);
    renderPanel(withLocations(getFilteredEvents()), true);

    // ③ 상세 페이지 fetch → 장소 정보 반영
    await fetchLocations(getFilteredEvents());
    renderPanel(withLocations(getFilteredEvents()), false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();