// Personal schedule creation/editing modal.

import {
  loadPersonalSchedules,
  savePersonalSchedules,
  type PersonalSchedule,
} from '../lib/personal-schedule';

let editingScheduleId: string | null = null;
let onSavedCallback: (() => Promise<void> | void) | null = null;

export function setOnPersonalScheduleSaved(cb: () => Promise<void> | void): void {
  onSavedCallback = cb;
}

export function injectModalDOM(): void {
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
          <label>장소 (선택)</label>
          <div class="location-type-row">
            <button type="button" class="location-type-btn active" data-type="online">온라인</button>
            <button type="button" class="location-type-btn" data-type="offline">오프라인</button>
          </div>
          <input type="text" id="schedule-location" class="location-detail-input" placeholder="링크 또는 플랫폼 (선택)">
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
  const startSelect = modal.querySelector<HTMLSelectElement>('#schedule-start-time')!;
  const endSelect = modal.querySelector<HTMLSelectElement>('#schedule-end-time')!;
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
  const dateInput = modal.querySelector<HTMLInputElement>('#schedule-date')!;
  const getFormattedDate = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  modal.querySelector<HTMLButtonElement>('[data-preset="today"]')!.addEventListener('click', () => {
    dateInput.value = getFormattedDate(0);
  });
  modal.querySelector<HTMLButtonElement>('[data-preset="tomorrow"]')!.addEventListener('click', () => {
    dateInput.value = getFormattedDate(1);
  });

  // Location type toggle
  const locationBtns = modal.querySelectorAll<HTMLButtonElement>('.location-type-btn');
  const locationInput = modal.querySelector<HTMLInputElement>('#schedule-location')!;
  const locationPlaceholders: Record<string, string> = {
    online: '링크 또는 플랫폼 (선택)',
    offline: '장소 또는 주소 (선택)',
  };
  locationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      locationBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type || 'online';
      locationInput.placeholder = locationPlaceholders[type];
    });
  });

  // Close listeners
  const closeBtn = modal.querySelector<HTMLButtonElement>('.close-modal-btn')!;
  const cancelBtn = modal.querySelector<HTMLButtonElement>('.btn-cancel')!;
  const closeModal = () => {
    modal.style.display = 'none';
  };

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Form submission
  const form = document.getElementById('personal-schedule-form') as HTMLFormElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = (document.getElementById('schedule-title') as HTMLInputElement).value.trim();
    const dateStr = (document.getElementById('schedule-date') as HTMLInputElement).value;
    const startTime = (document.getElementById('schedule-start-time') as HTMLSelectElement).value;
    const endTime = (document.getElementById('schedule-end-time') as HTMLSelectElement).value;
    const description = (document.getElementById('schedule-desc') as HTMLTextAreaElement).value.trim();
    const activeLocBtn = modal.querySelector<HTMLButtonElement>('.location-type-btn.active');
    const locationType = (activeLocBtn?.dataset.type === 'offline' ? 'offline' : 'online') as
      | 'online'
      | 'offline';
    const location = (document.getElementById('schedule-location') as HTMLInputElement).value.trim();

    if (startTime >= endTime) {
      alert('종료 시간은 시작 시간보다 늦어야 합니다.');
      return;
    }

    const currentList = await loadPersonalSchedules();

    if (editingScheduleId) {
      const index = currentList.findIndex((item) => item.id === editingScheduleId);
      if (index !== -1) {
        currentList[index] = {
          ...currentList[index],
          title,
          dateStr,
          startTime,
          endTime,
          description,
          locationType,
          location,
        };
      }
    } else {
      const newSchedule: PersonalSchedule = {
        id: 'personal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        title,
        dateStr,
        startTime,
        endTime,
        description,
        locationType,
        location,
      };
      currentList.push(newSchedule);
    }

    try {
      await savePersonalSchedules(currentList);
    } catch (error) {
      console.error('SOMA Schedule Manager: Failed to save personal schedule:', error);
      const msg = error instanceof Error ? error.message : '개인 일정 저장에 실패했습니다.';
      alert(msg);
      return;
    }

    closeModal();
    form.reset();
    editingScheduleId = null;
    startSelect.value = '09:00';
    endSelect.value = '10:00';

    if (onSavedCallback) await onSavedCallback();
  });
}

export function openModalWithDate(dateStr?: string): void {
  injectModalDOM();
  const modal = document.getElementById('personal-schedule-modal');
  if (!modal) return;

  editingScheduleId = null;
  const headerTitle = modal.querySelector<HTMLElement>('.modal-header h4');
  if (headerTitle) headerTitle.textContent = '➕ 새 개인 일정 등록';

  const dateInput = modal.querySelector<HTMLInputElement>('#schedule-date');
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

  // Reset fields
  const titleInput = modal.querySelector<HTMLInputElement>('#schedule-title');
  if (titleInput) titleInput.value = '';
  const descTextarea = modal.querySelector<HTMLTextAreaElement>('#schedule-desc');
  if (descTextarea) descTextarea.value = '';
  modal.querySelectorAll<HTMLButtonElement>('.location-type-btn').forEach((b) => b.classList.remove('active'));
  const onlineBtn = modal.querySelector<HTMLButtonElement>('.location-type-btn[data-type="online"]');
  if (onlineBtn) onlineBtn.classList.add('active');
  const locInput = modal.querySelector<HTMLInputElement>('#schedule-location');
  if (locInput) {
    locInput.value = '';
    locInput.placeholder = '링크 또는 플랫폼 (선택)';
  }

  modal.style.display = 'flex';
  if (titleInput) titleInput.focus();
}

export function openModalForEditing(ps: PersonalSchedule): void {
  injectModalDOM();
  const modal = document.getElementById('personal-schedule-modal');
  if (!modal) return;

  editingScheduleId = ps.id;
  const headerTitle = modal.querySelector<HTMLElement>('.modal-header h4');
  if (headerTitle) headerTitle.textContent = '✏️ 개인 일정 수정';

  // Populate existing values
  (modal.querySelector('#schedule-title') as HTMLInputElement).value = ps.title;
  (modal.querySelector('#schedule-date') as HTMLInputElement).value = ps.dateStr;
  (modal.querySelector('#schedule-start-time') as HTMLSelectElement).value = ps.startTime;
  (modal.querySelector('#schedule-end-time') as HTMLSelectElement).value = ps.endTime;
  (modal.querySelector('#schedule-desc') as HTMLTextAreaElement).value = ps.description || '';
  modal.querySelectorAll<HTMLButtonElement>('.location-type-btn').forEach((b) => b.classList.remove('active'));
  const lt = ps.locationType || 'online';
  const activeLocBtn = modal.querySelector<HTMLButtonElement>(`.location-type-btn[data-type="${lt}"]`);
  if (activeLocBtn) activeLocBtn.classList.add('active');
  const locInput = modal.querySelector<HTMLInputElement>('#schedule-location');
  if (locInput) {
    locInput.value = ps.location || '';
    locInput.placeholder = lt === 'offline' ? '장소 또는 주소 (선택)' : '링크 또는 플랫폼 (선택)';
  }

  modal.style.display = 'flex';
  const titleInput = modal.querySelector<HTMLInputElement>('#schedule-title');
  if (titleInput) titleInput.focus();
}
