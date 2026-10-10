/**
 * Player combat (brief §5 Combat & weapons): melee arcs with wind-up/recovery, stamina, knockback,
 * stagger, cleave and ×3 sneak attacks; firearms with magazines, reserve ammo, shell-by-shell reloads,
 * bloom, wall-stopped hitscan and jams; shove; throwables (bottle, molotov, pipe bomb); hazards; durability.
 */
import { BALANCE, difficultyOf } from '@/config/balance';
import type { GameContext } from '@/core/store';
import type { ItemStack } from '@/core/types';
import {
  activeWeapon,
  ammoItemFor,
  ammoReserve,
  cycleSlot,
  equippedIn,
  findStack,
  removeItem,
  removeStack,
  selectSlot,
} from '@/systems/inventory';
import {
  FISTS,
  condition,
  isBroken,
  weaponStats,
  type FirearmStats,
  type MeleeStats,
  type ThrowStats,
} from '@/systems/items';
import { perk } from '@/systems/classes';
import { SKILL, grantXp, rank } from '@/systems/progression';
import { showHint } from '@/systems/story';
import { damagePlayer, useItem } from '@/systems/survival';
import { createStack } from '@/systems/items';
import { emitNoise } from './noise';
import type { PlayerInput } from './player';
import { lineOfSight, raycast, type ZoneRuntime } from './runtime';
import type { Hazard, Zombie, ZoneState } from './types';
import { enemyDef } from './zombies';

const DEG = Math.PI / 180;

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Unaware (not hunting you) and hit from outside its vision cone. */
export function isSneakAttack(z: Zombie, fromX: number, fromY: number): boolean {
  if (z.mode === 'chase' || z.mode === 'attack') return false;
  const toAttacker = Math.atan2(fromY - z.y, fromX - z.x);
  return angleDiff(toAttacker, z.facing) > (BALANCE.vision.zombieConeDeg / 2) * DEG;
}

function wear(ctx: GameContext, s: ItemStack | null, amount: number): void {
  if (!s || s.durability === undefined) return;
  const before = s.durability;
  s.durability = Math.max(0, s.durability - amount * difficultyOf(ctx.state.difficulty).durabilityWear);
  if (before > 0 && s.durability <= 0) {
    ctx.bus.emit('weapon:broken', { itemId: s.itemId });
    ctx.bus.emit('ui:toast', {
      text: `${ctx.content.items[s.itemId]?.name ?? 'Weapon'} broke!`,
      kind: 'warn',
    });
    ctx.bus.emit('sfx:play', { key: 'break' });
    showHint(ctx, 'weapon_broken');
  }
}

export interface DamageOpts {
  angle: number;
  knockback: number;
  staggerChance: number;
  crit: boolean;
  weaponId?: string;
  silent?: boolean;
  /** Melee hits interrupt the wind-up and stun the zombie (scaled down by its stagger resistance). */
  melee?: boolean;
}

/** Damage a zombie, with knockback, stagger, hit flash, numbers and death handling. */
export function damageZombie(
  ctx: GameContext,
  zone: ZoneState,
  z: Zombie,
  amount: number,
  o: DamageOpts,
): void {
  if (z.hp <= 0) return;
  const def = enemyDef(ctx, z);
  z.hp -= amount;
  z.hitFlash = 0.1;
  z.damagedAt = zone.time;
  const resist = 1 - def.staggerResist;
  const C = BALANCE.combat;
  z.kx += Math.cos(o.angle) * o.knockback * 5 * resist;
  z.ky += Math.sin(o.angle) * o.knockback * 5 * resist;
  if (ctx.rng.chance(o.staggerChance * resist)) z.stagger = Math.max(z.stagger, C.staggerSeconds * resist);
  // Every melee hit cuts a wind-up short; tough zombies (bloaters, the boss) mostly shrug it off.
  if (o.melee && ctx.rng.chance(resist)) {
    z.windup = 0;
    z.stagger = Math.max(z.stagger, C.meleeHitStunSeconds * resist);
  }
  if (z.mode !== 'chase' && z.mode !== 'attack' && z.hp > 0) {
    z.mode = 'chase';
    z.modeTime = 0;
    z.target = { x: zone.player.x, y: zone.player.y };
  }
  ctx.bus.emit('enemy:damaged', { enemyId: z.id, amount, x: z.x, y: z.y, crit: o.crit });
  if (!o.silent) ctx.bus.emit('fx:damageNumber', { x: z.x, y: z.y, amount, crit: o.crit });
  if (!o.silent && ctx.rng.chance(0.5))
    zone.decals.push({
      x: z.x + ctx.rng.range(-0.3, 0.3),
      y: z.y + ctx.rng.range(-0.3, 0.3),
      kind: 'blood',
      rot: ctx.rng.range(0, 6.28),
      scale: ctx.rng.range(0.5, 1),
    });
  if (z.hp <= 0) killZombie(ctx, zone, z, o);
}

function killZombie(ctx: GameContext, zone: ZoneState, z: Zombie, o: DamageOpts): void {
  const def = enemyDef(ctx, z);
  z.hp = 0;
  z.mode = 'dead';
  zone.decals.push({ x: z.x, y: z.y, kind: 'gore', rot: o.angle, scale: def.boss ? 2.2 : def.radius / 0.38 });
  ctx.state.stats.kills += 1;
  ctx.bus.emit('sfx:play', { key: def.boss ? 'boss_death' : 'zombie_death', x: z.x, y: z.y });
  if (def.special === 'burst' && def.burst) {
    zone.hazards.push({
      id: `h${zone.nextId++}`,
      kind: 'gas',
      x: z.x,
      y: z.y,
      radius: def.burst.radius,
      ttl: def.burst.durationSec,
      dps: def.burst.damage,
      byPlayer: false,
      pulseIn: 0,
    });
    ctx.bus.emit('sfx:play', { key: 'burst', x: z.x, y: z.y });
    ctx.bus.emit('fx:shake', { intensity: def.boss ? 0.012 : 0.005, durationMs: 250 });
  }
  grantXp(ctx, BALANCE.progression.killXp[z.type] ?? def.xp, `kill:${z.type}`);
  ctx.bus.emit('enemy:killed', {
    enemyType: z.type,
    enemyId: z.id,
    zoneId: zone.zoneId,
    sneak: o.crit,
    weaponId: o.weaponId,
  });
  if (z.nestId && !zone.zombies.some((x) => x !== z && x.hp > 0 && x.nestId === z.nestId)) {
    if (!zone.nestsCleared.includes(z.nestId)) zone.nestsCleared.push(z.nestId);
  }
  zone.zombies = zone.zombies.filter((x) => x !== z);
}

// ---------------------------------------------------------------- melee

function meleeStats(ctx: GameContext, s: ItemStack | null): MeleeStats {
  if (!s || isBroken(s)) return FISTS;
  const st = weaponStats(ctx.content, s);
  return st?.kind === 'melee' ? st : FISTS;
}

function startMelee(ctx: GameContext, zone: ZoneState, s: ItemStack | null): void {
  const p = zone.player;
  const pl = ctx.state.player;
  const st = meleeStats(ctx, s);
  const cost = p.adrenaline > 0 ? 0 : st.stamina * SKILL.meleeStamina(rank(ctx, 'melee'));
  const tired = pl.stamina < cost;
  pl.stamina = Math.max(0, pl.stamina - cost);
  p.staminaIdle = 0;
  const slow = tired ? 1.5 : 1;
  p.action = {
    kind: 'melee',
    phase: 'windup',
    t: 0,
    windup: (st.windupMs / 1000) * slow,
    recovery: (st.recoveryMs / 1000) * slow,
    uid: s && !isBroken(s) ? s.uid : null,
    angle: p.facing,
  };
  pl.lastCombatAt = ctx.state.time.minutes;
  ctx.bus.emit('sfx:play', { key: st.heavy ? 'swing_heavy' : 'swing', x: p.x, y: p.y, volume: 0.6 });
  ctx.bus.emit('fx:swing', {
    angle: p.facing,
    windup: p.action.windup,
    recovery: p.action.recovery,
    heavy: st.heavy,
  });
}

function strike(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, uid: string | null, angle: number): void {
  const p = zone.player;
  const s = uid ? (findStack(ctx, uid) ?? null) : null;
  const st = meleeStats(ctx, s);
  const pl = ctx.state.player;
  const tired = pl.stamina <= 0;
  const hits = zone.zombies
    .filter((z) => {
      if (z.hp <= 0) return false;
      const r = enemyDef(ctx, z).radius;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d - r > st.range) return false;
      if (d > 0.4 && angleDiff(Math.atan2(z.y - p.y, z.x - p.x), angle) > (st.arcDeg / 2) * DEG + 0.15)
        return false;
      return lineOfSight(rt, p.x, p.y, z.x, z.y);
    })
    .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
    .slice(0, st.cleave ? 3 : 1);
  if (!hits.length) return;
  for (const z of hits) {
    const sneak = isSneakAttack(z, p.x, p.y);
    let dmg = st.damage * SKILL.meleeDamage(rank(ctx, 'melee')) * ctx.rng.range(0.9, 1.1) * (tired ? 0.6 : 1);
    if (sneak) dmg *= BALANCE.combat.sneakMultiplier;
    damageZombie(ctx, zone, z, dmg, {
      angle: Math.atan2(z.y - p.y, z.x - p.x),
      knockback: st.knockback,
      staggerChance: st.staggerChance,
      crit: sneak,
      weaponId: s?.itemId,
      melee: true,
    });
  }
  wear(ctx, s, ctx.content.items[s?.itemId ?? '']?.weapon?.wearPerUse ?? 1);
  emitNoise(ctx, zone, p.x, p.y, BALANCE.noise.meleeHit, 'melee', true);
  const first = hits[0]!;
  ctx.bus.emit('sfx:play', { key: st.heavy ? 'hit_heavy' : 'hit', x: first.x, y: first.y });
  ctx.bus.emit('fx:meleeHit', {
    x: first.x,
    y: first.y,
    angle: Math.atan2(first.y - p.y, first.x - p.x),
    heavy: st.heavy,
    count: hits.length,
  });
  ctx.bus.emit('fx:hitstop', { ms: st.heavy ? BALANCE.combat.hitStopHeavyMs : BALANCE.combat.hitStopMs });
  ctx.bus.emit('fx:shake', { intensity: st.heavy ? 0.006 : 0.003, durationMs: st.heavy ? 120 : 70 });
}

// ---------------------------------------------------------------- firearms

function fire(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, s: ItemStack, st: FirearmStats): void {
  const p = zone.player;
  if (p.fireCooldown > 0) return;
  if (p.action?.kind === 'reload') {
    // Firing interrupts a shell-by-shell reload if there's anything loaded.
    if (!st.shellByShell || (s.mag ?? 0) <= 0) return;
    p.action = null;
  }
  if (isBroken(s)) {
    ctx.bus.emit('ui:toast', { text: 'This weapon is broken. Repair it at a workbench.', kind: 'warn' });
    p.fireCooldown = 0.4;
    return;
  }
  if (s.jammed) {
    ctx.bus.emit('sfx:play', { key: 'click' });
    ctx.bus.emit('ui:toast', { text: 'Jammed! Press R to clear it.', kind: 'warn' });
    p.fireCooldown = 0.35;
    return;
  }
  if ((s.mag ?? 0) <= 0) {
    ctx.bus.emit('sfx:play', { key: 'click' });
    p.fireCooldown = 0.3;
    showHint(ctx, 'reload');
    return;
  }
  if (st.jamChance > 0 && ctx.rng.chance(st.jamChance * (2 - condition(s)))) {
    s.jammed = true;
    p.fireCooldown = 0.3;
    ctx.bus.emit('sfx:play', { key: 'jam', x: p.x, y: p.y });
    ctx.bus.emit('ui:toast', { text: 'Jammed! Press R to clear it.', kind: 'warn' });
    return;
  }
  s.mag = (s.mag ?? 0) - 1;
  p.fireCooldown = st.fireIntervalMs / 1000;
  const C = BALANCE.combat;
  let spread =
    (st.spreadBaseDeg + p.bloom) *
    (p.aiming ? C.aimBloomFactor : 1) *
    SKILL.firearmSpread(rank(ctx, 'firearms')) *
    perk(ctx).firearmSpread;
  spread = Math.min(spread, st.spreadMaxDeg);
  const mx = p.x + Math.cos(p.facing) * 0.45;
  const my = p.y + Math.sin(p.facing) * 0.45;
  for (let i = 0; i < st.pellets; i++) {
    const a = p.facing + ctx.rng.range(-spread / 2, spread / 2) * DEG;
    shootRay(ctx, zone, rt, mx, my, a, st, s);
  }
  p.bloom = Math.min(st.spreadMaxDeg, p.bloom + C.bloomPerShot * st.recoilBloom);
  emitNoise(ctx, zone, p.x, p.y, st.noise, st.suppressed ? 'suppressed' : 'gunshot', true);
  wear(ctx, s, ctx.content.items[s.itemId]?.weapon?.wearPerUse ?? 1);
  ctx.state.player.lastCombatAt = ctx.state.time.minutes;
  const sfx = st.suppressed ? 'shot_suppressed' : `shot_${s.itemId}`;
  ctx.bus.emit('sfx:play', { key: sfx, x: p.x, y: p.y, volume: 1 });
  ctx.bus.emit('fx:muzzle', {
    x: mx,
    y: my,
    angle: p.facing,
    small: st.suppressed || st.ammoType === 'bolt',
  });
  ctx.bus.emit('weapon:fired', { itemId: s.itemId, x: p.x, y: p.y });
  if (st.pellets > 1 || st.damage >= 50) ctx.bus.emit('fx:shake', { intensity: 0.005, durationMs: 90 });
  if ((s.mag ?? 0) === 0 && ammoReserve(ctx, st.ammoType) > 0) showHint(ctx, 'reload');
}

/** Hitscan: the first zombie along the ray before any wall takes the hit. */
function shootRay(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  x0: number,
  y0: number,
  angle: number,
  st: FirearmStats,
  s: ItemStack,
): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const wall = raycast(rt, x0, y0, x0 + dx * st.range, y0 + dy * st.range, (i) => rt.opaque[i] === 1);
  const maxT = Math.hypot(wall.x - x0, wall.y - y0);
  let best: Zombie | null = null;
  let bestT = maxT;
  for (const z of zone.zombies) {
    if (z.hp <= 0) continue;
    const r = enemyDef(ctx, z).radius;
    const fx = z.x - x0;
    const fy = z.y - y0;
    const t = fx * dx + fy * dy;
    if (t < 0 || t > bestT) continue;
    const px = fx - t * dx;
    const py = fy - t * dy;
    if (px * px + py * py > r * r) continue;
    best = z;
    bestT = t;
  }
  const ex = x0 + dx * bestT;
  const ey = y0 + dy * bestT;
  zone.tracers.push({ x1: x0, y1: y0, x2: ex, y2: ey, ttl: st.ammoType === 'bolt' ? 0.12 : 0.06 });
  if (best) {
    const falloff = bestT > st.range * 0.6 && st.pellets > 1 ? 0.6 : 1;
    const sneak = st.ammoType === 'bolt' && isSneakAttack(best, zone.player.x, zone.player.y);
    let dmg = st.damage * falloff * ctx.rng.range(0.92, 1.08) * perk(ctx).firearmDamage;
    if (sneak) dmg *= BALANCE.combat.sneakMultiplier;
    damageZombie(ctx, zone, best, dmg, {
      angle,
      knockback: st.pellets > 1 ? 0.35 : st.damage >= 50 ? 0.8 : 0.25,
      staggerChance: st.damage >= 50 ? 0.6 : 0.15,
      crit: sneak,
      weaponId: s.itemId,
    });
  } else if (wall.hit) {
    ctx.bus.emit('fx:spark', { x: ex, y: ey });
  }
  if (st.recoverable && ctx.rng.chance(0.7)) {
    const ammo = ammoItemFor(ctx, st.ammoType);
    if (ammo) {
      const bx = ex - dx * 0.3;
      const by = ey - dy * 0.3;
      zone.items.push({
        uid: `w${zone.nextId++}`,
        x: bx,
        y: by,
        stack: createStack(ctx.state, ctx.content, ammo, 1),
      });
    }
  }
}

function startReload(ctx: GameContext, zone: ZoneState, s: ItemStack, st: FirearmStats): void {
  const p = zone.player;
  if (p.action) return;
  const reserve = ammoReserve(ctx, st.ammoType);
  const full = (s.mag ?? 0) >= st.magSize;
  if (!s.jammed && (full || reserve <= 0)) {
    if (reserve <= 0 && !full) ctx.bus.emit('ui:toast', { text: 'No ammo for this weapon.', kind: 'warn' });
    return;
  }
  const speed = SKILL.reloadSpeed(rank(ctx, 'firearms')) * perk(ctx).reloadSpeed;
  const base = s.jammed ? st.reloadMs * 0.7 : st.reloadMs;
  p.action = { kind: 'reload', t: 0, duration: base / 1000 / speed, uid: s.uid };
  ctx.bus.emit('sfx:play', { key: s.jammed ? 'unjam' : 'reload', x: p.x, y: p.y, volume: 0.6 });
}

function finishReload(ctx: GameContext, zone: ZoneState, s: ItemStack, st: FirearmStats): void {
  const p = zone.player;
  if (s.jammed) {
    s.jammed = false;
    if ((s.mag ?? 0) > 0 || ammoReserve(ctx, st.ammoType) === 0) return;
  }
  const ammo = ammoItemFor(ctx, st.ammoType);
  if (!ammo) return;
  const want = st.shellByShell ? 1 : st.magSize - (s.mag ?? 0);
  const n = Math.min(want, ammoReserve(ctx, st.ammoType));
  if (n <= 0) return;
  removeItem(ctx, ammo, n, 'reload');
  s.mag = (s.mag ?? 0) + n;
  if (st.shellByShell && s.mag < st.magSize && ammoReserve(ctx, st.ammoType) > 0) {
    p.action = {
      kind: 'reload',
      t: 0,
      duration: st.reloadMs / 1000 / (SKILL.reloadSpeed(rank(ctx, 'firearms')) * perk(ctx).reloadSpeed),
      uid: s.uid,
    };
    ctx.bus.emit('sfx:play', { key: 'shell', x: p.x, y: p.y, volume: 0.5 });
  }
}

// ---------------------------------------------------------------- shove & throw

function shove(ctx: GameContext, zone: ZoneState): void {
  const p = zone.player;
  const pl = ctx.state.player;
  const C = BALANCE.combat;
  const cost = p.adrenaline > 0 ? 0 : C.shoveStamina;
  if (p.shoveCooldown > 0 || pl.stamina < cost * 0.5) return;
  pl.stamina = Math.max(0, pl.stamina - cost);
  p.staminaIdle = 0;
  p.shoveCooldown = 0.6;
  let n = 0;
  for (const z of zone.zombies) {
    if (z.hp <= 0) continue;
    const r = enemyDef(ctx, z).radius;
    const d = Math.hypot(z.x - p.x, z.y - p.y);
    if (d - r > C.shoveRange) continue;
    const a = Math.atan2(z.y - p.y, z.x - p.x);
    if (d > 0.5 && angleDiff(a, p.facing) > (C.shoveArcDeg / 2) * DEG) continue;
    const resist = 1 - enemyDef(ctx, z).staggerResist;
    z.kx += Math.cos(a) * C.shoveKnockback * 5 * resist;
    z.ky += Math.sin(a) * C.shoveKnockback * 5 * resist;
    z.stagger = Math.max(z.stagger, 0.8 * resist);
    z.windup = 0;
    n++;
  }
  emitNoise(ctx, zone, p.x, p.y, 3, 'shove', true);
  ctx.bus.emit('sfx:play', { key: n ? 'shove_hit' : 'swing', x: p.x, y: p.y, volume: 0.6 });
  pl.lastCombatAt = ctx.state.time.minutes;
}

function throwItem(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  s: ItemStack,
  st: ThrowStats,
  aimX: number,
  aimY: number,
): void {
  if (zone.player.action) return;
  const itemId = s.itemId;
  removeStack(ctx, s.uid, 1, 'thrown');
  launch(ctx, zone, rt, itemId, st.throwRange, aimX, aimY);
}

/**
 * Send a throwable flying toward the aim point (clamped to its range, stopped short of walls). Used by
 * thrown items and by class abilities that throw a gadget without spending one.
 */
export function launch(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  itemId: string,
  range: number,
  aimX: number,
  aimY: number,
): void {
  const p = zone.player;
  let dist = Math.min(range, Math.hypot(aimX - p.x, aimY - p.y));
  dist = Math.max(1.2, dist);
  const a = p.facing;
  const tx = p.x + Math.cos(a) * dist;
  const ty = p.y + Math.sin(a) * dist;
  const hit = raycast(rt, p.x, p.y, tx, ty, (i) => rt.solid[i] === 1 && rt.opaque[i] === 1);
  const ex = hit.hit ? hit.x - Math.cos(a) * 0.3 : tx;
  const ey = hit.hit ? hit.y - Math.sin(a) * 0.3 : ty;
  zone.thrown.push({
    id: `t${zone.nextId++}`,
    itemId,
    x0: p.x,
    y0: p.y,
    x1: ex,
    y1: ey,
    t: 0,
    duration: 0.25 + Math.hypot(ex - p.x, ey - p.y) * 0.05,
  });
  ctx.bus.emit('sfx:play', { key: 'throw', x: p.x, y: p.y, volume: 0.5 });
  ctx.state.player.lastCombatAt = ctx.state.time.minutes;
}

function land(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  itemId: string,
  x: number,
  y: number,
): void {
  const st = weaponStats(ctx.content, { uid: '', itemId, qty: 1 });
  if (st?.kind !== 'throwable') return;
  if (st.effect === 'decoy') {
    zone.hazards.push({
      id: `h${zone.nextId++}`,
      kind: 'decoy',
      x,
      y,
      radius: st.radius,
      ttl: st.durationSec,
      ttl0: st.durationSec,
      dps: 0,
      byPlayer: true,
      itemId,
      pulseIn: 0,
      noise: st.noise,
    });
    return;
  }
  if (st.effect === 'smoke') {
    zone.hazards.push({
      id: `h${zone.nextId++}`,
      kind: 'smoke',
      x,
      y,
      radius: st.radius,
      ttl: st.durationSec,
      ttl0: st.durationSec,
      dps: 0,
      byPlayer: true,
      itemId,
      pulseIn: 0,
    });
    ctx.bus.emit('sfx:play', { key: 'smoke', x, y });
    emitNoise(ctx, zone, x, y, st.noise, 'smoke', true);
    // Zombies inside the cloud lose you at once.
    for (const z of zone.zombies) if (Math.hypot(z.x - x, z.y - y) < st.radius) loseTrack(z);
    return;
  }
  if (st.effect === 'flash') {
    flashbang(ctx, zone, rt, x, y, st.radius, st.durationSec, st.noise);
    return;
  }
  if (st.effect === 'noise') {
    zone.decals.push({ x, y, kind: 'glass', rot: ctx.rng.range(0, 6.28), scale: 1 });
    ctx.bus.emit('sfx:play', { key: 'glass_smash', x, y });
    emitNoise(ctx, zone, x, y, st.noise, 'bottle', true);
  } else if (st.effect === 'fire') {
    zone.hazards.push({
      id: `h${zone.nextId++}`,
      kind: 'fire',
      x,
      y,
      radius: st.radius,
      ttl: st.durationSec,
      dps: st.damage,
      byPlayer: true,
      pulseIn: 0,
    });
    zone.decals.push({ x, y, kind: 'scorch', rot: 0, scale: st.radius / 2 });
    ctx.bus.emit('sfx:play', { key: 'molotov', x, y });
    emitNoise(ctx, zone, x, y, st.noise, 'fire', true);
  } else {
    zone.hazards.push({
      id: `h${zone.nextId++}`,
      kind: 'fuse',
      x,
      y,
      radius: st.radius,
      ttl: st.fuseMs / 1000,
      dps: st.damage,
      byPlayer: true,
      itemId,
      pulseIn: 0,
    });
  }
}

function explode(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, h: Hazard): void {
  const p = zone.player;
  ctx.bus.emit('sfx:play', { key: 'explosion', x: h.x, y: h.y, volume: 1 });
  ctx.bus.emit('fx:explosion', { x: h.x, y: h.y, radius: h.radius });
  ctx.bus.emit('fx:shake', { intensity: 0.02, durationMs: 400 });
  emitNoise(ctx, zone, h.x, h.y, BALANCE.noise.pipeBomb, 'explosion', true);
  zone.decals.push({ x: h.x, y: h.y, kind: 'scorch', rot: 0, scale: h.radius / 1.5 });
  for (const z of [...zone.zombies]) {
    const d = Math.hypot(z.x - h.x, z.y - h.y);
    if (d > h.radius || !lineOfSight(rt, h.x, h.y, z.x, z.y)) continue;
    damageZombie(ctx, zone, z, h.dps * (1 - (d / h.radius) * 0.6), {
      angle: Math.atan2(z.y - h.y, z.x - h.x),
      knockback: 1.6,
      staggerChance: 1,
      crit: false,
      weaponId: h.itemId,
    });
  }
  const dp = Math.hypot(p.x - h.x, p.y - h.y);
  if (dp < h.radius && lineOfSight(rt, h.x, h.y, p.x, p.y)) {
    damagePlayer(ctx, h.dps * 0.5 * (1 - dp / h.radius), 'explosion');
    p.hurtFlash = 0.3;
  }
}

/** Thrown objects in flight and burning/poison/fused hazards. */
export function updateProjectiles(ctx: GameContext, zone: ZoneState, rt: ZoneRuntime, dt: number): void {
  for (const t of zone.thrown) {
    t.t += dt;
    if (t.t >= t.duration) land(ctx, zone, rt, t.itemId, t.x1, t.y1);
  }
  zone.thrown = zone.thrown.filter((t) => t.t < t.duration);
  const p = zone.player;
  for (const h of zone.hazards) {
    h.ttl -= dt;
    if (h.kind === 'decoy') {
      h.pulseIn -= dt;
      if (h.pulseIn <= 0) {
        h.pulseIn = 0.8;
        ctx.bus.emit('sfx:play', { key: 'decoy', x: h.x, y: h.y, volume: 0.7 });
        emitNoise(ctx, zone, h.x, h.y, h.noise ?? 12, 'decoy', false);
      }
      continue;
    }
    if (h.kind === 'smoke') continue;
    if (h.kind === 'fuse') {
      h.pulseIn -= dt;
      if (h.pulseIn <= 0) {
        h.pulseIn = 0.5;
        ctx.bus.emit('sfx:play', { key: 'beep', x: h.x, y: h.y, volume: 0.6 });
        emitNoise(ctx, zone, h.x, h.y, 10, 'beep', true);
      }
      if (h.ttl <= 0) explode(ctx, zone, rt, h);
      continue;
    }
    if (h.kind === 'fire') {
      for (const z of [...zone.zombies]) {
        if (Math.hypot(z.x - h.x, z.y - h.y) > h.radius) continue;
        damageZombie(ctx, zone, z, h.dps * dt, {
          angle: 0,
          knockback: 0,
          staggerChance: 0,
          crit: false,
          weaponId: 'molotov',
          silent: true,
        });
      }
    }
    if (Math.hypot(p.x - h.x, p.y - h.y) <= h.radius) {
      h.pulseIn -= dt;
      if (h.pulseIn <= 0) {
        h.pulseIn = 0.5;
        damagePlayer(ctx, h.dps * 0.5 * (h.kind === 'fire' ? 0.6 : 1), h.kind === 'gas' ? 'gas' : 'fire');
        p.hurtFlash = 0.2;
      }
    }
  }
  zone.hazards = zone.hazards.filter((h) => h.ttl > 0);
  for (const tr of zone.tracers) tr.ttl -= dt;
  zone.tracers = zone.tracers.filter((tr) => tr.ttl > 0);
  if (zone.decals.length > BALANCE.combat.bloodDecalCap)
    zone.decals.splice(0, zone.decals.length - BALANCE.combat.bloodDecalCap);
}

/** A zombie that can't see you any more stops homing in and goes to search where it last saw you. */
function loseTrack(z: Zombie): void {
  if (z.mode !== 'chase' && z.mode !== 'attack') return;
  z.mode = 'search';
  z.modeTime = 0;
  z.windup = 0;
  z.path = null;
}

/** Stun every zombie near (x, y) that has line of sight to the blast. Bosses shrug most of it off. */
export function flashbang(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  x: number,
  y: number,
  radius: number,
  seconds: number,
  noise: number,
): void {
  ctx.bus.emit('sfx:play', { key: 'flashbang', x, y, volume: 1 });
  ctx.bus.emit('fx:flashbang', { x, y, radius });
  ctx.bus.emit('fx:shake', { intensity: 0.008, durationMs: 220 });
  emitNoise(ctx, zone, x, y, noise, 'flashbang', true);
  for (const z of zone.zombies) {
    if (z.hp <= 0 || Math.hypot(z.x - x, z.y - y) > radius || !lineOfSight(rt, x, y, z.x, z.y)) continue;
    const resist = enemyDef(ctx, z).staggerResist;
    z.stagger = Math.max(z.stagger, seconds * (1 - resist * 0.7));
    z.windup = 0;
    z.hitFlash = 0.2;
    loseTrack(z);
  }
}

// ---------------------------------------------------------------- per-frame

export function updateCombat(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  input: PlayerInput,
  dt: number,
): void {
  const p = zone.player;
  const pl = ctx.state.player;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.shoveCooldown = Math.max(0, p.shoveCooldown - dt);

  // Quick-slot items work everywhere, including the safe hub.
  if (input.quick !== null) {
    const uid = pl.quickSlots[input.quick];
    if (uid && findStack(ctx, uid)) {
      const msg = useItem(ctx, uid);
      if (msg) ctx.bus.emit('ui:toast', { text: msg, kind: 'info' });
    }
  }

  // Weapon selection (cancels reloads and swings).
  if (input.slot || input.wheel) {
    const before = pl.activeSlot;
    if (input.slot) selectSlot(ctx, input.slot);
    else cycleSlot(ctx, input.wheel > 0 ? 1 : -1);
    if (pl.activeSlot !== before && p.action && p.action.kind !== 'timed') p.action = null;
  }

  // Progress the current action.
  const a = p.action;
  if (a?.kind === 'melee') {
    a.t += dt;
    if (a.phase === 'windup' && a.t >= a.windup) {
      strike(ctx, zone, rt, a.uid, a.angle);
      a.phase = 'recovery';
      a.t = 0;
    } else if (a.phase === 'recovery' && a.t >= a.recovery) p.action = null;
  } else if (a?.kind === 'reload') {
    const s = findStack(ctx, a.uid);
    const st = s ? weaponStats(ctx.content, s) : null;
    if (!s || st?.kind !== 'firearm' || activeWeapon(ctx)?.uid !== s.uid) p.action = null;
    else {
      a.t += dt;
      if (a.t >= a.duration) {
        p.action = null;
        finishReload(ctx, zone, s, st);
      }
    }
  }

  if (zone.safe || pl.dead) return; // weapons stay holstered in the hub

  if (input.shovePressed && !p.action) shove(ctx, zone);

  const throwable = equippedIn(ctx, 'throwable');
  if (input.throwPressed && throwable) {
    const st = weaponStats(ctx.content, throwable);
    if (st?.kind === 'throwable') throwItem(ctx, zone, rt, throwable, st, input.aimX, input.aimY);
  }

  const w = activeWeapon(ctx);
  const slot = pl.activeSlot;
  if (slot === 'throwable') {
    if (input.attackPressed && w) {
      const st = weaponStats(ctx.content, w);
      if (st?.kind === 'throwable') throwItem(ctx, zone, rt, w, st, input.aimX, input.aimY);
    }
    return;
  }
  const st = w ? weaponStats(ctx.content, w) : null;
  if (st?.kind === 'firearm' && w) {
    if (input.reloadPressed) startReload(ctx, zone, w, st);
    if (input.attackPressed || (st.fireIntervalMs < 200 && input.attack)) fire(ctx, zone, rt, w, st);
    return;
  }
  if (slot === 'firearm1' || slot === 'firearm2') {
    if (input.attackPressed) ctx.bus.emit('ui:toast', { text: 'No firearm in this slot.', kind: 'info' });
    return;
  }
  // Melee or fists: hold to keep swinging.
  if ((input.attackPressed || input.attack) && !p.action) startMelee(ctx, zone, w);
}
