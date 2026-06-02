export function getSafeSomaUrl(url: string | undefined | null): string {
  try {
    const parsed = new URL(url || '', window.location.origin);
    if (parsed.protocol === 'https:' && /(^|\.)swmaestro\.(ai|org)$/i.test(parsed.hostname)) {
      return parsed.toString();
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}
