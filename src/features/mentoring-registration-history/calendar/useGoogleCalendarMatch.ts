// Google Calendar match orchestration for the dashboard calendar. Owns the
// match state, the "just registered" feedback pulse, and the focus/visibility
// re-sync that refreshes the match when the user returns from Google Calendar.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MentoringSchedule } from '@features/schedules/mentoring-schedule';
import type { GoogleCalendarMatchResponse } from './CalendarCell';

const GOOGLE_CALENDAR_OPENED_EVENT = 'asm:google-calendar-opened';
const GOOGLE_CALENDAR_RETURN_RETRY_DELAYS_MS = [0, 2000, 5000];
const GOOGLE_CALENDAR_REGISTERED_FEEDBACK_MS = 3200;

async function requestGoogleCalendarMatch(
  schedules: MentoringSchedule[],
): Promise<GoogleCalendarMatchResponse> {
  const valid = schedules.filter(
    (s) => s.somaLectureId && s.dateStr && s.startTime && s.endTime,
  );
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'asm-google-calendar-match',
      lectures: valid,
    });
    if (response && typeof response === 'object' && 'connected' in response) {
      return response as GoogleCalendarMatchResponse;
    }
    console.warn('[ASM Google Calendar] match response had unexpected shape', response);
  } catch (err) {
    console.warn('[ASM Google Calendar] match failed:', err);
  }
  return { connected: false, matched: {} };
}

async function requestFreshGoogleCalendarMatch(
  schedules: MentoringSchedule[],
): Promise<GoogleCalendarMatchResponse> {
  try {
    await chrome.runtime.sendMessage({ type: 'asm-google-calendar-clear-cache' });
  } catch {
    // Best-effort: a normal match still works if cache clearing fails.
  }
  return requestGoogleCalendarMatch(schedules);
}

export interface GoogleCalendarMatchState {
  googleCalendarMatch: GoogleCalendarMatchResponse;
  registeredFeedbackIds: Set<string>;
}

export function useGoogleCalendarMatch(
  mentoringSchedules: MentoringSchedule[],
  loading: boolean,
): GoogleCalendarMatchState {
  const [googleCalendarMatch, setGoogleCalendarMatch] = useState<GoogleCalendarMatchResponse>({
    connected: false,
    matched: {},
  });
  const [registeredFeedbackIds, setRegisteredFeedbackIds] = useState<Set<string>>(new Set());
  const mentoringSchedulesRef = useRef<MentoringSchedule[]>([]);
  const googleCalendarMatchRef = useRef<GoogleCalendarMatchResponse>({
    connected: false,
    matched: {},
  });
  const feedbackTimersRef = useRef<number[]>([]);

  useEffect(() => {
    mentoringSchedulesRef.current = mentoringSchedules;
  }, [mentoringSchedules]);

  const applyGoogleCalendarMatch = useCallback((next: GoogleCalendarMatchResponse) => {
    const previous = googleCalendarMatchRef.current;
    const completedIds = mentoringSchedulesRef.current
      .map((schedule) => schedule.somaLectureId)
      .filter(
        (id) =>
          id && previous.connected && !previous.matched[id] && next.connected && next.matched[id],
      );

    googleCalendarMatchRef.current = next;
    setGoogleCalendarMatch(next);

    if (completedIds.length === 0) return;

    setRegisteredFeedbackIds((prev) => {
      const merged = new Set(prev);
      completedIds.forEach((id) => merged.add(id));
      return merged;
    });

    const timer = window.setTimeout(() => {
      setRegisteredFeedbackIds((prev) => {
        const nextIds = new Set(prev);
        completedIds.forEach((id) => nextIds.delete(id));
        return nextIds;
      });
    }, GOOGLE_CALENDAR_REGISTERED_FEEDBACK_MS);
    feedbackTimersRef.current.push(timer);
  }, []);

  useEffect(() => {
    if (loading) return;
    void requestGoogleCalendarMatch(mentoringSchedules).then(applyGoogleCalendarMatch);
  }, [applyGoogleCalendarMatch, loading, mentoringSchedules]);

  useEffect(() => {
    if (loading) return;

    let pending = false;
    let syncVersion = 0;
    const timers: number[] = [];

    const clearTimers = () => {
      while (timers.length > 0) {
        const timer = timers.pop();
        if (timer !== undefined) window.clearTimeout(timer);
      }
    };

    const runPendingSync = () => {
      if (!pending || document.visibilityState === 'hidden') return;
      pending = false;
      syncVersion += 1;
      const currentSync = syncVersion;
      let latestAppliedAttempt = -1;
      clearTimers();

      GOOGLE_CALENDAR_RETURN_RETRY_DELAYS_MS.forEach((delay, attemptIndex) => {
        const timer = window.setTimeout(() => {
          if (currentSync !== syncVersion) return;
          void requestFreshGoogleCalendarMatch(mentoringSchedulesRef.current).then((next) => {
            if (currentSync !== syncVersion || attemptIndex < latestAppliedAttempt) return;
            latestAppliedAttempt = attemptIndex;
            applyGoogleCalendarMatch(next);
          });
        }, delay);
        timers.push(timer);
      });
    };

    const handleGoogleCalendarOpened = () => {
      pending = true;
    };

    window.addEventListener(GOOGLE_CALENDAR_OPENED_EVENT, handleGoogleCalendarOpened);
    window.addEventListener('focus', runPendingSync);
    document.addEventListener('visibilitychange', runPendingSync);

    return () => {
      syncVersion += 1;
      clearTimers();
      window.removeEventListener(GOOGLE_CALENDAR_OPENED_EVENT, handleGoogleCalendarOpened);
      window.removeEventListener('focus', runPendingSync);
      document.removeEventListener('visibilitychange', runPendingSync);
    };
  }, [applyGoogleCalendarMatch, loading]);

  useEffect(() => {
    return () => {
      feedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return { googleCalendarMatch, registeredFeedbackIds };
}
