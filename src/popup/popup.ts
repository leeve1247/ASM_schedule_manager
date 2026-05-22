// Popup script — controls Google Calendar OAuth connect/disconnect UI.

interface GcalStatusResponse {
  connected: boolean;
}

interface GcalConnectResponse {
  connected: boolean;
  error?: string;
}

const statusEl = document.getElementById('gcal-status') as HTMLDivElement;
const actionEl = document.getElementById('gcal-action') as HTMLDivElement;
const errorEl = document.getElementById('gcal-error') as HTMLDivElement;

function sendBackgroundMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'Background message failed.'));
        return;
      }
      resolve(response as T);
    });
  });
}

function setError(message: string | null): void {
  if (!message) {
    errorEl.hidden = true;
    errorEl.textContent = '';
  } else {
    errorEl.hidden = false;
    errorEl.textContent = message;
  }
}

function renderConnected(): void {
  statusEl.className = 'status-row status-connected';
  statusEl.innerHTML = '<span class="status-text">✓ 연동됨</span>';
  actionEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'button button-secondary';
  btn.textContent = '연결 해제';
  btn.addEventListener('click', () => {
    void handleDisconnect(btn);
  });
  actionEl.appendChild(btn);
}

function renderDisconnected(): void {
  statusEl.className = 'status-row status-disconnected';
  statusEl.innerHTML = '<span class="status-text">연동되지 않음</span>';
  actionEl.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'button button-primary';
  btn.textContent = '🗓 연동하기';
  btn.addEventListener('click', () => {
    void handleConnect(btn);
  });
  actionEl.appendChild(btn);
}

function renderLoading(label: string): void {
  statusEl.className = 'status-row status-loading';
  statusEl.innerHTML = `<span class="status-text">${label}</span>`;
  actionEl.innerHTML = '';
}

async function handleConnect(button: HTMLButtonElement): Promise<void> {
  setError(null);
  button.disabled = true;
  button.textContent = '인증 중…';
  try {
    const res = await sendBackgroundMessage<GcalConnectResponse>({ type: 'asm-gcal-connect' });
    if (res.connected) {
      renderConnected();
    } else {
      renderDisconnected();
      if (res.error) setError(res.error);
    }
  } catch (err) {
    renderDisconnected();
    setError(err instanceof Error ? err.message : '연동 중 오류가 발생했습니다.');
  }
}

async function handleDisconnect(button: HTMLButtonElement): Promise<void> {
  setError(null);
  button.disabled = true;
  button.textContent = '해제 중…';
  try {
    await sendBackgroundMessage({ type: 'asm-gcal-disconnect' });
  } catch (err) {
    setError(err instanceof Error ? err.message : '연결 해제 중 오류가 발생했습니다.');
  }
  renderDisconnected();
}

async function init(): Promise<void> {
  renderLoading('상태 확인 중…');
  try {
    const res = await sendBackgroundMessage<GcalStatusResponse>({ type: 'asm-gcal-status' });
    if (res.connected) renderConnected();
    else renderDisconnected();
  } catch (err) {
    renderDisconnected();
    setError(err instanceof Error ? err.message : '상태를 확인할 수 없습니다.');
  }
}

void init();
