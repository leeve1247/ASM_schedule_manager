import {
  clearEventCache as clearGoogleCalendarEventCache,
  connect as connectGoogleCalendar,
  disconnect as disconnectGoogleCalendar,
  isConnected as isGoogleCalendarConnected,
  matchLectures as matchGoogleCalendarLectures,
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

interface GoogleCalendarStatusMessage {
  type: 'asm-google-calendar-status';
}
interface GoogleCalendarConnectMessage {
  type: 'asm-google-calendar-connect';
}
interface GoogleCalendarDisconnectMessage {
  type: 'asm-google-calendar-disconnect';
}
interface GoogleCalendarMatchMessage {
  type: 'asm-google-calendar-match';
  lectures: LectureMatchInput[];
}
interface GoogleCalendarClearCacheMessage {
  type: 'asm-google-calendar-clear-cache';
}

type IncomingMessage =
  | WorkerFetchMessage
  | GoogleCalendarStatusMessage
  | GoogleCalendarConnectMessage
  | GoogleCalendarDisconnectMessage
  | GoogleCalendarMatchMessage
  | GoogleCalendarClearCacheMessage;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function classifyMessage(value: unknown): IncomingMessage | null {
  if (!isObject(value)) return null;
  const type = value.type;
  if (type === 'asm-worker-fetch' && typeof value.url === 'string') {
    return value as unknown as WorkerFetchMessage;
  }
  if (type === 'asm-google-calendar-status') return { type };
  if (type === 'asm-google-calendar-connect') return { type };
  if (type === 'asm-google-calendar-disconnect') return { type };
  if (type === 'asm-google-calendar-match' && Array.isArray(value.lectures)) {
    return { type, lectures: value.lectures as LectureMatchInput[] };
  }
  if (type === 'asm-google-calendar-clear-cache') return { type };
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

    if (msg.type === 'asm-google-calendar-status') {
      const connected = await isGoogleCalendarConnected();
      sendResponse({ connected });
      return;
    }

    if (msg.type === 'asm-google-calendar-connect') {
      const res = await connectGoogleCalendar();
      sendResponse(res);
      return;
    }

    if (msg.type === 'asm-google-calendar-disconnect') {
      await disconnectGoogleCalendar();
      sendResponse({ connected: false });
      return;
    }

    if (msg.type === 'asm-google-calendar-match') {
      const res = await matchGoogleCalendarLectures(msg.lectures);
      sendResponse(res);
      return;
    }

    if (msg.type === 'asm-google-calendar-clear-cache') {
      await clearGoogleCalendarEventCache();
      sendResponse({ ok: true });
      return;
    }
  })();

  return true;
});
