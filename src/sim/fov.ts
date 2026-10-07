/**
 * Field of view. Recursive shadowcasting (8 octants) on the tile grid finds what is in line of sight; a
 * second pass applies the brief's vision rules: a ~140° cone toward the aim at full radius, a reduced
 * radius behind, the flashlight cone, and lit tiles (lamps, fires) that stay visible further out.
 */
import { BALANCE } from '@/config/balance';
import { darkness } from '@/core/time';
import type { GameContext } from '@/core/store';
import { inBounds, type ZoneRuntime } from './runtime';
import type { ZoneState } from './types';

const OCTANTS: [number, number, number, number][] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

type Visit = (x: number, y: number) => void;
type Opaque = (x: number, y: number) => boolean;

function castLight(
  cx: number,
  cy: number,
  row: number,
  startIn: number,
  end: number,
  radius: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  opaque: Opaque,
  visit: Visit,
): void {
  let start = startIn;
  if (start < end) return;
  const r2 = (radius + 0.5) * (radius + 0.5);
  let newStart = 0;
  for (let j = row; j <= radius; j++) {
    let dx = -j - 1;
    const dy = -j;
    let blocked = false;
    while (dx <= 0) {
      dx += 1;
      const X = cx + dx * xx + dy * xy;
      const Y = cy + dx * yx + dy * yy;
      const lSlope = (dx - 0.5) / (dy + 0.5);
      const rSlope = (dx + 0.5) / (dy - 0.5);
      if (start < rSlope) continue;
      if (end > lSlope) break;
      if (dx * dx + dy * dy < r2) visit(X, Y);
      if (blocked) {
        if (opaque(X, Y)) {
          newStart = rSlope;
          continue;
        }
        blocked = false;
        start = newStart;
      } else if (opaque(X, Y) && j < radius) {
        blocked = true;
        castLight(cx, cy, j + 1, start, lSlope, radius, xx, xy, yx, yy, opaque, visit);
        newStart = rSlope;
      }
    }
    if (blocked) break;
  }
}

/** Calls `visit` for every tile within `radius` that has line of sight to (ox, oy). */
export function shadowcast(ox: number, oy: number, radius: number, opaque: Opaque, visit: Visit): void {
  visit(ox, oy);
  for (const [xx, xy, yx, yy] of OCTANTS) castLight(ox, oy, 1, 1, 0, radius, xx, xy, yx, yy, opaque, visit);
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Static light from lamps and fires, occluded by walls. Recomputed when doors or blockers change. */
export function ensureStaticLight(rt: ZoneRuntime): void {
  if (!rt.lightDirty) return;
  rt.lightDirty = false;
  rt.staticLight.fill(0);
  const opaque: Opaque = (x, y) => !inBounds(rt, x, y) || rt.opaque[y * rt.w + x] === 1;
  for (const l of rt.layout.lights) {
    const lx = Math.floor(l.x);
    const ly = Math.floor(l.y);
    const r = l.radius;
    shadowcast(lx, ly, Math.ceil(r), opaque, (x, y) => {
      if (!inBounds(rt, x, y)) return;
      const d = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
      const v = Math.max(0, 1 - d / r);
      const i = y * rt.w + x;
      rt.staticLight[i] = Math.min(1.2, rt.staticLight[i]! + v * 1.1);
    });
  }
}

/** Darkness 0..1 for this zone right now (time of day, or the zone's own indoor darkness). */
export function zoneDarkness(ctx: GameContext, rt: ZoneRuntime): number {
  return Math.max(darkness(ctx.state.time.minutes), rt.def.indoorDarkness);
}

export function visionRadius(dark: number): number {
  const v = BALANCE.vision;
  return v.playerRadiusDay + (v.playerRadiusNight - v.playerRadiusDay) * dark;
}

export interface DynamicLight {
  x: number;
  y: number;
  radius: number;
}

/** Recompute `rt.visible` / `rt.bright` and mark explored tiles. Skips work when nothing relevant changed. */
export function updatePlayerFov(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  dynamicLights: DynamicLight[] = [],
  force = false,
): void {
  const p = zone.player;
  const v = BALANCE.vision;
  const dark = zoneDarkness(ctx, rt);
  const flash = ctx.state.player.flashlightOn;
  const key = `${Math.floor(p.x * 2)},${Math.floor(p.y * 2)},${Math.round(p.facing * 45)},${flash ? 1 : 0},${Math.round(dark * 20)},${rt.version},${dynamicLights.length}`;
  if (!force && key === rt.fovKey && dynamicLights.length === 0) return;
  rt.fovKey = key;
  ensureStaticLight(rt);

  const baseR = visionRadius(dark);
  const rearR = Math.max(1.6, baseR * v.rearRadiusFactor);
  const flashR = baseR + v.flashlightBonus;
  const coneHalf = (v.coneDeg / 2) * (Math.PI / 180);
  const flashHalf = (v.flashlightConeDeg / 2) * (Math.PI / 180);
  const maxR = Math.ceil(Math.max(baseR, flash ? flashR : 0, 18));
  const { visible, bright } = rt;
  visible.fill(0);
  bright.fill(0);
  const opaque: Opaque = (x, y) => !inBounds(rt, x, y) || rt.opaque[y * rt.w + x] === 1;
  shadowcast(Math.floor(p.x), Math.floor(p.y), maxR, opaque, (x, y) => {
    if (!inBounds(rt, x, y)) return;
    const i = y * rt.w + x;
    const dx = x + 0.5 - p.x;
    const dy = y + 0.5 - p.y;
    const d = Math.hypot(dx, dy);
    const ang = angleDiff(Math.atan2(dy, dx), p.facing);
    const radius = ang <= coneHalf ? baseR : rearR;
    let b = 0;
    if (d <= 1.6) b = 1;
    else if (d <= radius) b = d < radius * 0.55 ? 1 : 1 - ((d - radius * 0.55) / (radius * 0.45)) * 0.72;
    if (flash && ang <= flashHalf && d <= flashR) b = Math.max(b, 0.95 - (d / flashR) * 0.55);
    let lit = rt.staticLight[i]!;
    for (const l of dynamicLights) {
      const ld = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y);
      if (ld < l.radius) lit += 1 - ld / l.radius;
    }
    if (lit > 0.08) b = Math.max(b, Math.min(1, 0.25 + lit));
    if (b > 0.04) {
      visible[i] = 1;
      bright[i] = b;
      zone.explored[i] = 1;
    }
  });
}

/** Is the tile under (x, y) visible to the player this frame? */
export function isVisible(rt: ZoneRuntime, x: number, y: number): boolean {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return inBounds(rt, tx, ty) && rt.visible[ty * rt.w + tx] === 1;
}

/** Presentation-only reveal for scripted camera pans: light up what can be seen from a point. */
export function revealAround(rt: ZoneRuntime, x: number, y: number, radius: number): void {
  const opaque: Opaque = (tx, ty) => !inBounds(rt, tx, ty) || rt.opaque[ty * rt.w + tx] === 1;
  shadowcast(Math.floor(x), Math.floor(y), Math.ceil(radius), opaque, (tx, ty) => {
    if (!inBounds(rt, tx, ty)) return;
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
    if (d > radius) return;
    const i = ty * rt.w + tx;
    rt.visible[i] = 1;
    rt.bright[i] = Math.max(rt.bright[i]!, 1 - (d / radius) * 0.6);
  });
  rt.fovKey = '';
}
