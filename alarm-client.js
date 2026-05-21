(function () {
  'use strict';

  const ALARM_SETTINGS_KEY = 'soma_alarm_sync_settings';
  const ALARM_SYNC_META_KEY = 'soma_alarm_sync_meta';
  const CENTRAL_WORKER_BASE_URL = 'https://asm-schedule-alarm.pa6764.workers.dev';

  let lastAutoSyncSignature = '';

  function parseLectureDateTimeText(dateTimeText) {
    if (!dateTimeText) return null;

    const normalized = dateTimeText.replace(/\s+/g, ' ').trim();
    const dateMatch = normalized.match(/(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})/);
    if (!dateMatch) return null;

    const timeSource = normalized.slice((dateMatch.index || 0) + dateMatch[0].length);
    const timeMatch = timeSource.match(
      /(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*시?\s*[~\-]\s*(?:(오전|오후)\s*)?(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?\s*시?/
    );
    if (!timeMatch) return null;

    const [, y, m, d] = dateMatch;
    const [, startMeridiem, startHourRaw, startMinuteRaw = '00', endMeridiem, endHourRaw, endMinuteRaw = '00'] = timeMatch;

    const normalizeHour = (hourRaw, meridiem) => {
      let hour = parseInt(hourRaw, 10);
      if (Number.isNaN(hour)) return null;
      if (meridiem === '오전' && hour === 12) hour = 0;
      if (meridiem === '오후' && hour < 12) hour += 12;
      return String(hour).padStart(2, '0');
    };

    const sh = normalizeHour(startHourRaw, startMeridiem);
    const eh = normalizeHour(endHourRaw, endMeridiem);
    if (!sh || !eh) return null;

    return {
      y,
      m: String(parseInt(m, 10)).padStart(2, '0'),
      d: String(parseInt(d, 10)).padStart(2, '0'),
      sh,
      sm: String(parseInt(startMinuteRaw, 10)).padStart(2, '0'),
      eh,
      em: String(parseInt(endMinuteRaw, 10)).padStart(2, '0')
    };
  }

  function isLectureEnded(dateTimeText) {
    const parsed = parseLectureDateTimeText(dateTimeText);
    if (!parsed) return false;
    const endTime = new Date(
      parseInt(parsed.y, 10),
      parseInt(parsed.m, 10) - 1,
      parseInt(parsed.d, 10),
      parseInt(parsed.eh, 10),
      parseInt(parsed.em, 10),
      0
    );
    return endTime < new Date();
  }

  function buildKstIsoString(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hh, mm] = timeStr.split(':').map(Number);
    if ([y, m, d, hh, mm].some(Number.isNaN)) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
  }

  function pickLectureTimes(dateTimeText, dateStr) {
    const parsed = parseLectureDateTimeText(dateTimeText);
    if (!parsed) return { startAt: '', endAt: '' };

    const normalizedDateStr = dateStr || `${parsed.y}-${parsed.m}-${parsed.d}`;
    return {
      startAt: buildKstIsoString(normalizedDateStr, `${parsed.sh}:${parsed.sm}`) || '',
      endAt: buildKstIsoString(normalizedDateStr, `${parsed.eh}:${parsed.em}`) || ''
    };
  }

  function deriveAlarmUserId(settings = {}) {
    return (settings.userId || '').trim().toLowerCase();
  }

  function sanitizeAlarmSettings(input = {}) {
    return {
      workerBaseUrl: CENTRAL_WORKER_BASE_URL,
      userId: (input.userId || '').trim().toLowerCase(),
      userLabel: (input.userLabel || '').trim(),
      discordWebhookUrl: (input.discordWebhookUrl || '').trim(),
      notificationsEnabled: input.notificationsEnabled !== false,
      autoSyncEnabled: input.autoSyncEnabled !== false
    };
  }

  async function loadAlarmSettings() {
    return new Promise(resolve => {
      chrome.storage.local.get([ALARM_SETTINGS_KEY], (result) => {
        resolve(sanitizeAlarmSettings(result[ALARM_SETTINGS_KEY] || {}));
      });
    });
  }

  async function saveAlarmSettings(settings) {
    const sanitized = sanitizeAlarmSettings(settings);
    await new Promise(resolve => {
      chrome.storage.local.set({ [ALARM_SETTINGS_KEY]: sanitized }, resolve);
    });
    return sanitized;
  }

  async function saveAlarmSyncMeta(meta) {
    await new Promise(resolve => {
      chrome.storage.local.set({
        [ALARM_SYNC_META_KEY]: {
          ...meta,
          updatedAt: Date.now()
        }
      }, resolve);
    });
  }

  async function loadAlarmSyncMeta() {
    return new Promise(resolve => {
      chrome.storage.local.get([ALARM_SYNC_META_KEY], (result) => {
        resolve(result[ALARM_SYNC_META_KEY] || null);
      });
    });
  }

  async function extensionFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'asm-worker-fetch',
        url,
        options
      }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message || '확장 프로그램 백그라운드 요청에 실패했습니다.'));
          return;
        }

        if (!response) {
          reject(new Error('백그라운드 응답이 비어 있습니다.'));
          return;
        }

        resolve(response);
      });
    });
  }

  function lectureToAlarmSchedule(lecture) {
    if (!lecture?.dateStr || !lecture?.dateTimeText) return null;
    const { startAt, endAt } = pickLectureTimes(lecture.dateTimeText, lecture.dateStr);
    if (!startAt || !endAt) return null;

    return {
      sourceEventId: lecture.qustnrSn || `${lecture.dateStr}_${lecture.title}_${lecture.type}`,
      title: lecture.title,
      lectureType: lecture.type,
      mentorName: lecture.mentorName || lecture.author || '',
      startsAt: startAt,
      endsAt: endAt,
      location: lecture.location || '',
      status: lecture.deadlineStatus || lecture.status || '',
      detailUrl: lecture.url ? new URL(lecture.url, window.location.origin).toString() : '',
      cancelable: Boolean(lecture.hasCancelButton)
    };
  }

  function buildAlarmPayload(lectures, settings) {
    const now = Date.now();
    const parseFailures = [];
    const lectureFailures = [];

    const lectureCandidates = lectures
      .filter(lecture => !isLectureEnded(lecture.dateTimeText))
      .map(lecture => {
        const schedule = lectureToAlarmSchedule(lecture);
        if (!schedule) {
          parseFailures.push({ title: lecture.title, raw: lecture.dateTimeText });
          lectureFailures.push({ title: lecture.title, raw: lecture.dateTimeText });
        }
        return { lecture, schedule };
      })
      .filter(item => item?.schedule);

    const lectureDroppedAsPast = [];
    const schedules = lectureCandidates
      .map(item => {
        const startsAt = new Date(item.schedule.startsAt).getTime();
        if (Number.isNaN(startsAt) || startsAt < now) {
          lectureDroppedAsPast.push({
            title: item.lecture.title,
            raw: item.lecture.dateTimeText,
            startsAt: item.schedule.startsAt
          });
          return null;
        }
        return item.schedule;
      })
      .filter(Boolean);

    return {
      userId: deriveAlarmUserId(settings) || 'default-user',
      userLabel: settings.userLabel || '',
      notifyEnabled: settings.notificationsEnabled,
      notificationTargets: {
        discordWebhookUrl: settings.discordWebhookUrl
      },
      schedules,
      parseFailures,
      debug: {
        nowIso: new Date(now).toISOString(),
        lectureInputCount: lectures.length,
        lectureScheduleCount: schedules.length,
        lectureFailures,
        lectureDroppedAsPast: lectureDroppedAsPast.slice(0, 5)
      }
    };
  }

  function getAlarmPayloadSignature(payload) {
    return JSON.stringify({
      userId: payload.userId,
      userLabel: payload.userLabel,
      notifyEnabled: payload.notifyEnabled,
      notificationTargets: payload.notificationTargets,
      schedules: payload.schedules.map(schedule => ({
        sourceEventId: schedule.sourceEventId,
        title: schedule.title,
        lectureType: schedule.lectureType,
        mentorName: schedule.mentorName,
        startsAt: schedule.startsAt,
        endsAt: schedule.endsAt,
        location: schedule.location,
        status: schedule.status,
        detailUrl: schedule.detailUrl,
        cancelable: schedule.cancelable
      }))
    });
  }

  async function syncSchedulesToCloudflare(lectures, settings, options = {}) {
    const syncSettings = sanitizeAlarmSettings(settings);
    if (!deriveAlarmUserId(syncSettings)) {
      throw new Error('소마 계정 이메일을 먼저 입력해야 합니다.');
    }
    if (!syncSettings.discordWebhookUrl) {
      throw new Error('Discord Webhook URL을 먼저 입력해야 합니다.');
    }

    const payload = buildAlarmPayload(lectures, syncSettings);
    console.log('ASM alarm payload debug:', payload.debug);

    if (payload.schedules.length === 0 && !options.allowEmptySchedules) {
      if (payload.parseFailures.length > 0) {
        const firstFailure = payload.parseFailures[0];
        throw new Error(`일정 ${payload.parseFailures.length}건의 시간 파싱에 실패했습니다. 예: ${firstFailure.title} / ${firstFailure.raw}`);
      }
      throw new Error('동기화할 예정된 신청 일정이 없습니다.');
    }

    const signature = getAlarmPayloadSignature(payload);
    const lastSyncMeta = await loadAlarmSyncMeta();
    const lastSignature = lastSyncMeta?.signature || '';
    if (options.auto && (signature === lastSignature || signature === lastAutoSyncSignature)) {
      await saveAlarmSyncMeta({
        success: true,
        skipped: true,
        signature,
        scheduleCount: payload.schedules.length,
        workerBaseUrl: syncSettings.workerBaseUrl,
        message: '변경된 일정이 없어 동기화를 건너뛰었습니다.'
      });
      return { skipped: true, message: '변경된 일정이 없어 동기화를 건너뛰었습니다.' };
    }

    const response = await extensionFetch(`${syncSettings.workerBaseUrl}/api/public/schedules/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = response.text || '';
    let data = null;
    try {
      data = responseText ? JSON.parse(responseText) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      const message = data?.error || data?.message || response.error || `동기화 요청이 실패했습니다. (${response.status || 'network'})`;
      throw new Error(message);
    }

    lastAutoSyncSignature = signature;
    await saveAlarmSyncMeta({
      success: true,
      skipped: false,
      signature,
      scheduleCount: payload.schedules.length,
      workerBaseUrl: syncSettings.workerBaseUrl
    });

    return {
      skipped: false,
      scheduleCount: payload.schedules.length,
      message: data?.message || `일정 ${payload.schedules.length}건을 동기화했습니다.`
    };
  }

  async function openAlarmSettingsModal({ lectures, onSaved }) {
    let modal = document.getElementById('alarm-settings-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'alarm-settings-modal';
      modal.className = 'modal-backdrop';
      modal.style.display = 'none';
      document.body.appendChild(modal);
    }

    const currentSettings = await loadAlarmSettings();
    modal.innerHTML = `
      <div class="modal-content alarm-settings-modal-content">
        <div class="modal-header">
          <h4>🔔 알림 설정</h4>
          <button type="button" class="close-modal-btn">&times;</button>
        </div>
        <form id="alarm-settings-form">
          <div class="alarm-settings-grid">
            <label class="alarm-settings-field">
              <span>소마 계정 이메일</span>
              <input type="email" name="userId" placeholder="예: user@soma.or.kr" value="${currentSettings.userId}">
            </label>
            <label class="alarm-settings-field">
              <span>표시 이름</span>
              <input type="text" name="userLabel" placeholder="예: 재민" value="${currentSettings.userLabel}">
            </label>
            <label class="alarm-settings-field alarm-settings-field--full">
              <span>Discord Webhook URL</span>
              <input type="url" name="discordWebhookUrl" placeholder="https://discord.com/api/webhooks/..." value="${currentSettings.discordWebhookUrl}">
            </label>
          </div>
          <div class="alarm-settings-actions">
            <button type="submit" class="control-btn accent">설정 저장</button>
            <button type="button" class="control-btn secondary btn-cancel-alarm-setup">취소</button>
          </div>
        </form>
      </div>
    `;

    const closeModal = () => {
      modal.style.display = 'none';
    };

    modal.style.display = 'flex';
    const form = modal.querySelector('#alarm-settings-form');
    const closeBtn = modal.querySelector('.close-modal-btn');
    const cancelBtn = modal.querySelector('.btn-cancel-alarm-setup');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    }, { once: true });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const nextSettings = await saveAlarmSettings({
        ...currentSettings,
        userId: form.userId.value,
        userLabel: form.userLabel.value,
        discordWebhookUrl: form.discordWebhookUrl.value,
        notificationsEnabled: true,
        autoSyncEnabled: currentSettings.autoSyncEnabled
      });

      try {
        await syncSchedulesToCloudflare(lectures, nextSettings, { auto: false });
        closeModal();
        if (typeof onSaved === 'function') {
          await onSaved();
        }
      } catch (error) {
        alert(error.message || '알림 설정 저장에 실패했습니다.');
      }
    });
  }

  async function toggleAlarmNotifications({ lectures, onChanged }) {
    const currentSettings = await loadAlarmSettings();
    const isConfigured = Boolean(currentSettings.userId && currentSettings.discordWebhookUrl);

    if (!isConfigured) {
      await openAlarmSettingsModal({ lectures, onSaved: onChanged });
      return { configured: false };
    }

    const nextSettings = await saveAlarmSettings({
      ...currentSettings,
      notificationsEnabled: !currentSettings.notificationsEnabled
    });

    try {
      await syncSchedulesToCloudflare(lectures, nextSettings, {
        auto: false,
        allowEmptySchedules: true
      });
    } catch (error) {
      console.error('Failed to toggle alarm notifications:', error);
    }

    if (typeof onChanged === 'function') {
      await onChanged();
    }

    return {
      configured: true,
      notificationsEnabled: nextSettings.notificationsEnabled
    };
  }

  async function syncSchedulesAfterLocalChange() {
    return { skipped: true, message: '개인 일정 변경은 알림 동기화 대상이 아닙니다.' };
  }

  async function syncSchedulesOnHistoryPageLoadIfConfigured(lectures) {
    const settings = await loadAlarmSettings();
    if (!settings.autoSyncEnabled) return null;
    if (!settings.discordWebhookUrl || !deriveAlarmUserId(settings)) return null;

    try {
      return await syncSchedulesToCloudflare(lectures, settings, { auto: true });
    } catch (error) {
      console.error('Auto sync on history page load failed:', error);
      await saveAlarmSyncMeta({
        success: false,
        skipped: false,
        message: error.message || '페이지 로드 자동 동기화 실패'
      });
      return null;
    }
  }

  globalThis.ASMAlarmFeature = {
    loadSettings: loadAlarmSettings,
    toggleNotifications: toggleAlarmNotifications,
    syncAfterLocalChange: syncSchedulesAfterLocalChange,
    syncOnHistoryPageLoadIfConfigured: syncSchedulesOnHistoryPageLoadIfConfigured
  };
})();
