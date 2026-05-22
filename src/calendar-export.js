// SOMA Schedule Manager - Calendar Export
// Generates Google Calendar "create event" URLs and downloadable ICS files locally.
// No backend, no API key. Exposes globalThis.ASMCalendarExport.

(function () {
  'use strict';

  function kstToIso(dateStr, timeStr) {
    if (!dateStr || !timeStr) return '';
    const [y, m, d] = String(dateStr).split('-').map(Number);
    const [hh, mm] = String(timeStr).split(':').map(Number);
    if ([y, m, d, hh, mm].some(Number.isNaN)) return '';
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
  }

  function toUtcCompact(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      'T' +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      'Z'
    );
  }

  function buildGoogleCalendarUrl(event) {
    const start = toUtcCompact(event?.startsAt);
    const end = toUtcCompact(event?.endsAt);
    if (!start || !end) return '';
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title || '(제목 없음)',
      dates: `${start}/${end}`,
      details: event.description || '',
      location: event.location || '',
      ctz: 'Asia/Seoul'
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function escapeIcsText(text) {
    return String(text || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r\n|\r|\n/g, '\\n');
  }

  // RFC 5545 line folding at 75 octets (char-approx; sufficient for ASCII/2-byte Korean glyphs commonly seen here)
  function foldIcsLine(line) {
    if (line.length <= 75) return line;
    const parts = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) {
      parts.push(' ' + line.slice(i, i + 74));
    }
    return parts.join('\r\n');
  }

  function buildIcsContent(event) {
    const start = toUtcCompact(event?.startsAt);
    const end = toUtcCompact(event?.endsAt);
    if (!start || !end) return '';
    const stamp = toUtcCompact(new Date().toISOString());
    const uid = event.uid || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}@asm-schedule-manager`;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ASM Schedule Manager//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      foldIcsLine(`UID:${uid}`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`)
    ];
    if (event.description) {
      lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description)}`));
    }
    if (event.location) {
      lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location)}`));
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function sanitizeFilename(name) {
    const cleaned = String(name || 'event')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    return cleaned || 'event';
  }

  function openGoogleCalendar(event) {
    const url = buildGoogleCalendarUrl(event);
    if (!url) {
      alert('일정 시간을 변환할 수 없어 Google 캘린더에 추가할 수 없습니다.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  function downloadIcs(filenameBase, event) {
    const content = buildIcsContent(event);
    if (!content) {
      alert('일정 시간을 변환할 수 없어 ICS 파일을 만들 수 없습니다.');
      return;
    }
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(filenameBase) + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function createExportButton({ label, title, className, onClick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = className;
    btn.innerHTML = label;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  // getEvent: () => { title, startsAt, endsAt, location?, description?, uid? } | null
  // Returning null cancels the export (caller may have already alerted the user).
  function appendExportButtons(container, getEvent, filenameBase) {
    const btnGcal = createExportButton({
      label: '📅 캘린더',
      title: 'Google 캘린더에 추가',
      className: 'asm-export-btn gcal-btn',
      onClick: () => {
        const event = getEvent();
        if (event) openGoogleCalendar(event);
      }
    });
    const btnIcs = createExportButton({
      label: '💾 ICS',
      title: 'ICS 파일 다운로드 (Outlook · Apple · Naver 등)',
      className: 'asm-export-btn ics-btn',
      onClick: () => {
        const event = getEvent();
        if (event) downloadIcs(filenameBase, event);
      }
    });
    container.appendChild(btnGcal);
    container.appendChild(btnIcs);
  }

  globalThis.ASMCalendarExport = {
    kstToIso,
    buildGoogleCalendarUrl,
    buildIcsContent,
    openGoogleCalendar,
    downloadIcs,
    appendExportButtons
  };
})();
