import type { EventRecord } from './events';
import { classifyLocation } from '../lib/location';
import { getSafeSomaUrl } from '../lib/safe-url';
import { iconHtml, type IconName } from '../lib/icons';

export function mkBadge(text: string, cls: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `asm-badge ${cls}`;
  el.textContent = text;
  return el;
}

function mkIconBadge(icon: IconName, text: string, cls: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = `asm-badge asm-badge-icon ${cls}`;
  el.innerHTML = `${iconHtml(icon, { size: 12 })}<span>${text}</span>`;
  return el;
}

export function makeCard(ev: EventRecord, todayStr: string): HTMLDivElement {
  const isPast = ev.date < todayStr;
  const isGray = isPast || ev.isClosed;

  const card = document.createElement('div');
  card.className = `asm-event-card ${
    isGray ? 'asm-card-gray' : 'asm-card-open asm-cat-' + ev.category
  }${ev.hasMentoringConflict ? ' asm-card-conflict' : ''}${
    ev.hasPersonalConflict ? ' asm-card-personal-conflict' : ''
  }${ev.isEnrolled ? ' asm-card-enrolled' : ''}`;
  card.setAttribute('role', 'link');
  card.setAttribute('tabindex', '0');

  card.addEventListener('click', () => {
    const safeUrl = getSafeSomaUrl(ev.url);
    if (safeUrl) {
      window.open(safeUrl, '_blank', 'noopener');
    }
  });

  card.addEventListener('keydown', (e) => {
    const safeUrl = getSafeSomaUrl(ev.url);
    if ((e.key === 'Enter' || e.key === ' ') && safeUrl) {
      e.preventDefault();
      window.open(safeUrl, '_blank', 'noopener');
    }
  });

  const badges = document.createElement('div');
  badges.className = 'asm-card-badges';

  const catBadge = document.createElement('span');
  catBadge.className = `asm-badge asm-cat-badge asm-cat-${ev.category}`;
  catBadge.textContent = ev.categoryNm;
  badges.appendChild(catBadge);

  const locInfo = ev.location ? classifyLocation(ev.location) : null;

  if (locInfo) {
    badges.appendChild(mkBadge(locInfo.label, locInfo.type === 'online' ? 'asm-online' : 'asm-offline'));
  } else if (ev.title.includes('[온라인]') || ev.title.includes('(온라인)')) {
    badges.appendChild(mkBadge('온라인', 'asm-online'));
  } else if (ev.title.includes('[오프라인]') || ev.title.includes('(오프라인)')) {
    badges.appendChild(mkBadge('오프라인', 'asm-offline'));
  }

  const statusLabel = isPast ? '진행완료' : ev.isClosed ? '마감' : '접수중';
  const statusCls = isPast ? 'asm-done' : ev.isClosed ? 'asm-closed' : 'asm-open-badge';

  badges.appendChild(mkBadge(statusLabel, statusCls));

  if (ev.isEnrolled) {
    badges.appendChild(mkIconBadge('check', '수강중', 'asm-enrolled'));
  }

  if (ev.hasPersonalConflict) {
    badges.appendChild(mkBadge('개인일정주의', 'asm-personal-conflict'));
  }

  if (ev.hasMentoringConflict) {
    badges.appendChild(mkBadge('멘토링일정주의', 'asm-conflict'));
  }

  card.appendChild(badges);

  const titleEl = document.createElement('div');
  titleEl.className = 'asm-card-title';
  titleEl.textContent = ev.title;
  card.appendChild(titleEl);

  const footer = document.createElement('div');
  footer.className = 'asm-card-footer';

  if (ev.author) {
    const author = document.createElement('div');
    author.className = 'asm-card-author';
    author.textContent = ev.author + ' 멘토';
    footer.appendChild(author);
  }

  if (ev.timeStart) {
    const time = document.createElement('div');
    time.className = 'asm-card-time';
    time.textContent = `${ev.timeStart} ~ ${ev.timeEnd}`;
    footer.appendChild(time);
  }

  const bottom = document.createElement('div');
  bottom.className = 'asm-card-footer-bottom';

  if (ev.current !== '' && ev.total !== '') {
    const cap = document.createElement('span');
    cap.className = 'asm-cap';
    cap.textContent = `${ev.current}/${ev.total}명`;
    bottom.appendChild(cap);
  } else {
    bottom.appendChild(document.createElement('span'));
  }

  const linkEl = document.createElement('a');
  linkEl.className = 'asm-card-link';
  linkEl.href = getSafeSomaUrl(ev.url) || '#';
  linkEl.target = '_blank';
  linkEl.textContent = '바로가기 →';
  linkEl.addEventListener('click', (e) => e.stopPropagation());

  bottom.appendChild(linkEl);
  footer.appendChild(bottom);

  const exporter = globalThis.ASMCalendarExport;
  if (ev.timeStart && ev.timeEnd && ev.date && exporter) {
    const exportRow = document.createElement('div');
    exportRow.className = 'asm-card-export-row';
    exporter.appendExportButtons(
      exportRow,
      () => {
        const safeUrl = getSafeSomaUrl(ev.url);
        const description = [
          ev.categoryNm,
          ev.author ? `${ev.author} 멘토` : '',
          safeUrl ? `상세: ${safeUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n');
        return {
          title: ev.title,
          description,
          location: ev.location || '',
          startsAt: exporter.kstToIso(ev.date, ev.timeStart),
          endsAt: exporter.kstToIso(ev.date, ev.timeEnd),
        };
      },
      ev.title
    );
    footer.appendChild(exportRow);
  }

  card.appendChild(footer);

  return card;
}
