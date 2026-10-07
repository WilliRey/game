import { BALANCE } from '@/config/balance';
import type { TimeState } from './types';

export function startTime(): TimeState {
  return {
    minutes: BALANCE.time.startDay * 1440 + BALANCE.time.startHour * 60,
    seconds: 0,
    scale: 1,
  };
}

export function dayOf(minutes: number): number {
  return Math.floor(minutes / 1440);
}
export function hourOf(minutes: number): number {
  return Math.floor((minutes % 1440) / 60);
}
export function minuteOf(minutes: number): number {
  return Math.floor(minutes % 60);
}
export function isNight(minutes: number): boolean {
  const h = (minutes % 1440) / 60;
  return h >= BALANCE.time.nightStartHour || h < BALANCE.time.nightEndHour;
}
/** 0 = full day, 1 = full night, with a 1-hour dusk/dawn ramp. */
export function darkness(minutes: number): number {
  const h = (minutes % 1440) / 60;
  const { nightStartHour: ns, nightEndHour: ne } = BALANCE.time;
  if (h >= ns || h < ne) return 1;
  if (h >= ns - 1) return h - (ns - 1);
  if (h < ne + 1) return 1 - (h - ne);
  return 0;
}
export function formatClock(minutes: number): string {
  const h = hourOf(minutes);
  const m = minuteOf(minutes);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
