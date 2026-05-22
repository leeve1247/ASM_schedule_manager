const ALLOWED_FETCH_ORIGINS = new Set<string>([
  'https://asm-schedule-alarm.pa6764.workers.dev',
]);

interface WorkerFetchMessage {
  type: 'asm-worker-fetch';
  url: string;
  options?: RequestInit;
}

interface WorkerFetchSuccess {
  ok: boolean;
  status: number;
  statusText: string;
  text: string;
}

interface WorkerFetchFailure {
  ok: false;
  status?: number;
  error: string;
}

type WorkerFetchResponse = WorkerFetchSuccess | WorkerFetchFailure;

function isWorkerFetchMessage(value: unknown): value is WorkerFetchMessage {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  return msg.type === 'asm-worker-fetch' && typeof msg.url === 'string';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isWorkerFetchMessage(message)) return undefined;

  const { url, options = {} } = message;

  (async () => {
    const respond = (payload: WorkerFetchResponse) => sendResponse(payload);
    try {
      const targetUrl = new URL(url);
      if (!ALLOWED_FETCH_ORIGINS.has(targetUrl.origin)) {
        respond({ ok: false, status: 403, error: 'Blocked extension fetch target.' });
        return;
      }

      const response = await fetch(targetUrl.toString(), options);
      const text = await response.text();

      respond({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed.';
      respond({ ok: false, error: message });
    }
  })();

  return true;
});
