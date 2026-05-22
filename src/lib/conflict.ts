import type { PersonalSchedule } from './personal-schedule';
import type { MentoringSchedule } from './mentoring-schedule';

interface TimedEvent {
  date: string;
  timeStart: string;
  timeEnd: string;
  sn?: string | null;
}

interface DateRange {
  start: Date;
  end: Date;
}

function toDateRange(dateStr: string, startTime: string, endTime: string): DateRange | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([y, m, d, sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;

  return {
    start: new Date(y, m - 1, d, sh, sm, 0),
    end: new Date(y, m - 1, d, eh, em, 0),
  };
}

export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.start < b.end && b.start < a.end;
}

export function hasMentoringScheduleConflict(
  ev: TimedEvent,
  mentoringSchedules: MentoringSchedule[]
): boolean {
  const evRange = ev?.date && ev?.timeStart && ev?.timeEnd
    ? toDateRange(ev.date, ev.timeStart, ev.timeEnd)
    : null;
  if (!evRange || !Array.isArray(mentoringSchedules)) return false;

  return mentoringSchedules.some((ms) => {
    if (!ms?.dateStr || !ms?.startTime || !ms?.endTime) return false;
    if (ev.sn && ms.qustnrSn && ev.sn === ms.qustnrSn) return false;

    const msRange = toDateRange(ms.dateStr, ms.startTime, ms.endTime);
    return msRange ? overlaps(evRange, msRange) : false;
  });
}

export function hasPersonalScheduleConflict(
  ev: TimedEvent,
  personalSchedules: PersonalSchedule[]
): boolean {
  const evRange = ev?.date && ev?.timeStart && ev?.timeEnd
    ? toDateRange(ev.date, ev.timeStart, ev.timeEnd)
    : null;
  if (!evRange || !Array.isArray(personalSchedules)) return false;

  return personalSchedules.some((ps) => {
    if (!ps?.dateStr || !ps?.startTime || !ps?.endTime) return false;
    const psRange = toDateRange(ps.dateStr, ps.startTime, ps.endTime);
    return psRange ? overlaps(evRange, psRange) : false;
  });
}

export function findConflictingPersonalSchedule(
  range: DateRange,
  personalSchedules: PersonalSchedule[]
): PersonalSchedule | null {
  for (const ps of personalSchedules) {
    if (!ps?.dateStr || !ps?.startTime || !ps?.endTime) continue;
    const psRange = toDateRange(ps.dateStr, ps.startTime, ps.endTime);
    if (psRange && overlaps(range, psRange)) return ps;
  }
  return null;
}

export function findConflictingMentoringSchedule(
  range: DateRange,
  mentoringSchedules: MentoringSchedule[],
  excludeQustnrSn?: string
): MentoringSchedule | null {
  for (const ms of mentoringSchedules) {
    if (!ms?.dateStr || !ms?.startTime || !ms?.endTime) continue;
    if (excludeQustnrSn && ms.qustnrSn === excludeQustnrSn) continue;
    const msRange = toDateRange(ms.dateStr, ms.startTime, ms.endTime);
    if (msRange && overlaps(range, msRange)) return ms;
  }
  return null;
}
