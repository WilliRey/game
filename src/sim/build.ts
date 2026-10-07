/**
 * Builds the live ZoneState for a zone from its layout plus whatever the zone remembers from earlier
 * visits, and writes that memory back when the player leaves.
 */
import { BALANCE } from '@/config/balance';
import type { GameContext } from '@/core/store';
import type { RememberedZone } from '@/core/types';
import { checkAll } from '@/systems/conditions';
import { createStack } from '@/systems/items';
import { getLayout } from './layout';
import type { ContainerState, DoorState, NpcEntity, PlayerEntity, WorldItem, ZoneState } from './types';

export function encodeRle(bits: readonly number[]): string {
  const runs: number[] = [];
  let cur = 0;
  let n = 0;
  for (const b of bits) {
    const v = b ? 1 : 0;
    if (v === cur) n++;
    else {
      runs.push(n);
      cur = v;
      n = 1;
    }
  }
  runs.push(n);
  return runs.map((r) => r.toString(36)).join('.');
}

export function decodeRle(s: string, length: number): number[] {
  const out = new Array<number>(length).fill(0);
  if (!s) return out;
  let i = 0;
  let v = 0;
  for (const part of s.split('.')) {
    const n = Number.parseInt(part, 36) || 0;
    if (v === 1) out.fill(1, i, Math.min(length, i + n));
    i += n;
    v ^= 1;
  }
  return out;
}

export function newPlayerEntity(x: number, y: number, facing = 0): PlayerEntity {
  return {
    x,
    y,
    radius: 0.32,
    facing,
    crouched: false,
    aiming: false,
    sprinting: false,
    moving: false,
    vx: 0,
    vy: 0,
    staminaIdle: 10,
    action: null,
    fireCooldown: 0,
    shoveCooldown: 0,
    bloom: 0,
    footstepIn: 0,
    noise: 0,
    damagedAt: -100,
    hurtFlash: 0,
  };
}

/** Deterministic per-container roll for random locks. */
function containerLocked(
  ctx: GameContext,
  zoneId: string,
  id: string,
  type: string,
  danger: number,
): boolean {
  const ct = ctx.content.containerTypes[type];
  if (!ct) return false;
  const tier = Math.max(1, Math.min(4, danger || 1));
  const chance = ct.lockChanceByTier[tier - 1] ?? 0;
  if (chance <= 0) return false;
  return Rngish(`${ctx.state.seed}:${zoneId}:${id}:lock`) < chance;
}

/** A tiny hash-based uniform in [0,1) so lock rolls don't consume the main RNG stream. */
function Rngish(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function doorMaxHp(locked: boolean): number {
  return locked ? BALANCE.doors.lockedHp : BALANCE.doors.hp;
}

/** Create the zone state for `zoneId`, placing the player at `entry` (a start object id) or the default start. */
export function buildZone(ctx: GameContext, zoneId: string, entry?: string): ZoneState {
  const { content, state } = ctx;
  const def = content.zones[zoneId];
  if (!def) throw new Error(`Unknown zone '${zoneId}'`);
  const layout = getLayout(content, zoneId);
  const mem: RememberedZone | undefined = state.zones[zoneId];
  const n = layout.w * layout.h;
  const start = (entry && layout.starts[entry]) || layout.starts.default || { x: 1.5, y: 1.5 };

  const zone: ZoneState = {
    zoneId,
    w: layout.w,
    h: layout.h,
    tiles: [...layout.tiles],
    explored: mem ? decodeRle(mem.explored, n) : new Array<number>(n).fill(0),
    player: newPlayerEntity(start.x, start.y),
    doors: {},
    containers: {},
    objects: mem ? structuredClone(mem.objects) : {},
    zombies: [],
    npcs: [],
    items: [],
    thrown: [],
    hazards: [],
    tracers: [],
    decals: [],
    noises: [],
    nestsCleared: mem ? [...mem.nestsCleared] : [],
    time: 0,
    spawnIn: 60,
    enteredAtMinutes: state.time.minutes,
    safe: def.safe,
    danger: def.danger,
    ambientPopulation: mem?.ambientPopulation ?? 0,
    nextId: 1,
  };

  for (const d of layout.doors) {
    const r = mem?.doors[d.id];
    const maxHp = d.hp ?? doorMaxHp(d.locked);
    const door: DoorState = {
      id: d.id,
      x: d.x,
      y: d.y,
      open: r?.open ?? d.open,
      locked: r?.locked ?? d.locked,
      broken: r?.broken ?? false,
      hp: r?.hp ?? maxHp,
      maxHp,
      keyId: d.keyId,
    };
    zone.doors[d.id] = door;
  }

  for (const c of layout.containers) {
    const r = mem?.containers[c.id];
    const fixed = !!c.items;
    const cs: ContainerState = {
      id: c.id,
      type: c.type,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      rolled: r?.rolled ?? fixed,
      searched: r?.searched ?? false,
      items: r ? structuredClone(r.items) : [],
      locked:
        r?.locked ?? c.locked ?? (fixed ? false : containerLocked(ctx, zoneId, c.id, c.type, def.danger)),
      keyId: c.keyId,
      lootTable: c.lootTable,
      alarm: c.alarm,
      label: c.label,
    };
    if (!r && fixed) cs.items = c.items!.map((i) => createStack(state, content, i.itemId, i.qty));
    zone.containers[c.id] = cs;
  }

  // World items: remembered ones, or the zone's pre-placed pickups on a first visit.
  if (mem) zone.items = structuredClone(mem.items);
  else {
    for (const o of layout.objects) {
      if (o.type !== 'pickup' || !o.itemId) continue;
      if (!checkAll(ctx, o.if)) continue;
      const item: WorldItem = {
        uid: `w${o.id}`,
        x: o.x + 0.5,
        y: o.y + 0.5,
        stack: createStack(state, content, o.itemId, o.qty ?? 1),
        pickupId: o.id,
      };
      zone.items.push(item);
    }
  }

  refreshNpcs(ctx, zone);
  return zone;
}

/** NPC objects appear only while their conditions hold (e.g. Pike at the camp after being saved). */
export function refreshNpcs(ctx: GameContext, zone: ZoneState): boolean {
  const layout = getLayout(ctx.content, zone.zoneId);
  const want: NpcEntity[] = [];
  for (const o of layout.objects) {
    if (o.type !== 'npc' || !o.npcId) continue;
    if (!checkAll(ctx, o.if)) continue;
    const existing = zone.npcs.find((n) => n.id === o.id);
    want.push(existing ?? { id: o.id, npcId: o.npcId, x: o.x + 0.5, y: o.y + 0.5, facing: Math.PI / 2 });
  }
  const changed = want.length !== zone.npcs.length || want.some((n, i) => zone.npcs[i]?.id !== n.id);
  zone.npcs = want;
  return changed;
}

/** Snapshot what the zone should remember while the player is away. */
export function rememberZone(ctx: GameContext, zone: ZoneState): RememberedZone {
  const containers: RememberedZone['containers'] = {};
  for (const c of Object.values(zone.containers)) {
    containers[c.id] = {
      rolled: c.rolled,
      searched: c.searched,
      items: structuredClone(c.items),
      locked: c.locked,
    };
  }
  const doors: RememberedZone['doors'] = {};
  for (const d of Object.values(zone.doors))
    doors[d.id] = { open: d.open, hp: d.hp, locked: d.locked, broken: d.broken };
  return {
    lastVisitMinutes: ctx.state.time.minutes,
    containers,
    doors,
    objects: structuredClone(zone.objects),
    items: structuredClone(zone.items),
    nestsCleared: [...zone.nestsCleared],
    zombies: zone.zombies
      .filter((z) => z.hp > 0)
      .map((z) => ({ type: z.type, x: z.x, y: z.y, hp: z.hp, nestId: z.nestId })),
    ambientPopulation: zone.ambientPopulation,
    explored: encodeRle(zone.explored),
  };
}
