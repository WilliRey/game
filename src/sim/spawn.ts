/**
 * Zombie population (brief §5 Persistence): a first visit rolls the ambient population from spawn points
 * and places nests; later visits keep survivors and regenerate part of the ambient population per day
 * elapsed (cleared nests stay cleared). At night, a slow trickle arrives from spawn points out of sight.
 */
import { BALANCE, difficultyOf } from '@/config/balance';
import type { GameContext } from '@/core/store';
import { isNight } from '@/core/time';
import type { RememberedZone } from '@/core/types';
import { getLayout } from './layout';
import { getRuntime, isSolid } from './runtime';
import type { Zombie, ZoneState } from './types';

export function newZombie(
  ctx: GameContext,
  zone: ZoneState,
  type: string,
  x: number,
  y: number,
  hp?: number,
): Zombie | null {
  const def = ctx.content.enemies[type];
  if (!def) return null;
  const maxHp = Math.round(def.hp * difficultyOf(ctx.state.difficulty).zombieHp);
  return {
    id: `z${zone.nextId++}`,
    type,
    x,
    y,
    kx: 0,
    ky: 0,
    facing: ctx.rng.range(-Math.PI, Math.PI),
    hp: Math.min(maxHp, hp ?? maxHp),
    maxHp,
    mode: 'idle',
    modeTime: ctx.rng.range(0, 4),
    target: null,
    path: null,
    pathIndex: 0,
    repathIn: 0,
    senseIn: ctx.rng.range(0, 0.25),
    attackCooldown: 0,
    windup: 0,
    stagger: 0,
    bashDoor: null,
    bashIn: 0,
    awake: true,
    screamIn: 0,
    groanIn: ctx.rng.range(2, 10),
    hitFlash: 0,
    damagedAt: -100,
    stuck: 0,
  };
}

/** Spawn one enemy at a free spot near (x, y). Returns it, or null if no space. */
export function spawnEnemy(
  ctx: GameContext,
  zone: ZoneState,
  type: string,
  x: number,
  y: number,
  nestId?: string,
): Zombie | null {
  const rt = getRuntime(ctx.content, zone);
  for (let tries = 0; tries < 12; tries++) {
    const px = x + (tries === 0 ? 0 : ctx.rng.range(-1.5, 1.5));
    const py = y + (tries === 0 ? 0 : ctx.rng.range(-1.5, 1.5));
    if (isSolid(rt, Math.floor(px), Math.floor(py))) continue;
    const z = newZombie(ctx, zone, type, px, py);
    if (!z) return null;
    if (nestId) z.nestId = nestId;
    zone.zombies.push(z);
    return z;
  }
  return null;
}

/** Pick an ambient zombie type from the zone's spawn table weighted by time of day. */
export function pickAmbientType(ctx: GameContext, zone: ZoneState): string {
  const def = ctx.content.zones[zone.zoneId]!;
  const night = isNight(ctx.state.time.minutes);
  const table = Object.keys(def.spawns.types).length ? def.spawns.types : { walker: 1, runner: 1 };
  const entries = Object.entries(table)
    .map(([type, w]) => {
      const e = ctx.content.enemies[type];
      return { value: type, weight: w * (e ? (night ? e.nightWeight : e.dayWeight) : 0) };
    })
    .filter((e) => e.weight > 0);
  if (!entries.length) return 'walker';
  return ctx.rng.weighted(entries);
}

function ambientTarget(ctx: GameContext, zone: ZoneState): number {
  const def = ctx.content.zones[zone.zoneId]!;
  const layout = getLayout(ctx.content, zone.zoneId);
  if (def.safe || layout.spawnPoints.length === 0) return 0;
  const night = isNight(ctx.state.time.minutes);
  const base = def.spawns.density * layout.spawnPoints.length * 0.6;
  const n =
    base *
    (night ? BALANCE.zombies.nightDensityMultiplier : 1) *
    difficultyOf(ctx.state.difficulty).zombieDensity;
  return Math.min(def.spawns.max, Math.round(n));
}

/** Place zombies when entering a zone: fresh on a first visit, remembered + regenerated afterwards. */
export function populateZone(ctx: GameContext, zone: ZoneState, mem: RememberedZone | undefined): void {
  const def = ctx.content.zones[zone.zoneId]!;
  if (def.safe) return;
  const layout = getLayout(ctx.content, zone.zoneId);
  const points = layout.spawnPoints.filter((p) => Math.hypot(p.x - zone.player.x, p.y - zone.player.y) > 9);
  const nests = layout.objects.filter((o) => o.type === 'nest' && o.enemyType);

  if (!mem) {
    const target = ambientTarget(ctx, zone);
    for (let i = 0; i < target && points.length; i++) {
      const pt = points[i % points.length]!;
      spawnEnemy(ctx, zone, pickAmbientType(ctx, zone), pt.x, pt.y);
    }
    zone.ambientPopulation = target;
    for (const o of nests) {
      for (let i = 0; i < (o.count ?? 1); i++)
        spawnEnemy(ctx, zone, o.enemyType!, o.x + 0.5, o.y + 0.5, o.id);
    }
    for (const o of layout.objects) {
      if (o.type === 'spawn' && o.enemyType)
        for (let i = 0; i < (o.count ?? 1); i++) spawnEnemy(ctx, zone, o.enemyType, o.x + 0.5, o.y + 0.5);
    }
    return;
  }

  // Returning: survivors stay where they were.
  for (const r of mem.zombies) {
    const z = newZombie(ctx, zone, r.type, r.x, r.y, r.hp);
    if (!z) continue;
    if (r.nestId) z.nestId = r.nestId;
    zone.zombies.push(z);
  }
  const days = (ctx.state.time.minutes - mem.lastVisitMinutes) / 1440;
  // Ambient population regenerates partially per day away, never above what the zone started with.
  const ambientNow = mem.zombies.filter((z) => !z.nestId).length;
  const cap = Math.max(mem.ambientPopulation, ambientTarget(ctx, zone));
  const regen = Math.floor(cap * BALANCE.zombies.regenPerDay * days);
  const add = Math.max(0, Math.min(cap - ambientNow, regen));
  for (let i = 0; i < add && points.length; i++) {
    const pt = points[ctx.rng.int(0, points.length - 1)]!;
    spawnEnemy(ctx, zone, pickAmbientType(ctx, zone), pt.x, pt.y);
  }
  // Nests not yet cleared refill toward their size; cleared nests stay empty.
  for (const o of nests) {
    if (zone.nestsCleared.includes(o.id)) continue;
    const alive = zone.zombies.filter((z) => z.nestId === o.id).length;
    const refill = Math.min(
      (o.count ?? 1) - alive,
      Math.floor((o.count ?? 1) * BALANCE.zombies.regenPerDay * days),
    );
    for (let i = 0; i < refill; i++) spawnEnemy(ctx, zone, o.enemyType!, o.x + 0.5, o.y + 0.5, o.id);
  }
}

/** Night trickle: every so often after dark, a zombie wanders in from a spawn point the player can't see. */
export function updateTrickle(ctx: GameContext, zone: ZoneState, dt: number): void {
  if (zone.safe || !isNight(ctx.state.time.minutes)) return;
  zone.spawnIn -= dt;
  if (zone.spawnIn > 0) return;
  zone.spawnIn = BALANCE.zombies.nightTrickleSeconds;
  const def = ctx.content.zones[zone.zoneId]!;
  const alive = zone.zombies.filter((z) => z.hp > 0).length;
  if (alive >= def.spawns.max) return;
  const rt = getRuntime(ctx.content, zone);
  const layout = getLayout(ctx.content, zone.zoneId);
  const hidden = layout.spawnPoints.filter((p) => {
    const i = Math.floor(p.y) * rt.w + Math.floor(p.x);
    return !rt.visible[i] && Math.hypot(p.x - zone.player.x, p.y - zone.player.y) > 12;
  });
  if (!hidden.length) return;
  const pt = hidden[ctx.rng.int(0, hidden.length - 1)]!;
  spawnEnemy(ctx, zone, pickAmbientType(ctx, zone), pt.x, pt.y);
}
