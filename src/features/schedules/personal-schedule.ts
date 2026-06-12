import { readChromeStorage, writeChromeStorage } from '@shared/storage/storage';

export interface PersonalSchedule {
  id: string;
  title: string;
  dateStr: string;
  startTime: string;
  endTime: string;
  description?: string;
  locationType?: 'online' | 'offline';
  location?: string;
  isFixedShared?: boolean;
}

export const FIXED_SHARED_SCHEDULES: PersonalSchedule[] = [
  {
    id: 'shared_orientation_2026_06_30',
    title: '발대식',
    dateStr: '2026-06-30',
    startTime: '00:00',
    endTime: '23:59',
    description: '모든 연수생 공통 일정',
    isFixedShared: true,
  },
];

export async function loadPersonalSchedules(): Promise<PersonalSchedule[]> {
  const res = await readChromeStorage(['soma_personal_schedules']);
  const list = res.soma_personal_schedules;
  return Array.isArray(list) ? (list as PersonalSchedule[]) : [];
}

export async function savePersonalSchedules(schedules: PersonalSchedule[]): Promise<void> {
  await writeChromeStorage({ soma_personal_schedules: schedules });
}

// Insert a new schedule or merge into the existing one with the same id, then persist.
export async function upsertPersonalSchedule(schedule: PersonalSchedule): Promise<void> {
  const list = await loadPersonalSchedules();
  const idx = list.findIndex((item) => item.id === schedule.id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...schedule };
  } else {
    list.push(schedule);
  }
  await savePersonalSchedules(list);
}

export async function deletePersonalSchedule(id: string): Promise<void> {
  const list = await loadPersonalSchedules();
  await savePersonalSchedules(list.filter((item) => item.id !== id));
}
