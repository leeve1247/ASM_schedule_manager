const ALLOWED_FETCH_ORIGINS = new Set([
  'https://asm-schedule-alarm.pa6764.workers.dev'
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'asm-worker-fetch') return undefined;

  const { url, options = {} } = message;
  if (!url) {
    sendResponse({ ok: false, error: 'Missing request URL.' });
    return false;
  }

  (async () => {
    try {
      const targetUrl = new URL(url);
      if (!ALLOWED_FETCH_ORIGINS.has(targetUrl.origin)) {
        sendResponse({ ok: false, status: 403, error: 'Blocked extension fetch target.' });
        return;
      }

      const response = await fetch(targetUrl.toString(), options);
      const text = await response.text();

      sendResponse({
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error?.message || 'Network request failed.'
      });
    }
  })();

  return true;
});
