/**
 * The class ability on Q (BRIEF_V2 §4): one active per class with a cooldown that recharges in game time.
 *  - decoy (Mechanic): throw a noise-maker that beeps for ten seconds, without spending one;
 *  - adrenaline (Paramedic): heal, refill stamina, and a few seconds of free stamina;
 *  - flashbang (Ex-cop): throw a stun grenade, without spending one;
 *  - scout (Scavenger): for a few seconds, see unsearched containers and zombies nearby through walls.
 */
import type { GameContext } from '@/core/store';
import { classOf } from '@/systems/classes';
import { healPlayer, maxStamina } from '@/systems/survival';
import { weaponStats } from '@/systems/items';
import { launch } from './combat';
import type { PlayerInput } from './player';
import type { ZoneRuntime } from './runtime';
import type { ZoneState } from './types';

/** Scout range when the class data doesn't set one (tiles). */
const SCOUT_RADIUS = 20;

export function abilityReady(ctx: GameContext): boolean {
  return ctx.state.player.abilityCooldown <= 0;
}

/** Tick the ability timers and use the ability if Q was pressed. */
export function updateAbility(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  input: PlayerInput,
  dt: number,
): void {
  const p = zone.player;
  p.adrenaline = Math.max(0, p.adrenaline - dt);
  p.scout = Math.max(0, p.scout - dt);
  if (input.abilityPressed) useAbility(ctx, zone, rt, input.aimX, input.aimY);
}

/** Use the class ability now. Returns false (with a toast) if it can't be used. */
export function useAbility(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  aimX: number,
  aimY: number,
): boolean {
  const pl = ctx.state.player;
  const p = zone.player;
  const cls = classOf(ctx);
  const ab = cls.ability;
  if (pl.dead) return false;
  if (zone.safe) {
    ctx.bus.emit('ui:toast', { text: `${ab.name}: not inside the camp.`, kind: 'info' });
    return false;
  }
  if (pl.abilityCooldown > 0) {
    ctx.bus.emit('ui:toast', {
      text: `${ab.name} ready in ${Math.ceil(pl.abilityCooldown)} s.`,
      kind: 'info',
    });
    ctx.bus.emit('sfx:play', { key: 'click' });
    return false;
  }
  if (p.action?.kind === 'timed') return false;
  switch (ab.kind) {
    case 'decoy':
    case 'flashbang': {
      const st = weaponStats(ctx.content, { uid: '', itemId: ab.itemId ?? '', qty: 1 });
      if (st?.kind !== 'throwable') return false;
      launch(ctx, zone, rt, ab.itemId!, st.throwRange, aimX, aimY);
      break;
    }
    case 'adrenaline':
      healPlayer(ctx, ab.heal ?? 30);
      pl.stamina = maxStamina(ctx);
      p.adrenaline = ab.durationSec ?? 8;
      ctx.bus.emit('sfx:play', { key: 'adrenaline', x: p.x, y: p.y });
      ctx.bus.emit('ui:toast', { text: 'Adrenaline: heart pounding, legs light.', kind: 'good' });
      break;
    case 'scout': {
      const r = ab.radius ?? SCOUT_RADIUS;
      p.scout = ab.durationSec ?? 8;
      // What you spotted stays on the zone map.
      for (const c of Object.values(zone.containers)) {
        if (Math.hypot(c.x + c.w / 2 - p.x, c.y + c.h / 2 - p.y) > r) continue;
        for (let y = c.y; y < c.y + c.h; y++)
          for (let x = c.x; x < c.x + c.w; x++) zone.explored[y * zone.w + x] = 1;
      }
      ctx.bus.emit('sfx:play', { key: 'scout', x: p.x, y: p.y });
      break;
    }
  }
  pl.abilityCooldown = ab.cooldownSec;
  ctx.bus.emit('ability:used', { classId: cls.id, kind: ab.kind });
  return true;
}
