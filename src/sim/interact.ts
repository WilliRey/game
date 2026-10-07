/**
 * The E key. Finds the best thing in reach, shows a prompt, and runs tap actions (doors, pickups, talking,
 * stations, exits) or hold actions (searching, picking or forcing locks, cutting chains, siphoning).
 * Moving, releasing E, or taking damage interrupts a hold action.
 */
import { BALANCE } from '@/config/balance';
import type { ZoneObjectT } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { checkAll } from '@/systems/conditions';
import { applyEffects } from '@/systems/effects';
import { addItem, addStack, countItem, hasKey, hasTool, removeItem } from '@/systems/inventory';
import { rollContainer } from '@/systems/loot';
import { SKILL, rank } from '@/systems/progression';
import { playBroadcast, readNote, showHint } from '@/systems/story';
import { emitNoise } from './noise';
import { rebuildGrids, type ZoneRuntime } from './runtime';
import type { ContainerState, DoorState, TimedAction, ZoneState } from './types';
import type { PlayerInput } from './player';

export type InteractKind = 'door' | 'container' | 'station' | 'npc' | 'item' | 'exit' | 'object';

export interface Interactable {
  kind: InteractKind;
  id: string;
  /** World position for the prompt. */
  x: number;
  y: number;
  label: string;
  verb: string;
  /** Hold E (timed) rather than tap. */
  hold: boolean;
  /** Shift+E alternative, e.g. forcing a lock. */
  alt?: string;
  /** Why it can't be used right now. */
  disabled?: string;
}

interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

function distToRect(px: number, py: number, r: RectLike): number {
  const cx = Math.max(r.x, Math.min(px, r.x + r.w));
  const cy = Math.max(r.y, Math.min(py, r.y + r.h));
  return Math.hypot(px - cx, py - cy);
}

function angleTo(px: number, py: number, facing: number, x: number, y: number): number {
  let d = Math.atan2(y - py, x - px) - facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

const STATION_LABEL: Record<string, string> = {
  workbench: 'Workbench',
  stove: 'Stove',
  reloading: 'Reloading Bench',
  stash: 'Stash',
  bed: 'Bunk',
  rainCollector: 'Rain Collector',
  campfire: 'Fire Barrel',
  radio: 'Radio',
};

function lockDescription(
  ctx: GameContext,
  keyId: string | undefined,
  keyOnly = false,
): { verb: string; hold: boolean; alt?: string; disabled?: string } {
  if (hasKey(ctx, keyId)) return { verb: 'Unlock (key)', hold: false };
  if (keyOnly) {
    const key = ctx.content.lists.items.find((i) => i.tool?.keyFor?.includes(keyId ?? ''));
    return { verb: 'Locked', hold: false, disabled: `Needs the ${key?.name ?? 'key'}` };
  }
  const pick = hasTool(ctx, 'lockpick');
  const bar = hasTool(ctx, 'crowbar');
  const picks = countItem(ctx, 'lockpick');
  if (pick)
    return {
      verb: `Pick lock (${picks} pick${picks === 1 ? '' : 's'})`,
      hold: true,
      alt: bar ? 'Force (loud)' : undefined,
    };
  if (bar) return { verb: 'Force lock (loud)', hold: true };
  return {
    verb: 'Locked',
    hold: false,
    disabled: keyId ? 'Needs a key, a lockpick or a crowbar' : 'Needs a lockpick or a crowbar',
  };
}

/** All interactables in reach, best first. */
export function interactablesNear(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime): Interactable[] {
  const p = zone.player;
  const reach = BALANCE.interact.reach;
  const out: { it: Interactable; score: number }[] = [];
  const consider = (it: Interactable, rect: RectLike) => {
    const d = distToRect(p.x, p.y, rect);
    if (d > reach) return;
    const ang = angleTo(p.x, p.y, p.facing, rect.x + rect.w / 2, rect.y + rect.h / 2);
    out.push({ it, score: d + ang * 0.45 });
  };

  for (const d of Object.values(zone.doors)) {
    if (d.broken) continue;
    const r = { x: d.x, y: d.y, w: 1, h: 1 };
    if (d.locked) {
      const l = lockDescription(ctx, d.keyId, d.keyOnly);
      consider({ kind: 'door', id: d.id, x: d.x + 0.5, y: d.y + 0.5, label: 'Locked door', ...l }, r);
    } else
      consider(
        {
          kind: 'door',
          id: d.id,
          x: d.x + 0.5,
          y: d.y + 0.5,
          label: 'Door',
          verb: d.open ? 'Close' : 'Open',
          hold: false,
        },
        r,
      );
  }
  for (const c of Object.values(zone.containers)) {
    const name = c.label ?? ctx.content.containerTypes[c.type]?.name ?? 'Container';
    const base = { kind: 'container' as const, id: c.id, x: c.x + c.w / 2, y: c.y + c.h / 2, label: name };
    if (c.locked) consider({ ...base, ...lockDescription(ctx, c.keyId, c.keyOnly) }, c);
    else if (c.searched) consider({ ...base, verb: c.items.length ? 'Loot' : 'Empty', hold: false }, c);
    else consider({ ...base, verb: 'Search', hold: true }, c);
  }
  for (const s of rt.layout.stations) {
    if (s.kind === 'rainCollector' && zone.safe && !ctx.state.base.rainCollector.built) continue;
    if (s.kind === 'reloading' && zone.safe && !ctx.state.base.reloadingBench) continue;
    const verb =
      s.kind === 'radio'
        ? 'Listen'
        : s.kind === 'bed'
          ? 'Sleep / wait'
          : s.kind === 'rainCollector'
            ? 'Collect water'
            : 'Use';
    consider(
      {
        kind: 'station',
        id: s.id,
        x: s.x + s.w / 2,
        y: s.y + s.h / 2,
        label: STATION_LABEL[s.kind] ?? s.kind,
        verb,
        hold: false,
      },
      s,
    );
  }
  for (const n of zone.npcs) {
    const name = ctx.content.npcs[n.npcId]?.name ?? n.npcId;
    consider(
      { kind: 'npc', id: n.id, x: n.x, y: n.y - 0.2, label: name, verb: 'Talk', hold: false },
      { x: n.x - 0.4, y: n.y - 0.4, w: 0.8, h: 0.8 },
    );
  }
  for (const it of zone.items) {
    const def = ctx.content.items[it.stack.itemId];
    const label = `${def?.name ?? it.stack.itemId}${it.stack.qty > 1 ? ` ×${it.stack.qty}` : ''}`;
    consider(
      { kind: 'item', id: it.uid, x: it.x, y: it.y, label, verb: 'Take', hold: false },
      { x: it.x - 0.3, y: it.y - 0.3, w: 0.6, h: 0.6 },
    );
  }
  for (const e of rt.layout.exits) {
    const label = e.label ?? (e.toZone ? (ctx.content.zones[e.toZone]?.name ?? 'Exit') : 'Leave area');
    consider(
      {
        kind: 'exit',
        id: e.id,
        x: e.x + e.w / 2,
        y: e.y + e.h / 2,
        label,
        verb: e.toZone ? 'Go' : 'World map',
        hold: false,
      },
      e,
    );
  }
  for (const o of rt.layout.objects) {
    const it = objectInteractable(ctx, zone, o);
    if (it) consider(it, o);
  }
  out.sort((a, b) => a.score - b.score);
  return out.map((o) => o.it);
}

function objectInteractable(ctx: GameContext, zone: ZoneState, o: ZoneObjectT): Interactable | null {
  const st = zone.objects[o.id];
  const base = { kind: 'object' as const, id: o.id, x: o.x + o.w / 2, y: o.y + o.h / 2 };
  if (o.type === 'blocker') {
    if (st?.removed) return null;
    const ok = !o.requires || hasTool(ctx, o.requires as 'cutter');
    return {
      ...base,
      label: o.label ?? 'Blocked',
      verb: o.text ?? 'Cut through',
      hold: true,
      disabled: ok ? undefined : (o.failText ?? `Needs a tool (${o.requires})`),
    };
  }
  if (o.type === 'siphon') {
    const liters = st?.liters ?? o.siphonLiters ?? 0;
    if (liters <= 0)
      return {
        ...base,
        label: o.label ?? 'Fuel tank',
        verb: 'Empty',
        hold: false,
        disabled: 'Already siphoned dry',
      };
    const ok = hasTool(ctx, 'hose');
    return {
      ...base,
      label: `${o.label ?? 'Fuel tank'} (${liters} L)`,
      verb: 'Siphon fuel',
      hold: true,
      disabled: ok ? undefined : (o.failText ?? 'Needs a siphon hose'),
    };
  }
  if (o.type === 'interact') {
    if (o.once && st?.done) return null;
    if (o.hold === undefined && !o.dialogue && o.effects.length === 0 && !o.text) return null;
    return { ...base, label: o.label ?? 'Object', verb: o.text ?? 'Use', hold: (o.hold ?? 0) > 0 };
  }
  if (o.type === 'vehicle') {
    const v = ctx.state.vehicle;
    if (!v.owned) return { ...base, label: o.label ?? 'Vehicle', verb: o.text ?? 'Repair', hold: false };
    const cans = countItem(ctx, 'fuel_can');
    return {
      ...base,
      label: `${o.label ?? 'Vehicle'} (${Math.round(v.fuel)}/${v.maxFuel} L)`,
      verb: cans > 0 && v.fuel < v.maxFuel ? 'Refuel' : 'Check',
      hold: false,
    };
  }
  return null;
}

export function findInteractable(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime): Interactable | null {
  return interactablesNear(ctx, zone, rt)[0] ?? null;
}

// ---------------------------------------------------------------- doing it

function holdDuration(
  ctx: GameContext,
  zone: ZoneState,
  it: Interactable,
  force: boolean,
): { verb: TimedAction['verb']; duration: number } | null {
  const I = BALANCE.interact;
  if (it.kind === 'door' || it.kind === 'container') {
    const target = it.kind === 'door' ? zone.doors[it.id] : zone.containers[it.id];
    const locked = target?.locked;
    if (locked && target?.keyOnly) return null;
    if (locked) {
      const bar = hasTool(ctx, 'crowbar');
      const pick = hasTool(ctx, 'lockpick');
      if ((force && bar) || (!pick && bar)) return { verb: 'force', duration: I.forceSeconds };
      if (pick) return { verb: 'lockpick', duration: I.lockpickSeconds * (1 - 0.06 * rank(ctx, 'stealth')) };
      return null;
    }
    if (it.kind === 'container') {
      const c = zone.containers[it.id]!;
      const size = ctx.content.containerTypes[c.type]?.size ?? 'medium';
      return { verb: 'search', duration: BALANCE.search[size] * SKILL.searchTime(rank(ctx, 'scavenging')) };
    }
  }
  if (it.kind === 'object') {
    const o = objectDef(ctx, zone, it.id);
    if (!o) return null;
    if (o.type === 'blocker') return { verb: 'cut', duration: o.hold ?? I.cutSeconds };
    if (o.type === 'siphon') return { verb: 'siphon', duration: o.hold ?? I.siphonSeconds };
    if (o.type === 'interact') return { verb: 'use', duration: o.hold ?? 1 };
  }
  return null;
}

function objectDef(ctx: GameContext, zone: ZoneState, id: string): ZoneObjectT | undefined {
  return ctx.content.zones[zone.zoneId]?.objects.find((o) => o.id === id);
}

/** Per-frame interaction update. Returns the current target (for the prompt). */
export function updateInteraction(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  input: PlayerInput,
  dt: number,
): Interactable | null {
  const p = zone.player;
  const target = findInteractable(ctx, zone, rt);
  const a = p.action;
  if (a?.kind === 'timed') {
    const moved = Math.hypot(input.moveX, input.moveY) > 0.1;
    if ((a.hold && !input.interactHeld) || moved || (a.hold && target?.id !== a.targetId)) {
      p.action = null;
    } else {
      a.t += dt;
      a.noiseIn -= dt;
      if (a.noiseIn <= 0 && a.verb === 'search') {
        a.noiseIn = 1;
        emitNoise(ctx, zone, p.x, p.y, BALANCE.noise.search, 'search', true);
        ctx.bus.emit('sfx:play', { key: 'rustle', x: p.x, y: p.y, volume: 0.5 });
      }
      if (a.noiseIn <= 0 && a.verb === 'lockpick') {
        a.noiseIn = 1.2;
        ctx.bus.emit('sfx:play', { key: 'lockpick', x: p.x, y: p.y, volume: 0.4 });
      }
      if (a.t >= a.duration) {
        p.action = null;
        completeTimed(ctx, zone, rt, a);
      }
    }
    return target;
  }
  if (!input.interactPressed || !target) return target;
  if (target.disabled) {
    ctx.bus.emit('ui:toast', { text: target.disabled, kind: 'warn' });
    if (target.kind === 'door' || target.kind === 'container') showHint(ctx, 'locked');
    return target;
  }
  if (p.action) return target;
  // Keys open instantly; everything else held is a timed action.
  if (
    (target.kind === 'door' || target.kind === 'container') &&
    isLocked(zone, target) &&
    hasKey(ctx, keyOf(zone, target))
  ) {
    unlock(ctx, zone, rt, target, 'key');
    return target;
  }
  const hold = holdDuration(ctx, zone, target, input.force);
  if (target.hold && hold) {
    p.action = {
      kind: 'timed',
      verb: hold.verb,
      targetId: target.id,
      t: 0,
      duration: hold.duration,
      hold: true,
      noiseIn: 0.5,
    };
    if (hold.verb === 'search') showHint(ctx, 'search');
    return target;
  }
  tap(ctx, zone, rt, target);
  return target;
}

function isLocked(zone: ZoneState, it: Interactable): boolean {
  return it.kind === 'door' ? !!zone.doors[it.id]?.locked : !!zone.containers[it.id]?.locked;
}
function keyOf(zone: ZoneState, it: Interactable): string | undefined {
  return it.kind === 'door' ? zone.doors[it.id]?.keyId : zone.containers[it.id]?.keyId;
}

function unlock(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  it: Interactable,
  method: 'lockpick' | 'crowbar' | 'key',
): void {
  const p = zone.player;
  if (it.kind === 'door') {
    const d = zone.doors[it.id]!;
    d.locked = false;
    if (method === 'crowbar') {
      d.broken = true;
      d.open = true;
    } else d.open = true;
    rebuildGrids(rt, ctx.content);
    ctx.bus.emit('door:changed', { doorId: d.id, open: d.open, broken: d.broken });
  } else {
    const c = zone.containers[it.id]!;
    c.locked = false;
  }
  if (method === 'lockpick') removeItem(ctx, 'lockpick', 1, 'lockpick');
  if (method === 'crowbar') {
    emitNoise(ctx, zone, p.x, p.y, BALANCE.noise.crowbarLock, 'crowbar', true);
    ctx.bus.emit('sfx:play', { key: 'force', x: p.x, y: p.y });
  } else ctx.bus.emit('sfx:play', { key: 'unlock', x: p.x, y: p.y });
  ctx.bus.emit('lock:opened', { targetId: it.id, method });
  ctx.bus.emit('interact', { targetId: it.id, kind: it.kind, zoneId: zone.zoneId });
}

function completeTimed(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, a: TimedAction): void {
  const it = interactablesNear(ctx, zone, rt).find((i) => i.id === a.targetId);
  if (!it) return;
  switch (a.verb) {
    case 'lockpick':
      unlock(ctx, zone, rt, it, 'lockpick');
      return;
    case 'force':
      unlock(ctx, zone, rt, it, 'crowbar');
      return;
    case 'search':
      finishSearch(ctx, zone, zone.containers[a.targetId]!);
      return;
    case 'cut':
    case 'siphon':
    case 'use': {
      const o = objectDef(ctx, zone, a.targetId);
      if (o) completeObject(ctx, zone, rt, o);
      return;
    }
    default:
      return;
  }
}

export function finishSearch(ctx: GameContext, zone: ZoneState, c: ContainerState): void {
  if (!c.rolled) {
    c.items = rollContainer(ctx, zone.zoneId, c.id, c.type, c.lootTable, zone.danger);
    c.rolled = true;
  }
  if (!c.searched) {
    c.searched = true;
    ctx.state.stats.containersSearched += 1;
    if (c.alarm && ctx.rng.chance(BALANCE.interact.alarmChance)) {
      emitNoise(ctx, zone, c.x + c.w / 2, c.y + c.h / 2, BALANCE.noise.carAlarm, 'alarm', true);
      ctx.bus.emit('sfx:play', { key: 'alarm', x: c.x + c.w / 2, y: c.y + c.h / 2, volume: 1 });
      ctx.bus.emit('ui:toast', { text: 'A car alarm screams across the street!', kind: 'warn' });
      ctx.bus.emit('fx:shake', { intensity: 0.004, durationMs: 300 });
    }
  }
  ctx.bus.emit('container:searched', { containerId: c.id, zoneId: zone.zoneId, containerType: c.type });
  ctx.bus.emit('ui:open', { screen: 'loot', props: { containerId: c.id } });
}

function tap(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, it: Interactable): void {
  const p = zone.player;
  switch (it.kind) {
    case 'door':
      toggleDoor(ctx, zone, rt, zone.doors[it.id]!);
      return;
    case 'container': {
      const c = zone.containers[it.id]!;
      ctx.bus.emit('ui:open', { screen: 'loot', props: { containerId: c.id } });
      return;
    }
    case 'item': {
      const idx = zone.items.findIndex((w) => w.uid === it.id);
      if (idx < 0) return;
      const w = zone.items[idx]!;
      zone.items.splice(idx, 1);
      const def = ctx.content.items[w.stack.itemId];
      addStack(ctx, w.stack, 'pickup');
      ctx.bus.emit('sfx:play', { key: 'pickup', x: w.x, y: w.y });
      ctx.bus.emit('ui:toast', {
        text: `Picked up ${def?.name ?? w.stack.itemId}${w.stack.qty > 1 ? ` ×${w.stack.qty}` : ''}`,
        kind: 'info',
      });
      if (def?.note) readNote(ctx, def.note.noteId);
      if (def?.weapon?.kind === 'throwable') showHint(ctx, 'bottle');
      if (w.pickupId) {
        ctx.bus.emit('interact', { targetId: w.pickupId, kind: 'pickup', zoneId: zone.zoneId });
        const o = objectDef(ctx, zone, w.pickupId);
        if (o) applyEffects(ctx, o.effects, `pickup:${o.id}`);
      }
      return;
    }
    case 'npc': {
      const n = zone.npcs.find((x) => x.id === it.id);
      if (n) {
        n.facing = Math.atan2(p.y - n.y, p.x - n.x);
        ctx.bus.emit('ui:open', { screen: 'dialogue', props: { npcId: n.npcId } });
      }
      return;
    }
    case 'station':
      useStation(ctx, zone, rt, it.id);
      return;
    case 'exit': {
      const e = rt.layout.exits.find((x) => x.id === it.id);
      if (!e) return;
      ctx.bus.emit('interact', { targetId: e.id, kind: 'exit', zoneId: zone.zoneId });
      if (e.toZone) ctx.bus.emit('travel:zone', { zoneId: e.toZone, entry: e.entry });
      else
        ctx.bus.emit('ui:open', {
          screen: 'worldMap',
          props: { fromNode: e.nodeId ?? ctx.state.world.currentNode },
        });
      return;
    }
    case 'object': {
      const o = objectDef(ctx, zone, it.id);
      if (o) completeObject(ctx, zone, rt, o);
      return;
    }
  }
}

export function toggleDoor(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, d: DoorState): boolean {
  if (d.broken || d.locked) return false;
  if (d.open) {
    // Can't close a door on someone standing in it.
    const blocked = [zone.player, ...zone.zombies.filter((z) => z.hp > 0)].some(
      (e) => Math.abs(e.x - (d.x + 0.5)) < 0.5 + 0.3 && Math.abs(e.y - (d.y + 0.5)) < 0.5 + 0.3,
    );
    if (blocked) return false;
  }
  d.open = !d.open;
  rebuildGrids(rt, ctx.content);
  emitNoise(ctx, zone, d.x + 0.5, d.y + 0.5, BALANCE.noise.doorOpen, 'door', true);
  ctx.bus.emit('sfx:play', { key: d.open ? 'door_open' : 'door_close', x: d.x + 0.5, y: d.y + 0.5 });
  ctx.bus.emit('door:changed', { doorId: d.id, open: d.open, broken: d.broken });
  ctx.bus.emit('interact', { targetId: d.id, kind: 'door', zoneId: zone.zoneId });
  return true;
}

function useStation(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, id: string): void {
  const s = rt.layout.stations.find((x) => x.id === id);
  if (!s) return;
  ctx.bus.emit('interact', { targetId: id, kind: 'station', zoneId: zone.zoneId });
  const tier = s.tier ?? (zone.safe ? undefined : 1);
  switch (s.kind) {
    case 'workbench':
      ctx.bus.emit('ui:open', { screen: 'workbench', props: { station: 'workbench', tier } });
      return;
    case 'stove':
    case 'campfire':
      ctx.bus.emit('ui:open', { screen: 'crafting', props: { station: 'stove', tier } });
      return;
    case 'reloading':
      ctx.bus.emit('ui:open', { screen: 'crafting', props: { station: 'reloading', tier } });
      return;
    case 'stash':
      ctx.bus.emit('ui:open', { screen: 'stash' });
      return;
    case 'bed':
      ctx.bus.emit('ui:open', { screen: 'sleep' });
      showHint(ctx, 'sleep');
      return;
    case 'radio':
      playBroadcast(ctx);
      return;
    case 'rainCollector':
      ctx.bus.emit('base:collectWater', {});
      return;
  }
}

function completeObject(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, o: ZoneObjectT): void {
  const p = zone.player;
  const st = (zone.objects[o.id] ??= {});
  if (o.type === 'blocker') {
    if (o.requires && !hasTool(ctx, o.requires as 'cutter')) return;
    st.removed = true;
    rebuildGrids(rt, ctx.content);
    if (o.noise) emitNoise(ctx, zone, o.x + o.w / 2, o.y + o.h / 2, o.noise, 'cut', true);
    ctx.bus.emit('sfx:play', { key: 'force', x: p.x, y: p.y });
    ctx.bus.emit('interact', { targetId: o.id, kind: 'blocker', zoneId: zone.zoneId });
    applyEffects(ctx, o.effects, `object:${o.id}`);
    return;
  }
  if (o.type === 'siphon') {
    const liters = st.liters ?? o.siphonLiters ?? 0;
    const take = Math.min(BALANCE.interact.siphonLitersPerCan, liters);
    if (take <= 0) return;
    st.liters = liters - take;
    addItem(ctx, 'fuel_can', 1, 'siphon');
    ctx.bus.emit('ui:toast', { text: `Siphoned ${take} L into a fuel can`, kind: 'good' });
    ctx.bus.emit('sfx:play', { key: 'siphon', x: p.x, y: p.y });
    ctx.bus.emit('interact', { targetId: o.id, kind: 'siphon', zoneId: zone.zoneId });
    applyEffects(ctx, o.effects, `object:${o.id}`);
    return;
  }
  if (o.type === 'vehicle') {
    useVehicle(ctx, zone, o);
    return;
  }
  if (o.type === 'interact') {
    if (!checkAll(ctx, o.if) || (o.requires && !hasTool(ctx, o.requires as 'cutter'))) {
      ctx.bus.emit('ui:toast', { text: o.failText ?? 'Nothing happens.', kind: 'warn' });
      return;
    }
    if (o.once) st.done = true;
    ctx.bus.emit('interact', { targetId: o.id, kind: 'object', zoneId: zone.zoneId });
    if (o.noise) emitNoise(ctx, zone, o.x + o.w / 2, o.y + o.h / 2, o.noise, 'object', true);
    if (o.dialogue) ctx.bus.emit('ui:open', { screen: 'dialogue', props: { dialogueId: o.dialogue } });
    applyEffects(ctx, o.effects, `object:${o.id}`);
  }
}

/** The camp's vehicle: repaired through the main quest, then refuelled with fuel cans. */
function useVehicle(ctx: GameContext, zone: ZoneState, o: ZoneObjectT): void {
  const v = ctx.state.vehicle;
  if (!v.owned) {
    if (!checkAll(ctx, o.if)) {
      ctx.bus.emit('ui:toast', { text: o.failText ?? "It won't start.", kind: 'warn' });
      return;
    }
    ctx.bus.emit('interact', { targetId: o.id, kind: 'vehicle', zoneId: zone.zoneId });
    applyEffects(ctx, o.effects, `object:${o.id}`);
    return;
  }
  let cans = countItem(ctx, 'fuel_can');
  const per = ctx.content.items.fuel_can?.fuel?.liters ?? 5;
  let added = 0;
  while (cans > 0 && v.fuel + per <= v.maxFuel + 0.01) {
    removeItem(ctx, 'fuel_can', 1, 'refuel');
    v.fuel = Math.min(v.maxFuel, v.fuel + per);
    added += per;
    cans--;
  }
  if (added > 0) {
    ctx.bus.emit('sfx:play', { key: 'siphon' });
    ctx.bus.emit('ui:toast', {
      text: `Refuelled +${added} L (${Math.round(v.fuel)}/${v.maxFuel} L).`,
      kind: 'good',
    });
  } else {
    ctx.bus.emit('ui:toast', {
      text: `Fuel ${Math.round(v.fuel)}/${v.maxFuel} L. Drive it from the world map when you leave the camp.`,
      kind: 'info',
    });
  }
  ctx.bus.emit('interact', { targetId: o.id, kind: 'vehicle', zoneId: zone.zoneId });
}

/** Progress 0..1 of the current hold action, for the in-world progress ring. */
export function actionProgress(zone: ZoneState): { targetId: string; verb: string; t: number } | null {
  const a = zone.player.action;
  if (a?.kind !== 'timed') return null;
  return { targetId: a.targetId, verb: a.verb, t: Math.min(1, a.t / a.duration) };
}
