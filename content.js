// SOMA Schedule Manager - Content Script
// Automatically parses registration tables, renders a calendar, and manages personal schedules with conflict checks.

(async function () {
  'use strict';

  // 10 minutes cache TTL for future SOMA lectures
  const CACHE_TTL_MS = 10 * 60 * 1000;

  // Extension State
  let startOffsetWeeks = 0; // 0 means starting from the Sunday of current week
  let hideEndedLectures = false;

  // Helper: check if a lecture/schedule has ended
  function isLectureEnded(dateTimeText) {
    const match = dateTimeText.match(/(\d{4})-(\d{2})-(\d{2})\([^)]+\)\s*(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/);
    if (!match) return false;
    const [_, y, m, d, sh, sm, eh, em] = match;
    const endTime = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(eh, 10), parseInt(em, 10), 0);
    return endTime < new Date();
  }

  // Helper: convert KST datetime components to UTC ICS-style date string
  function kstToUtcIcsString(year, month, day, hour, minute, second = '00') {
    const date = new Date(Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    ));
    date.setUTCHours(date.getUTCHours() - 9); // Convert KST (UTC+9) to UTC
    
    const pad = (num) => String(num).padStart(2, '0');
    const y = date.getUTCFullYear();
    const mo = pad(date.getUTCMonth() + 1);
    const d = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const mi = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    
    return `${y}${mo}${d}T${hh}${mi}${ss}Z`;
  }

  // Fetch SOMA lecture details (Location & Enrollment) with cache support
  async function fetchLectureDetails(qustnrSn, url, dateTimeText) {
    if (!url) return { location: '정보 없음', people: '정보 없음' };

    const cacheKey = `soma_lecture_detail_${qustnrSn}`;
    const cached = await new Promise(resolve => {
      chrome.storage.local.get([cacheKey], (result) => {
        resolve(result[cacheKey]);
      });
    });

    const isPast = isLectureEnded(dateTimeText);
    const now = Date.now();

    if (cached) {
      if (isPast || (cached.timestamp && now - cached.timestamp < CACHE_TTL_MS)) {
        return { location: cached.location, people: cached.people };
      }
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network error');
      const htmlText = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      let location = '';
      let people = '';

      // Search tables
      const ths = doc.querySelectorAll('th');
      ths.forEach(th => {
        const label = th.textContent.trim();
        const td = th.nextElementSibling;
        if (!td) return;
        const val = td.textContent.trim().replace(/\s+/g, ' ');

        if (label.includes('장소') || label.includes('위치') || label.includes('교육장소')) {
          location = val;
        } else if (label.includes('인원') || label.includes('신청') || label.includes('모집인원') || label.includes('정원')) {
          people = val;
        }
      });

      // Secondary list items (dt/dd)
      if (!location || !people) {
        const dts = doc.querySelectorAll('dt');
        dts.forEach(dt => {
          const label = dt.textContent.trim();
          const dd = dt.nextElementSibling;
          if (!dd) return;
          const val = dd.textContent.trim().replace(/\s+/g, ' ');

          if (label.includes('장소') || label.includes('위치')) {
            if (!location) location = val;
          } else if (label.includes('인원') || label.includes('신청')) {
            if (!people) people = val;
          }
        });
      }

      // Fallback text check
      if (!location) {
        const tds = doc.querySelectorAll('td');
        for (const td of tds) {
          const text = td.textContent;
          if (text.includes('온라인(webex)') || text.includes('회의실') || text.includes('하이스퀘어') || text.includes('하이텐')) {
            location = text.trim().replace(/\s+/g, ' ');
            break;
          }
        }
      }

      const finalLocation = location || '정보 없음';
      const finalPeople = people || '정보 없음';

      // Save to cache
      const detailsToCache = {
        location: finalLocation,
        people: finalPeople,
        dateTimeText: dateTimeText,
        timestamp: Date.now()
      };

      const cacheObj = {};
      cacheObj[cacheKey] = detailsToCache;
      await new Promise(resolve => {
        chrome.storage.local.set(cacheObj, resolve);
      });

      return { location: finalLocation, people: finalPeople };
    } catch (e) {
      console.error(`Failed to fetch details for lecture ${qustnrSn}:`, e);
      return { location: '정보 없음', people: '정보 없음' };
    }
  }

  // Parse original SOMA table rows
  async function parseLecturesTable() {
    const rows = document.querySelectorAll('.boardlist table tbody tr');
    const lectures = [];

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 8) continue; // Skip header/footer/empty rows

      const no = cells[0].textContent.trim();
      const type = cells[1].textContent.trim();
      
      const titleLink = cells[2].querySelector('a');
      const title = titleLink ? titleLink.textContent.trim() : cells[2].textContent.trim();
      const url = titleLink ? titleLink.getAttribute('href') : '';
      
      let qustnrSn = '';
      if (url) {
        const match = url.match(/[?&]qustnrSn=(\d+)/);
        if (match) {
          qustnrSn = match[1];
        }
      }

      const author = cells[3].textContent.trim();
      const dateTimeText = cells[4].innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      
      const dateMatch = dateTimeText.match(/(\d{4})-(\d{2})-(\d{2})/);
      const dateStr = dateMatch ? dateMatch[0] : '';
      
      const registerDate = cells[5].textContent.trim().replace(/\s+/g, ' ');
      const status = cells[6].textContent.trim();
      const approval = cells[7].textContent.trim();
      
      const hasCancelButton = !!row.querySelector('[onclick*="delDate"]');

      let details = { location: '로딩 중...', people: '로딩 중...' };
      if (qustnrSn && url) {
        details = await fetchLectureDetails(qustnrSn, url, dateTimeText);
      }

      lectures.push({
        no,
        type,
        title,
        url,
        qustnrSn,
        author,
        dateTimeText,
        dateStr,
        registerDate,
        status,
        approval,
        hasCancelButton,
        location: details.location,
        people: details.people
      });
    }

    return lectures;
  }

  // Handle ICS downloading
  function downloadICS(lecture) {
    const match = lecture.dateTimeText.match(/(\d{4})-(\d{2})-(\d{2})\([^)]+\)\s*(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/);
    if (!match) {
      alert('일정 날짜 형식이 올바르지 않습니다.');
      return;
    }
    
    const [_, y, m, d, sh, sm, eh, em] = match;
    const dtStart = `${y}${m}${d}T${sh}${sm}00`;
    const dtEnd = `${y}${m}${d}T${eh}${em}00`;
    const uid = `soma_lecture_${lecture.qustnrSn || Math.random().toString(36).substr(2, 9)}@swmaestro.org`;
    const dtStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SOMA Schedule Manager//KR',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;TZID=Asia/Seoul:${dtStart}`,
      `DTEND;TZID=Asia/Seoul:${dtEnd}`,
      `SUMMARY:${lecture.title}`,
      `DESCRIPTION:구분: ${lecture.type}\\n멘토: ${lecture.author}\\n접수상태: ${lecture.status}\\n인원: ${lecture.people}`,
      `LOCATION:${lecture.location}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    
    const icsContent = icsLines.join('\r\n');
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    const cleanTitle = lecture.title.replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣-]/g, '').trim();
    a.download = `[소마]_${cleanTitle}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Redirect to Google Calendar
  function openGoogleCalendar(lecture) {
    const match = lecture.dateTimeText.match(/(\d{4})-(\d{2})-(\d{2})\([^)]+\)\s*(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/);
    if (!match) {
      alert('일정 날짜 형식이 올바르지 않습니다.');
      return;
    }
    
    const [_, y, m, d, sh, sm, eh, em] = match;
    const utcStart = kstToUtcIcsString(y, m, d, sh, sm);
    const utcEnd = kstToUtcIcsString(y, m, d, eh, em);
    
    const title = encodeURIComponent(`[소마] ${lecture.title}`);
    const dates = `${utcStart}/${utcEnd}`;
    const details = encodeURIComponent(
      `구분: ${lecture.type}\n멘토: ${lecture.author}\n접수상태: ${lecture.status}\n인원: ${lecture.people}\n링크: ${window.location.origin}${lecture.url || ''}`
    );
    const location = encodeURIComponent(lecture.location);
    
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}&location=${location}`;
    window.open(gcalUrl, '_blank');
  }

  // Trigger Cancel Registration
  function triggerCancellation(qustnrSn) {
    const rows = document.querySelectorAll('.boardlist table tbody tr');
    for (const row of rows) {
      const a = row.querySelector('.tit.popuser a');
      if (a && a.getAttribute('href').includes(`qustnrSn=${qustnrSn}`)) {
        const delBtn = row.querySelector('[onclick*="delDate"]');
        if (delBtn) {
          delBtn.click();
          return;
        }
      }
    }
    alert('접수 취소 처리기(delDate)를 찾을 수 없습니다. 원래 표에서 취소 버튼을 눌러주십시오.');
  }

  // Inject personal schedule creation Modal DOM
  function injectModalDOM() {
    if (document.getElementById('personal-schedule-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'personal-schedule-modal';
    modal.className = 'modal-backdrop';
    modal.style.display = 'none';

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h4>➕ 새 개인 일정 등록</h4>
          <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <form id="personal-schedule-form">
          <div class="form-group">
            <label for="schedule-title">일정 제목 *</label>
            <input type="text" id="schedule-title" required placeholder="예: 코딩테스트 스터디, 팀 미팅 등">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="schedule-date">날짜 *</label>
              <div class="date-input-row">
                <input type="date" id="schedule-date" required>
                <div class="date-presets">
                  <button type="button" class="preset-btn" data-preset="today">오늘</button>
                  <button type="button" class="preset-btn" data-preset="tomorrow">내일</button>
                </div>
              </div>
            </div>
          </div>
          <div class="form-row flex-row">
            <div class="form-group half">
              <label for="schedule-start-time">시작 시간 *</label>
              <select id="schedule-start-time" required></select>
            </div>
            <div class="form-group half">
              <label for="schedule-end-time">종료 시간 *</label>
              <select id="schedule-end-time" required></select>
            </div>
          </div>
          <div class="form-group">
            <label for="schedule-desc">설명 (선택)</label>
            <textarea id="schedule-desc" rows="3" placeholder="일정 세부 정보 또는 메모를 입력하세요."></textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn-cancel">취소</button>
            <button type="submit" class="btn-save">저장</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    // Populate Time Dropdowns (30-minute intervals)
    const startSelect = modal.querySelector('#schedule-start-time');
    const endSelect = modal.querySelector('#schedule-end-time');
    for (let h = 0; h < 24; h++) {
      for (const m of ['00', '30']) {
        const hh = String(h).padStart(2, '0');
        const timeVal = `${hh}:${m}`;

        const optStart = document.createElement('option');
        optStart.value = timeVal;
        optStart.textContent = timeVal;
        startSelect.appendChild(optStart);

        const optEnd = document.createElement('option');
        optEnd.value = timeVal;
        optEnd.textContent = timeVal;
        endSelect.appendChild(optEnd);
      }
    }
    startSelect.value = '09:00';
    endSelect.value = '10:00';

    // Auto set end time to start time + 1 hour
    startSelect.addEventListener('change', () => {
      const [h, m] = startSelect.value.split(':').map(Number);
      let endH = h + 1;
      let endM = m;
      if (endH >= 24) {
        endH = 23;
        endM = 30;
      }
      const endVal = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
      endSelect.value = endVal;
    });

    // Date presets
    const dateInput = modal.querySelector('#schedule-date');
    const getFormattedDate = (offset = 0) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    modal.querySelector('[data-preset="today"]').addEventListener('click', () => {
      dateInput.value = getFormattedDate(0);
    });
    modal.querySelector('[data-preset="tomorrow"]').addEventListener('click', () => {
      dateInput.value = getFormattedDate(1);
    });

    // Close listeners
    const closeBtn = modal.querySelector('.close-modal-btn');
    const cancelBtn = modal.querySelector('.btn-cancel');
    const closeModal = () => { modal.style.display = 'none'; };
    
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Form submission
    const form = document.getElementById('personal-schedule-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('schedule-title').value.trim();
      const dateStr = document.getElementById('schedule-date').value;
      const startTime = document.getElementById('schedule-start-time').value;
      const endTime = document.getElementById('schedule-end-time').value;
      const description = document.getElementById('schedule-desc').value.trim();

      if (startTime >= endTime) {
        alert('종료 시간은 시작 시간보다 늦어야 합니다.');
        return;
      }

      const newSchedule = {
        id: 'personal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        title,
        dateStr,
        startTime,
        endTime,
        description
      };

      const currentList = await new Promise(resolve => {
        chrome.storage.local.get(['soma_personal_schedules'], (res) => {
          resolve(res.soma_personal_schedules || []);
        });
      });

      currentList.push(newSchedule);

      await new Promise(resolve => {
        chrome.storage.local.set({ soma_personal_schedules: currentList }, resolve);
      });

      closeModal();
      form.reset();
      startSelect.value = '09:00';
      endSelect.value = '10:00';

      const lectures = await parseLecturesTable();
      renderCalendar(lectures);
    });
  }

  // Open modal with specific date helper
  function openModalWithDate(dateStr) {
    injectModalDOM();
    const modal = document.getElementById('personal-schedule-modal');
    if (!modal) return;

    const dateInput = modal.querySelector('#schedule-date');
    if (dateInput) {
      if (dateStr) {
        dateInput.value = dateStr;
      } else {
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
      }
    }

    modal.style.display = 'flex';
    const titleInput = modal.querySelector('#schedule-title');
    if (titleInput) {
      titleInput.focus();
    }
  }

  // Render the Calendar UI
  async function renderCalendar(lectures) {
    const existing = document.getElementById('history-calendar');
    if (existing) {
      existing.remove();
    }

    const targetContainer = document.querySelector('.tabs-st1');
    if (!targetContainer) return;

    // Load personal schedules
    const personalSchedules = await new Promise(resolve => {
      chrome.storage.local.get(['soma_personal_schedules'], (res) => {
        resolve(res.soma_personal_schedules || []);
      });
    });

    const calendarWrapper = document.createElement('div');
    calendarWrapper.id = 'history-calendar';

    // 1. Calendar Header / Dashboard Toolbar
    const header = document.createElement('div');
    header.className = 'calendar-header';
    header.innerHTML = `
      <div class="calendar-title-group">
        <h3>📅 멘토링 / 특강 & 개인 일정 대시보드</h3>
        <span class="calendar-subtitle">접수한 일정과 내 개인 일정을 함께 모아 관리합니다.</span>
      </div>
      <div class="calendar-controls">
        <button id="btn-prev-weeks" class="control-btn">⬆ 이전 2주 보기</button>
        <button id="btn-reset-weeks" class="control-btn secondary" ${startOffsetWeeks === 0 ? 'hidden' : ''}>↩ 이번주부터 보기</button>
        <button id="btn-toggle-ended" class="control-btn secondary">${hideEndedLectures ? '👁️ 종료된 일정 표시' : '👁️ 종료된 일정 숨기기'}</button>
        <button id="btn-add-personal" class="control-btn accent">➕ 개인 일정 추가</button>
      </div>
    `;
    calendarWrapper.appendChild(header);

    // 2. Calendar Cells Grid
    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const SundayOfCurrentWeek = new Date(today);
    SundayOfCurrentWeek.setDate(today.getDate() - today.getDay());

    const startDate = new Date(SundayOfCurrentWeek);
    startDate.setDate(startDate.getDate() + (startOffsetWeeks * 7));

    const dayKorean = ['일', '월', '화', '수', '목', '금', '토'];

    for (let i = 0; i < 28; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      const y = currentDate.getFullYear();
      const m = String(currentDate.getMonth() + 1).padStart(2, '0');
      const d = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${d}`;

      const isToday = currentDate.getTime() === today.getTime();
      const formattedDateText = `${currentDate.getMonth() + 1}월 ${currentDate.getDate()}일 (${dayKorean[currentDate.getDay()]})`;

      // Gather SOMA lectures for this day
      const dayLectures = lectures.filter(l => l.dateStr === dateStr);

      // Gather Personal schedules for this day
      const dayPersonal = personalSchedules.filter(ps => ps.dateStr === dateStr);

      // Construct events array
      const allEvents = [];

      dayLectures.forEach(l => {
        let startKey = '00:00';
        const timeMatch = l.dateTimeText.match(/(\d{2}):(\d{2})/);
        if (timeMatch) startKey = `${timeMatch[1]}:${timeMatch[2]}`;
        
        allEvents.push({
          isPersonal: false,
          data: l,
          timeKey: startKey,
          ended: isLectureEnded(l.dateTimeText)
        });
      });

      dayPersonal.forEach(ps => {
        allEvents.push({
          isPersonal: true,
          data: ps,
          timeKey: ps.startTime,
          ended: isLectureEnded(`${ps.dateStr}(요일) ${ps.startTime} ~ ${ps.endTime}`)
        });
      });

      // Sort events chronologically
      allEvents.sort((a, b) => a.timeKey.localeCompare(b.timeKey));

      // Filter ended if hide option enabled
      const visibleEvents = hideEndedLectures
        ? allEvents.filter(e => !e.ended)
        : allEvents;

      // Skip rendering empty past cells to clean layout
      if (hideEndedLectures && currentDate < today && visibleEvents.length === 0) {
        continue;
      }

      const cell = document.createElement('div');
      cell.className = `calendar-cell${isToday ? ' today-bg' : ''}`;
      cell.setAttribute('data-calendar-date', dateStr);

      const dateHeader = document.createElement('div');
      dateHeader.className = 'calendar-date-header-row';

      const dateSpan = document.createElement('span');
      dateSpan.className = `calendar-date${isToday ? ' today-text' : ''}`;
      dateSpan.textContent = formattedDateText + (isToday ? ' [오늘]' : '');
      dateHeader.appendChild(dateSpan);

      const quickAddBtn = document.createElement('button');
      quickAddBtn.className = 'quick-add-cell-btn';
      quickAddBtn.innerHTML = '＋';
      quickAddBtn.title = '이 날짜에 개인 일정 추가';
      quickAddBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModalWithDate(dateStr);
      });
      dateHeader.appendChild(quickAddBtn);
      cell.appendChild(dateHeader);

      visibleEvents.forEach(evt => {
        if (evt.isPersonal) {
          // Render Personal Event Card
          const ps = evt.data;
          const card = document.createElement('div');
          card.className = `calendar-lecture ${evt.ended ? 'ended' : ''} event-personal`;
          card.title = ps.title;

          card.innerHTML = `
            <div class="info-group">
              <div class="text-title" data-role="title">${ps.title}</div>
              <div class="text-type-badge personal-badge">👤 개인 일정</div>
              <div class="info-row" data-role="time">⏰ ${ps.startTime} ~ ${ps.endTime}</div>
              ${ps.description ? `<div class="info-row desc-row" data-role="desc">📝 ${ps.description}</div>` : ''}
            </div>
          `;

          const buttonGroup = document.createElement('div');
          buttonGroup.className = 'button-group';

          const btnDelete = document.createElement('button');
          btnDelete.className = 'delete-btn';
          btnDelete.innerHTML = '🗑️ 삭제';
          btnDelete.title = '개인 일정 삭제';
          btnDelete.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm(`개인 일정 "${ps.title}"을(를) 삭제하시겠습니까?`)) {
              const currentList = await new Promise(resolve => {
                chrome.storage.local.get(['soma_personal_schedules'], (res) => {
                  resolve(res.soma_personal_schedules || []);
                });
              });
              const updatedList = currentList.filter(item => item.id !== ps.id);
              await new Promise(resolve => {
                chrome.storage.local.set({ soma_personal_schedules: updatedList }, resolve);
              });

              // Re-render
              const freshLectures = await parseLecturesTable();
              renderCalendar(freshLectures);
            }
          });

          buttonGroup.appendChild(btnDelete);
          card.appendChild(buttonGroup);
          cell.appendChild(card);
        } else {
          // Render SOMA Lecture Card
          const lec = evt.data;
          const card = document.createElement('div');
          card.className = `calendar-lecture ${evt.ended ? 'ended' : ''} ${lec.type.includes('특강') ? 'special' : 'mentoring'}`;
          card.title = lec.title;

          // Time clean format
          let timeStr = '';
          const timeMatch = lec.dateTimeText.match(/(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/);
          if (timeMatch) {
            timeStr = `${timeMatch[1]}:${timeMatch[2]} ~ ${timeMatch[3]}:${timeMatch[4]}`;
          } else {
            timeStr = lec.dateTimeText;
          }

          const infoLink = document.createElement('a');
          infoLink.className = 'info-group';
          infoLink.href = lec.url || 'javascript:void(0);';
          infoLink.innerHTML = `
            <div class="text-title" data-role="title">${lec.title}</div>
            <div class="text-type-badge">${lec.type}</div>
            <div class="info-row" data-role="author">👤 ${lec.author}</div>
            <div class="info-row" data-role="time">⏰ ${timeStr}</div>
            <div class="info-row" data-role="location">📍 ${lec.location}</div>
            <div class="info-row" data-role="people">👥 ${lec.people}</div>
          `;
          card.appendChild(infoLink);

          const buttonGroup = document.createElement('div');
          buttonGroup.className = 'button-group';

          const btnIcs = document.createElement('button');
          btnIcs.className = 'export-btn';
          btnIcs.innerHTML = '💾 ICS';
          btnIcs.title = 'ICS 일정 파일 다운로드';
          btnIcs.addEventListener('click', (e) => {
            e.preventDefault();
            downloadICS(lec);
          });

          const btnGcal = document.createElement('button');
          btnGcal.className = 'gcal-btn';
          btnGcal.innerHTML = '📅 구글';
          btnGcal.title = '구글 캘린더에 일정 등록';
          btnGcal.addEventListener('click', (e) => {
            e.preventDefault();
            openGoogleCalendar(lec);
          });

          const btnCancel = document.createElement('button');
          if (lec.hasCancelButton) {
            btnCancel.className = 'cancel-btn';
            btnCancel.innerHTML = '❌ 취소';
            btnCancel.title = '신청 취소';
            btnCancel.addEventListener('click', (e) => {
              e.preventDefault();
              triggerCancellation(lec.qustnrSn);
            });
          } else {
            btnCancel.className = 'cancel-btn unavailable';
            btnCancel.innerHTML = '❌ 취소';
            btnCancel.title = evt.ended ? '종료된 일정이므로 취소 불가' : '하루 전날부터는 취소 불가';
            btnCancel.disabled = true;
          }

          buttonGroup.appendChild(btnIcs);
          buttonGroup.appendChild(btnGcal);
          buttonGroup.appendChild(btnCancel);
          card.appendChild(buttonGroup);

          cell.appendChild(card);
        }
      });

      grid.appendChild(cell);
    }

    calendarWrapper.appendChild(grid);

    // Insert after tab selector list
    targetContainer.parentNode.insertBefore(calendarWrapper, targetContainer.nextSibling);

    // Event hooks
    document.getElementById('btn-prev-weeks').addEventListener('click', () => {
      startOffsetWeeks -= 2;
      renderCalendar(lectures);
    });

    const resetWeeksBtn = document.getElementById('btn-reset-weeks');
    if (resetWeeksBtn) {
      resetWeeksBtn.addEventListener('click', () => {
        startOffsetWeeks = 0;
        renderCalendar(lectures);
      });
    }

    document.getElementById('btn-toggle-ended').addEventListener('click', () => {
      hideEndedLectures = !hideEndedLectures;
      renderCalendar(lectures);
    });

    document.getElementById('btn-add-personal').addEventListener('click', () => {
      openModalWithDate();
    });
  }

  // --- DETAIL PAGE / CONFLICT RESOLUTION MODE ---

  function findLectureDateTimeOnDetailPage() {
    const ths = document.querySelectorAll('th');
    let dateStr = '';
    let timeStr = '';

    // Attempt 1: Search table rows with header labels
    for (const th of ths) {
      const headerText = th.textContent.trim();
      const td = th.nextElementSibling;
      if (!td) continue;
      const valueText = td.textContent.trim().replace(/\s+/g, ' ');

      if (headerText.includes('일시') || headerText.includes('강의일시') || headerText.includes('교육일시')) {
        const match = valueText.match(/(\d{4})[-./](\d{2})[-./](\d{2})(?:\([^)]+\))?\s*(\d{2}):(\d{2})/);
        if (match) return valueText;
      }
      
      if (headerText.includes('일자') || headerText.includes('날짜') || headerText.includes('교육일') || headerText.includes('강의일')) {
        const dateMatch = valueText.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
        if (dateMatch) {
          dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        }
      }
      
      if (headerText.includes('시간') || headerText.includes('교육시간') || headerText.includes('강의시간')) {
        const timeMatch = valueText.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/);
        if (timeMatch) {
          timeStr = timeMatch[0];
        }
      }
    }

    if (dateStr && timeStr) {
      return `${dateStr} ${timeStr}`;
    }

    // Attempt 2: Fallback to searching all text nodes
    const leafElements = document.querySelectorAll('td, span, div, p');
    for (const el of leafElements) {
      if (el.children.length > 0) continue;
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      const match = text.match(/(\d{4})[-./](\d{2})[-./](\d{2})(?:\([^)]+\))?\s*(\d{2}):(\d{2})/);
      if (match) {
        return text;
      }
    }

    // Attempt 3: General search in body text
    const bodyText = document.body.innerText.replace(/\s+/g, ' ');
    const dateMatch = bodyText.match(/(\d{4})[-./](\d{2})[-./](\d{2})/);
    const timeMatch = bodyText.match(/(\d{2}):(\d{2})\s*~\s*(\d{2}):(\d{2})/);
    if (dateMatch && timeMatch) {
      return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} ${timeMatch[0]}`;
    }

    return null;
  }

  function injectWarningBanner(schedule, anchorElement) {
    const existing = document.getElementById('soma-conflict-banner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.id = 'soma-conflict-banner';
    banner.innerHTML = `
      <div class="conflict-icon">⚠️</div>
      <div class="conflict-content">
        <div class="conflict-title">일정 중복 감지 - 신청 제한됨</div>
        <div class="conflict-desc">
          이 강의 시간은 개인 일정 <strong>"${schedule.title}"</strong> (${schedule.startTime} ~ ${schedule.endTime})과 중복되므로 신청할 수 없습니다.
        </div>
      </div>
    `;
    
    if (anchorElement && anchorElement.parentNode) {
      anchorElement.parentNode.insertBefore(banner, anchorElement);
    } else {
      const contentList = document.getElementById('contentsList') || document.getElementById('pageStart');
      if (contentList) {
        contentList.insertBefore(banner, contentList.firstChild);
      }
    }
  }

  function blockApplication(conflictingSchedule) {
    console.log('SOMA Schedule Manager: blockApplication started.');
    // Collect possible apply triggers
    const applyElements = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.btn, a'));
    const targetElements = applyElements.filter(el => {
      const text = (el.textContent || el.value || '').trim();
      const onclickAttr = el.getAttribute('onclick') || '';
      return text.includes('신청') || text.includes('접수') || onclickAttr.includes('checkApply') || onclickAttr.includes('checkMento');
    });
    console.log('SOMA Schedule Manager: Target elements found to block:', targetElements);

    targetElements.forEach(el => {
      if (!el.parentNode) return;
      
      // Clone the element to strip all page event listeners (jQuery, etc.)
      const clone = el.cloneNode(true);
      
      if (clone.tagName === 'INPUT' || clone.tagName === 'BUTTON') {
        clone.disabled = true;
      }
      
      // Override styles to signal disabled state
      clone.classList.add('soma-conflict-disabled');
      clone.style.opacity = '0.5';
      clone.style.cursor = 'not-allowed';
      clone.style.pointerEvents = 'none';
      clone.removeAttribute('onclick'); // Remove inline onclick handler
      
      // Extra protection capture handler
      clone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        alert(`⚠️ 개인 일정 "${conflictingSchedule.title}"와 시간이 중복되어 신청할 수 없습니다.`);
      }, true);
      
      el.parentNode.replaceChild(clone, el);
      console.log('SOMA Schedule Manager: Replaced element with blocked clone:', el, clone);
    });

    // Find first target element parent or action wrap to inject warning banner
    const anchor = document.querySelector('.btn-area') || (targetElements[0] ? targetElements[0].parentNode : null);
    injectWarningBanner(conflictingSchedule, anchor);
  }

  async function checkLectureConflict() {
    console.log('SOMA Schedule Manager: Starting conflict check...');
    const dateTimeText = findLectureDateTimeOnDetailPage();
    console.log('SOMA Schedule Manager: findLectureDateTimeOnDetailPage returned:', dateTimeText);
    if (!dateTimeText) {
      console.log('SOMA Schedule Manager: No lecture date-time string found on detail page.');
      return;
    }
    
    const match = dateTimeText.match(/(\d{4})[-./](\d{2})[-./](\d{2})(?:\([^)]+\))?\s*(\d{2}):(\d{2})(?::\d{2})?\s*~\s*(\d{2}):(\d{2})(?::\d{2})?/);
    console.log('SOMA Schedule Manager: Regex match result:', match);
    if (!match) return;
    
    const [_, y, m, d, sh, sm, eh, em] = match;
    const lectureStart = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(sh, 10), parseInt(sm, 10), 0);
    const lectureEnd = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(eh, 10), parseInt(em, 10), 0);
    console.log('SOMA Schedule Manager: Parsed Lecture bounds:', lectureStart, 'to', lectureEnd);
    
    // Load personal schedules
    const personalSchedules = await new Promise(resolve => {
      chrome.storage.local.get(['soma_personal_schedules'], (res) => {
        resolve(res.soma_personal_schedules || []);
      });
    });
    console.log('SOMA Schedule Manager: Loaded personal schedules:', personalSchedules);
    
    // Evaluate overlaps
    let conflictingSchedule = null;
    for (const ps of personalSchedules) {
      const [py, pm, pd] = ps.dateStr.split('-');
      const [psh, psm] = ps.startTime.split(':');
      const [peh, pem] = ps.endTime.split(':');
      
      const personalStart = new Date(parseInt(py, 10), parseInt(pm, 10) - 1, parseInt(pd, 10), parseInt(psh, 10), parseInt(psm, 10), 0);
      const personalEnd = new Date(parseInt(py, 10), parseInt(pm, 10) - 1, parseInt(pd, 10), parseInt(peh, 10), parseInt(pem, 10), 0);
      
      const isOverlap = lectureStart < personalEnd && personalStart < lectureEnd;
      console.log(`SOMA Schedule Manager: Comparing with "${ps.title}" (${personalStart} ~ ${personalEnd}) -> Overlap: ${isOverlap}`);
      
      if (isOverlap) {
        conflictingSchedule = ps;
        break;
      }
    }
    
    if (conflictingSchedule) {
      console.warn(`SOMA Schedule Manager: Overlap detected with personal schedule "${conflictingSchedule.title}"`);
      blockApplication(conflictingSchedule);
    } else {
      console.log('SOMA Schedule Manager: No scheduling conflict detected.');
    }
  }

  // Wrap checking logic with DOM retries for dynamically loaded contents
  async function checkLectureConflictWithRetry() {
    console.log('SOMA Schedule Manager: Initializing conflict check with retry loop...');
    let retries = 10;
    while (retries > 0) {
      const dateTimeText = findLectureDateTimeOnDetailPage();
      const applyBtn = document.querySelector('button, input[type="submit"], input[type="button"], a.btn');
      
      if (dateTimeText && applyBtn) {
        console.log('SOMA Schedule Manager: Target DOM elements resolved.');
        await checkLectureConflict();
        return;
      }
      
      console.log(`SOMA Schedule Manager: Waiting for page content (retries remaining: ${retries})...`);
      await new Promise(resolve => setTimeout(resolve, 300));
      retries--;
    }
    
    // Fallback trigger
    await checkLectureConflict();
  }

  // --- ENTRY ROUTING ---

  async function init() {
    const path = window.location.pathname;
    
    // Routing based on path
    if (path.includes('/mypage/userAnswer/history.do') || path.includes('/mypage/mentoLec/history.do')) {
      try {
        injectModalDOM();
        const lectures = await parseLecturesTable();
        renderCalendar(lectures);
      } catch (e) {
        console.error('Failed to initialize history dashboard:', e);
      }
    }
    /*
    // Conflict checker is on the back burner for now
    else if (path.includes('/mypage/mentoLec/view.do')) {
      try {
        await checkLectureConflictWithRetry();
      } catch (e) {
        console.error('Failed to run scheduling conflict checker:', e);
      }
    }
    */
  }

  // DOM ready check
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
