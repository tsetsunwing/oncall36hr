import type { Mode } from '@/engine';

export interface ShiftClockConfig {
  shifts: {
    day: { startHour: number };
    night: { startHour: number };
    onCall: { startHour: number };
  };
}

export function shiftStartHour(mode: Mode, config: ShiftClockConfig): number {
  switch (mode) {
    case 'DAY':
      return config.shifts.day.startHour;
    case 'NIGHT':
      return config.shifts.night.startHour;
    case 'ONCALL':
      return config.shifts.onCall.startHour;
  }
}

/** 遊戲秒 → 牆鐘 "HH:MM"（跨日循環）。時間標籤永遠由 engine 時間推算，唔使用系統時間。 */
export function formatClock(tSec: number, mode: Mode, config: ShiftClockConfig): string {
  const total = shiftStartHour(mode, config) * 3600 + Math.max(0, Math.floor(tSec));
  const minutes = Math.floor(total / 60) % (24 * 60);
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
