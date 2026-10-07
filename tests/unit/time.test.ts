import { describe, expect, it } from 'vitest';
import { darkness, dayOf, formatClock, hourOf, isNight, startTime } from '@/core/time';

describe('time helpers', () => {
  it('starts on day 23 at 08:00', () => {
    const t = startTime();
    expect(dayOf(t.minutes)).toBe(23);
    expect(hourOf(t.minutes)).toBe(8);
    expect(formatClock(t.minutes)).toBe('08:00');
  });

  it('night runs from 21:00 to 05:00', () => {
    const at = (h: number) => 23 * 1440 + h * 60;
    expect(isNight(at(20.9))).toBe(false);
    expect(isNight(at(21))).toBe(true);
    expect(isNight(at(2))).toBe(true);
    expect(isNight(at(5))).toBe(false);
    expect(isNight(at(12))).toBe(false);
  });

  it('darkness ramps through dusk and dawn', () => {
    const at = (h: number) => 23 * 1440 + h * 60;
    expect(darkness(at(12))).toBe(0);
    expect(darkness(at(23))).toBe(1);
    expect(darkness(at(20.5))).toBeCloseTo(0.5);
    expect(darkness(at(5.5))).toBeCloseTo(0.5);
  });
});
