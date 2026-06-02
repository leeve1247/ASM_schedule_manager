import {
  clearEventCache as gcalClearEventCache,
  connect as gcalConnect,
  disconnect as gcalDisconnect,
  isConnected as gcalIsConnected,
  matchLectures as gcalMatchLectures,
  type LectureMatchInput,
} from '@features/google-calendar/google-calendar';

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

interface GcalStatusMessage {
  type: 'asm-gcal-status';
}
interface GcalConnectMessage {
  type: 'asm-gcal-connect';
}
interface GcalDisconnectMessage {
  type: 'asm-gcal-disconnect';
}
interface GcalMatchMessage {
  type: 'asm-gcal-match';
  lectures: LectureMatchInput[];
}
interface GcalClearCacheMessage {
  type: 'asm-gcal-clear-cache';
}

type IncomingMessage =
  | WorkerFetchMessage
  | GcalStatusMessage
  | GcalConnectMessage
  | GcalDisconnectMessage
  | GcalMatchMessage
  | GcalClearCacheMessage;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function classifyMessage(value: unknown): IncomingMessage | null {
  if (!isObject(value)) return null;
  const type = value.type;
  if (type === 'asm-worker-fetch' && typeof value.url === 'string') {
    return value as unknown as WorkerFetchMessage;
  }
  if (type === 'asm-gcal-status') return { type };
  if (type === 'asm-gcal-connect') return { type };
  if (type === 'asm-gcal-disconnect') return { type };
  if (type === 'asm-gcal-match' && Array.isArray(value.lectures)) {
    return { type, lectures: value.lectures as LectureMatchInput[] };
  }
  if (type === 'asm-gcal-clear-cache') return { type };
  return null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const msg = classifyMessage(message);
  if (!msg) return undefined;

  (async () => {
    if (msg.type === 'asm-worker-fetch') {
      const respond = (payload: WorkerFetchResponse) => sendResponse(payload);
      try {
        const targetUrl = new URL(msg.url);
        if (!ALLOWED_FETCH_ORIGINS.has(targetUrl.origin)) {
          respond({ ok: false, status: 403, error: 'Blocked extension fetch target.' });
          return;
        }

        const response = await fetch(targetUrl.toString(), msg.options ?? {});
        const text = await response.text();

        respond({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          text,
        });
      } catch (error) {
        const m = error instanceof Error ? error.message : 'Network request failed.';
        respond({ ok: false, error: m });
      }
      return;
    }

    if (msg.type === 'asm-gcal-status') {
      const connected = await gcalIsConnected();
      sendResponse({ connected });
      return;
    }

    if (msg.type === 'asm-gcal-connect') {
      const res = await gcalConnect();
      sendResponse(res);
      return;
    }

    if (msg.type === 'asm-gcal-disconnect') {
      await gcalDisconnect();
      sendResponse({ connected: false });
      return;
    }

    if (msg.type === 'asm-gcal-match') {
      const res = await gcalMatchLectures(msg.lectures);
      sendResponse(res);
      return;
    }

    if (msg.type === 'asm-gcal-clear-cache') {
      await gcalClearEventCache();
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});
