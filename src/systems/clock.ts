/** Advances the game clock and everything that ticks with it (needs, effects, hour/night events). */
import type { GameContext } from '@/core/store';
import { dayOf, hourOf, isNight } from '@/core/time';
import { survivalTick, type TimeMode } from './survival';
import { showHint } from './story';

/**
 * Pass `minutes` of game time. Real-time play calls this every frame with a small value; sleeping,
 * travel and crafting call it with larger skips, which are processed in one-minute steps.
 */
export function passTime(
  ctx: GameContext,
  minutes: number,
  mode: TimeMode = 'active',
  exertion = false,
): void {
  if (!(minutes > 0)) return;
  const t = ctx.state.time;
  let left = minutes;
  while (left > 1e-9) {
    const step = Math.min(left, 1);
    const before = t.minutes;
    survivalTick(ctx, step, mode, exertion);
    t.minutes += step;
    t.seconds += step * 60;
    left -= step;
    if (Math.floor(before / 60) !== Math.floor(t.minutes / 60)) {
      ctx.bus.emit('time:hour', { hour: hourOf(t.minutes), day: dayOf(t.minutes) });
    }
    if (isNight(before) !== isNight(t.minutes)) {
      const night = isNight(t.minutes);
      ctx.bus.emit('time:night', { night });
      if (night) showHint(ctx, 'night');
    }
    if (ctx.state.player.dead) break;
  }
}
