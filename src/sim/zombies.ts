/**
 * Zombie AI (brief §5): senses (a vision cone shortened by night and crouching, lengthened by the
 * flashlight; hearing that walls dampen), the state machine idle/wander → investigate → chase → attack →
 * search → idle, grid A* with throttled re-pathing, crowd separation, door bashing, and sleeping when far.
 */
import { BALANCE } from '@/config/balance';
import type { EnemyDef } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { isNight } from '@/core/time';
import { SKILL, rank } from '@/systems/progression';
import { showHint } from '@/systems/story';
import { damagePlayer } from '@/systems/survival';
import { moveCircle, resolveTiles } from './collision';
import { zoneDarkness } from './fov';
import { emitNoise } from './noise';
import { findPath } from './pathfinding';
import { getRuntime, lineOfSight, raycast, rebuildGrids, type ZoneRuntime } from './runtime';
import type { DoorState, Zombie, ZoneState } from './types';

const DEG = Math.PI / 180;
const lastSeenAt = new WeakMap<Zombie, number>();

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function enemyDef(ctx: GameContext, z: Zombie): EnemyDef {
  return ctx.content.enemies[z.type] ?? ctx.content.enemies.walker!;
}

/** How far this zombie can see the player right now (brief §7 Vision). */
export function zombieSightRange(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, def: EnemyDef): number {
  const v = BALANCE.vision;
  const dark = zoneDarkness(ctx, rt);
  let r = (v.zombieSightDay + (v.zombieSightNight - v.zombieSightDay) * dark) * def.sightMultiplier;
  if (ctx.state.player.flashlightOn) r += v.zombieSightFlashlightBonus;
  if (zone.player.crouched) r *= v.zombieSightCrouchFactor;
  return r * SKILL.spotted(rank(ctx, 'stealth'));
}

export function canSeePlayer(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, z: Zombie): boolean {
  const p = zone.player;
  const d = Math.hypot(p.x - z.x, p.y - z.y);
  const hunting = z.mode === 'chase' || z.mode === 'attack';
  if (d < 1.3) return lineOfSight(rt, z.x, z.y, p.x, p.y);
  const range = zombieSightRange(ctx, zone, rt, enemyDef(ctx, z));
  if (d > (hunting ? range * 1.4 + 2 : range)) return false;
  if (
    !hunting &&
    angleDiff(Math.atan2(p.y - z.y, p.x - z.x), z.facing) > (BALANCE.vision.zombieConeDeg / 2) * DEG
  )
    return false;
  return lineOfSight(rt, z.x, z.y, p.x, p.y);
}

/** Zombies hear a noise if within its radius (×0.6 through walls) and go investigate. */
export function hearNoise(ctx: GameContext, zone: ZoneState, x: number, y: number, radius: number): void {
  const rt = getRuntime(ctx.content, zone);
  for (const z of zone.zombies) {
    if (z.hp <= 0) continue;
    const def = enemyDef(ctx, z);
    const d = Math.hypot(z.x - x, z.y - y);
    let r = radius * def.hearingMultiplier * BALANCE.zombies.hearingBase;
    if (d > r) continue;
    if (!lineOfSight(rt, x, y, z.x, z.y)) {
      r *= 0.6;
      if (d > r) continue;
    }
    z.awake = true;
    if (z.mode === 'chase' || z.mode === 'attack') continue;
    z.mode = 'investigate';
    z.modeTime = 0;
    z.target = { x: x + ctx.rng.range(-0.8, 0.8), y: y + ctx.rng.range(-0.8, 0.8) };
    z.path = null;
    z.repathIn = 0;
  }
}

function clearLine(rt: ZoneRuntime, x0: number, y0: number, x1: number, y1: number): boolean {
  return !raycast(rt, x0, y0, x1, y1, (i) => rt.solid[i] === 1).hit;
}

interface Budget {
  paths: number;
}

/** Steer toward (tx, ty), pathing around walls when needed. Returns true on arrival. */
function moveToward(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  z: Zombie,
  tx: number,
  ty: number,
  speed: number,
  dt: number,
  budget: Budget,
): boolean {
  const def = enemyDef(ctx, z);
  const dist = Math.hypot(tx - z.x, ty - z.y);
  if (dist < 0.4) {
    z.path = null;
    return true;
  }
  let wx = tx;
  let wy = ty;
  if (!(dist < 2.2 || clearLine(rt, z.x, z.y, tx, ty))) {
    const goalTile = Math.floor(ty) * rt.w + Math.floor(tx);
    const last = z.path?.[z.path.length - 1];
    const lastTile = last ? Math.floor(last.y) * rt.w + Math.floor(last.x) : -1;
    if ((!z.path || (z.repathIn <= 0 && lastTile !== goalTile) || z.stuck > 1) && budget.paths > 0) {
      budget.paths--;
      z.path = findPath(rt, z.x, z.y, tx, ty, { maxNodes: 2000 });
      z.pathIndex = 0;
      z.repathIn = BALANCE.zombies.repathIntervalSeconds + ctx.rng.range(0, 0.3);
      z.stuck = 0;
      if (!z.path) z.repathIn = 1.5;
    }
    if (z.path) {
      while (z.pathIndex < z.path.length) {
        const wp = z.path[z.pathIndex]!;
        if (Math.hypot(wp.x - z.x, wp.y - z.y) < 0.35) {
          z.pathIndex++;
          continue;
        }
        const next = z.path[z.pathIndex + 1];
        if (next && clearLine(rt, z.x, z.y, next.x, next.y)) {
          z.pathIndex++;
          continue;
        }
        break;
      }
      const wp = z.path[z.pathIndex];
      if (wp) {
        wx = wp.x;
        wy = wp.y;
      }
    }
  }
  const dx = wx - z.x;
  const dy = wy - z.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  // A closed door in the way gets bashed.
  const ahead = Math.floor(z.y + uy * (def.radius + 0.3)) * rt.w + Math.floor(z.x + ux * (def.radius + 0.3));
  const doorId = rt.doorAt.get(ahead);
  const door = doorId ? zone.doors[doorId] : undefined;
  if (door && !door.open && !door.broken) {
    bashDoor(ctx, zone, rt, z, door, dt);
    z.facing = Math.atan2(uy, ux);
    return false;
  }
  const bx = z.x;
  const by = z.y;
  moveCircle(rt, z, def.radius, ux * speed * dt, uy * speed * dt);
  const moved = Math.hypot(z.x - bx, z.y - by);
  z.stuck = moved < speed * dt * 0.2 ? z.stuck + dt : Math.max(0, z.stuck - dt);
  const want = Math.atan2(uy, ux);
  z.facing += Math.max(-dt * 8, Math.min(dt * 8, wrap(want - z.facing)));
  return false;
}

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function bashDoor(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  z: Zombie,
  door: DoorState,
  dt: number,
): void {
  z.bashIn -= dt;
  if (z.bashIn > 0) return;
  z.bashIn = BALANCE.zombies.doorBashInterval * ctx.rng.range(0.85, 1.15);
  const def = enemyDef(ctx, z);
  door.hp -= BALANCE.zombies.doorBashDamage * (def.boss ? 3 : 1);
  ctx.bus.emit('sfx:play', { key: 'door_bash', x: door.x + 0.5, y: door.y + 0.5 });
  emitNoise(ctx, zone, door.x + 0.5, door.y + 0.5, BALANCE.noise.doorBash, 'bash', false);
  if (door.hp <= 0) {
    door.hp = 0;
    door.broken = true;
    door.open = true;
    door.locked = false;
    rebuildGrids(rt, ctx.content);
    ctx.bus.emit('door:changed', { doorId: door.id, open: true, broken: true });
    ctx.bus.emit('sfx:play', { key: 'door_break', x: door.x + 0.5, y: door.y + 0.5 });
  }
}

function setMode(z: Zombie, mode: Zombie['mode']): void {
  if (z.mode === mode) return;
  z.mode = mode;
  z.modeTime = 0;
  if (mode !== 'attack') z.windup = 0;
}

function onSpotted(ctx: GameContext, zone: ZoneState, z: Zombie): void {
  const def = enemyDef(ctx, z);
  ctx.bus.emit('sfx:play', { key: 'zombie_alert', x: z.x, y: z.y, volume: 0.8 });
  showHint(ctx, 'fight');
  if (def.special === 'scream' && z.screamIn <= 0) {
    z.screamIn = 15;
    ctx.bus.emit('sfx:play', { key: 'scream', x: z.x, y: z.y, volume: 1 });
    ctx.bus.emit('ui:toast', { text: 'A screamer shrieks — everything nearby heard that.', kind: 'warn' });
    const p = zone.player;
    for (const o of zone.zombies) {
      if (o === z || o.hp <= 0 || Math.hypot(o.x - z.x, o.y - z.y) > 30) continue;
      o.awake = true;
      if (o.mode === 'chase' || o.mode === 'attack') continue;
      setMode(o, 'investigate');
      o.target = { x: p.x, y: p.y };
      o.path = null;
      o.repathIn = 0;
    }
    emitNoise(ctx, zone, z.x, z.y, 30, 'scream', false);
  }
}

function attackPlayer(ctx: GameContext, zone: ZoneState, z: Zombie): void {
  const def = enemyDef(ctx, z);
  const p = zone.player;
  const dmg = ctx.rng.int(def.damage[0], def.damage[1]);
  const taken = damagePlayer(ctx, dmg, z.type, {
    infectionChance: def.infectionChance ?? BALANCE.health.infectionChancePerHit,
    bleedChance: BALANCE.health.bleedChancePerHit,
  });
  if (taken <= 0) return;
  p.hurtFlash = 0.25;
  p.damagedAt = zone.time;
  if (p.action?.kind === 'timed') p.action = null;
  const a = Math.atan2(p.y - z.y, p.x - z.x);
  zone.decals.push({
    x: p.x + Math.cos(a) * 0.3,
    y: p.y + Math.sin(a) * 0.3,
    kind: 'blood',
    rot: ctx.rng.range(0, 6.28),
    scale: 0.6,
  });
  ctx.bus.emit('sfx:play', { key: 'hurt', x: p.x, y: p.y });
  ctx.bus.emit('fx:shake', { intensity: 0.006, durationMs: 140 });
}

/** One AI tick for every zombie in the zone. */
export function updateZombies(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, dt: number): void {
  const p = zone.player;
  const Z = BALANCE.zombies;
  const night = isNight(ctx.state.time.minutes);
  const budget: Budget = { paths: 8 };
  const dead = !!ctx.state.player.dead;

  for (const z of zone.zombies) {
    if (z.hp <= 0) continue;
    const def = enemyDef(ctx, z);
    const d = Math.hypot(p.x - z.x, p.y - z.y);
    const hunting =
      z.mode === 'chase' || z.mode === 'attack' || z.mode === 'investigate' || z.mode === 'search';
    // Distant zombies sleep (brief: performance); noise or the player coming close wakes them.
    if (d > Z.sleepDistanceTiles && !hunting) {
      z.awake = false;
      continue;
    }
    z.awake = true;
    z.hitFlash = Math.max(0, z.hitFlash - dt);
    z.attackCooldown -= dt;
    z.modeTime += dt;
    z.senseIn -= dt;
    z.repathIn -= dt;
    z.screamIn -= dt;
    z.groanIn -= dt;

    if (Math.abs(z.kx) > 0.02 || Math.abs(z.ky) > 0.02) {
      moveCircle(rt, z, def.radius, z.kx * dt, z.ky * dt);
      const f = Math.exp(-9 * dt);
      z.kx *= f;
      z.ky *= f;
    }
    if (z.stagger > 0) {
      z.stagger -= dt;
      z.windup = 0;
      continue;
    }

    if (z.senseIn <= 0) {
      z.senseIn = (d > 22 ? 0.5 : 0.2) + ctx.rng.range(0, 0.1);
      if (!dead && canSeePlayer(ctx, zone, rt, z)) {
        if (z.mode !== 'chase' && z.mode !== 'attack') {
          setMode(z, 'chase');
          onSpotted(ctx, zone, z);
        }
        lastSeenAt.set(z, zone.time);
        z.target = { x: p.x, y: p.y };
      } else if ((z.mode === 'chase' || z.mode === 'attack') && zone.time - (lastSeenAt.get(z) ?? 0) > 1.2) {
        setMode(z, 'search');
        z.path = null;
      }
    }

    const baseSpeed = def.speed;
    const speed = night
      ? Math.min(
          baseSpeed * BALANCE.speed.nightZombieSpeedMultiplier,
          Math.max(baseSpeed, BALANCE.speed.sprint - 0.25),
        )
      : baseSpeed;
    const attackRange = BALANCE.zombies.attackRange + def.radius;

    switch (z.mode) {
      case 'idle':
        if (z.modeTime > 3 + ctx.rng.range(0, 6)) {
          const a = ctx.rng.range(-Math.PI, Math.PI);
          const r = ctx.rng.range(1.5, 4);
          const tx = z.x + Math.cos(a) * r;
          const ty = z.y + Math.sin(a) * r;
          if (clearLine(rt, z.x, z.y, tx, ty)) {
            z.target = { x: tx, y: ty };
            setMode(z, 'wander');
          } else z.modeTime = 0;
        }
        break;
      case 'wander':
        if (
          !z.target ||
          moveToward(ctx, zone, rt, z, z.target.x, z.target.y, speed * 0.45, dt, budget) ||
          z.modeTime > 8
        )
          setMode(z, 'idle');
        break;
      case 'investigate':
        if (z.target && !moveToward(ctx, zone, rt, z, z.target.x, z.target.y, speed * 0.8, dt, budget)) {
          if (z.modeTime > Z.investigateGiveUpSeconds * 2) setMode(z, 'idle');
        } else {
          // Arrived: look around for a few seconds.
          z.facing += Math.sin(zone.time * 1.7 + z.x) * dt * 1.5;
          if (z.modeTime > Z.investigateGiveUpSeconds) setMode(z, 'idle');
        }
        break;
      case 'chase':
        if (dead) {
          setMode(z, 'idle');
          break;
        }
        if (d <= attackRange) {
          setMode(z, 'attack');
          break;
        }
        moveToward(ctx, zone, rt, z, z.target?.x ?? p.x, z.target?.y ?? p.y, speed, dt, budget);
        break;
      case 'attack': {
        z.facing = Math.atan2(p.y - z.y, p.x - z.x);
        if (z.windup > 0) {
          z.windup -= dt;
          if (z.windup <= 0) {
            z.attackCooldown = def.attackCooldown;
            if (!dead && d <= attackRange + 0.35 && lineOfSight(rt, z.x, z.y, p.x, p.y))
              attackPlayer(ctx, zone, z);
          }
        } else if (dead || d > attackRange + 0.3) {
          setMode(z, 'chase');
        } else if (z.attackCooldown <= 0) {
          z.windup = 0.38;
          ctx.bus.emit('sfx:play', { key: 'zombie_attack', x: z.x, y: z.y, volume: 0.7 });
        }
        break;
      }
      case 'search':
        if (z.target && z.modeTime < 4) {
          if (moveToward(ctx, zone, rt, z, z.target.x, z.target.y, speed * 0.8, dt, budget)) z.target = null;
        } else if (z.modeTime < Z.searchSeconds) {
          if (!z.target || moveToward(ctx, zone, rt, z, z.target.x, z.target.y, speed * 0.4, dt, budget)) {
            const a = ctx.rng.range(-Math.PI, Math.PI);
            const tx = z.x + Math.cos(a) * 2.5;
            const ty = z.y + Math.sin(a) * 2.5;
            z.target = clearLine(rt, z.x, z.y, tx, ty) ? { x: tx, y: ty } : null;
          }
        } else setMode(z, 'idle');
        break;
      case 'dead':
        break;
    }

    if (z.groanIn <= 0) {
      z.groanIn = ctx.rng.range(6, 14);
      if (d < 16)
        ctx.bus.emit('sfx:play', { key: def.boss ? 'boss_groan' : 'groan', x: z.x, y: z.y, volume: 0.5 });
    }
  }
  separate(ctx, zone, rt);
}

/** Push overlapping zombies (and the player) apart so crowds don't stack. */
function separate(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime): void {
  const cell = new Map<number, Zombie[]>();
  const W = zone.w;
  for (const z of zone.zombies) {
    if (z.hp <= 0 || !z.awake) continue;
    const k = Math.floor(z.y) * W + Math.floor(z.x);
    let list = cell.get(k);
    if (!list) cell.set(k, (list = []));
    list.push(z);
  }
  const p = zone.player;
  for (const z of zone.zombies) {
    if (z.hp <= 0 || !z.awake) continue;
    const r = enemyDef(ctx, z).radius;
    const cx = Math.floor(z.x);
    const cy = Math.floor(z.y);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const list = cell.get((cy + oy) * W + (cx + ox));
        if (!list) continue;
        for (const o of list) {
          if (o === z || o.id < z.id) continue;
          const ro = enemyDef(ctx, o).radius;
          const dx = o.x - z.x;
          const dy = o.y - z.y;
          const d = Math.hypot(dx, dy);
          const min = (r + ro) * BALANCE.zombies.separationRadius * 1.25;
          if (d >= min || d < 1e-6) continue;
          const push = (min - d) * 0.5;
          z.x -= (dx / d) * push;
          z.y -= (dy / d) * push;
          o.x += (dx / d) * push;
          o.y += (dy / d) * push;
        }
      }
    }
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const d = Math.hypot(dx, dy);
    const min = r + p.radius;
    if (d < min && d > 1e-6) {
      const push = min - d;
      z.x -= (dx / d) * push * 0.8;
      z.y -= (dy / d) * push * 0.8;
      p.x += (dx / d) * push * 0.2;
      p.y += (dy / d) * push * 0.2;
      resolveTiles(rt, p, p.radius);
    }
    resolveTiles(rt, z, r);
  }
}
