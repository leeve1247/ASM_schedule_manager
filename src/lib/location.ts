export interface LocationInfo {
  type: 'online' | 'offline';
  label: string;
}

export function classifyLocation(text: string | null | undefined): LocationInfo | null {
  if (!text) return null;

  const t = text.trim();
  if (!t) return null;

  if (t.includes('온라인') || /zoom|meet|teams|webex/i.test(t)) {
    return { type: 'online', label: '온라인' };
  }

  return { type: 'offline', label: '오프라인' };
}

export function getCancelDeadlineHours(locationText: string | null | undefined): number {
  const normalized = (locationText || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (normalized.includes('온라인') || /webex|zoom|meet|teams/.test(normalized)) {
    return 24;
  }
  return 96;
}

export function getCancelPolicyReason(locationText: string | null | undefined): string {
  return getCancelDeadlineHours(locationText) === 24
    ? '온라인 일정은 시작 24시간 전까지만 취소 가능'
    : '오프라인 일정은 시작 96시간 전까지만 취소 가능';
}
