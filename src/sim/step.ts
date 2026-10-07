/**
 * One simulation tick of the active zone. Everything the zone does in real time happens here, in a fixed
 * order: clock and needs, player, interaction, combat, zombies, hazards, noise, FOV, triggers.
 */
import { BALANCE } from '@/config/balance';
import type { GameContext } from '@/core/store';
import { passTime } from '@/systems/clock';
import { applyEffects } from '@/systems/effects';
import { checkAll } from '@/systems/conditions';
import { updatePlayerFov } from './fov';
import { updateInteraction, type Interactable } from './interact';
import { decayNoises } from './noise';
import { updatePlayerMovement, type PlayerInput } from './player';
import { getRuntime } from './runtime';
import type { ZoneState } from './types';

export interface StepResult {
  target: Interactable | null;
}

/** Areas the player is currently standing in, so `zone:reached` fires on entry, not every frame. */
const insideAreas = new WeakMap<ZoneState, Set<string>>();

export function stepZone(ctx: GameContext, input: PlayerInput, realDt: number): StepResult {
  const zone = ctx.state.zone;
  if (!zone || ctx.state.player.dead) return { target: null };
  const rt = getRuntime(ctx.content, zone);
  const dt = Math.min(realDt, 0.1);
  zone.time += dt;
  ctx.state.stats.playSeconds += dt;
  const exertion = zone.player.sprinting || ctx.state.time.minutes - ctx.state.player.lastCombatAt < 0.5;
  passTime(ctx, dt * BALANCE.time.gameMinutesPerRealSecond * ctx.state.time.scale, 'active', exertion);
  if (ctx.state.player.dead) return { target: null };

  if (input.flashlightToggle) toggleFlashlight(ctx);
  updatePlayerMovement(ctx, zone, rt, input, dt);
  const target = updateInteraction(ctx, zone, rt, input, dt);
  decayNoises(zone, dt);
  updatePlayerFov(ctx, zone, rt);
  checkTriggers(ctx, zone);
  return { target };
}

function toggleFlashlight(ctx: GameContext): void {
  const pl = ctx.state.player;
  const has = pl.inventory.some((s) => ctx.content.items[s.itemId]?.tool?.flashlight);
  if (!has) {
    pl.flashlightOn = false;
    ctx.bus.emit('ui:toast', { text: 'No flashlight.', kind: 'warn' });
    return;
  }
  pl.flashlightOn = !pl.flashlightOn;
  ctx.bus.emit('sfx:play', { key: 'click' });
}

function checkTriggers(ctx: GameContext, zone: ZoneState): void {
  const p = zone.player;
  let inside = insideAreas.get(zone);
  if (!inside) {
    inside = new Set();
    insideAreas.set(zone, inside);
  }
  const def = ctx.content.zones[zone.zoneId];
  if (!def) return;
  for (const o of def.objects) {
    if (o.type !== 'trigger') continue;
    const isIn = p.x >= o.x && p.x < o.x + o.w && p.y >= o.y && p.y < o.y + o.h;
    if (!isIn) {
      inside.delete(o.id);
      continue;
    }
    if (inside.has(o.id)) continue;
    inside.add(o.id);
    ctx.bus.emit('zone:reached', { zoneId: zone.zoneId, areaId: o.id });
    const st = (zone.objects[o.id] ??= {});
    if (o.once && st.done) continue;
    if (!checkAll(ctx, o.if)) continue;
    if (o.once) st.done = true;
    if (o.text) ctx.bus.emit('ui:toast', { text: o.text, kind: 'info' });
    applyEffects(ctx, o.effects, `trigger:${o.id}`);
  }
}
