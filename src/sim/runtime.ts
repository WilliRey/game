/**
 * Derived, rebuildable data for the active zone: movement/sight grids, lookups and FOV buffers. Never
 * saved. One runtime per ZoneState object (a loaded save gets a fresh one).
 */
import type { Content } from '@/content';
import type { ZoneDef } from '@/content/schemas';
import { getLayout, type ZoneLayout } from './layout';
import { TILE_KINDS, TILE_PROPS } from './tiles';
import type { ZoneState } from './types';

export interface ZoneRuntime {
  zone: ZoneState;
  layout: ZoneLayout;
  def: ZoneDef;
  w: number;
  h: number;
  /** 1 = blocks movement. */
  solid: Uint8Array;
  /** 1 = blocks sight and bullets. */
  opaque: Uint8Array;
  /** Footstep noise multiplier per tile. */
  noiseMul: Float32Array;
  /** Tile index → door id. */
  doorAt: Map<number, string>;
  /** Tile index → container id. */
  containerAt: Map<number, string>;
  /** Tile index → station id. */
  stationAt: Map<number, string>;
  /** Tile index → object id (blockers and solid interactables). */
  objectAt: Map<number, string>;
  /** Static light from lamps and fires, with occlusion (0..1+). */
  staticLight: Float32Array;
  lightDirty: boolean;
  /** FOV results for the current frame. */
  visible: Uint8Array;
  /** Brightness 0..1 per tile for the fog renderer. */
  bright: Float32Array;
  /** Bumped whenever grids change (doors, blockers) so renderers and caches can refresh. */
  version: number;
  fovKey: string;
}

const runtimes = new WeakMap<ZoneState, ZoneRuntime>();

export function getRuntime(content: Content, zone: ZoneState): ZoneRuntime {
  let rt = runtimes.get(zone);
  if (!rt) {
    rt = createRuntime(content, zone);
    runtimes.set(zone, rt);
  }
  return rt;
}

function createRuntime(content: Content, zone: ZoneState): ZoneRuntime {
  const layout = getLayout(content, zone.zoneId);
  const def = content.zones[zone.zoneId]!;
  const n = zone.w * zone.h;
  const rt: ZoneRuntime = {
    zone,
    layout,
    def,
    w: zone.w,
    h: zone.h,
    solid: new Uint8Array(n),
    opaque: new Uint8Array(n),
    noiseMul: new Float32Array(n),
    doorAt: new Map(),
    containerAt: new Map(),
    stationAt: new Map(),
    objectAt: new Map(),
    staticLight: new Float32Array(n),
    lightDirty: true,
    visible: new Uint8Array(n),
    bright: new Float32Array(n),
    version: 0,
    fovKey: '',
  };
  rebuildGrids(rt, content);
  return rt;
}

/** Recompute solid/opaque flags from tiles plus everything placed on them. */
export function rebuildGrids(rt: ZoneRuntime, content: Content): void {
  const { zone, layout, w } = rt;
  rt.doorAt.clear();
  rt.containerAt.clear();
  rt.stationAt.clear();
  rt.objectAt.clear();
  for (let i = 0; i < zone.tiles.length; i++) {
    const p = TILE_PROPS[TILE_KINDS[zone.tiles[i]!] ?? 'void'];
    rt.solid[i] = p.solid ? 1 : 0;
    rt.opaque[i] = p.opaque ? 1 : 0;
    rt.noiseMul[i] = p.noise;
  }
  for (const d of Object.values(zone.doors)) {
    const i = d.y * w + d.x;
    rt.doorAt.set(i, d.id);
    const closed = !d.open && !d.broken;
    rt.solid[i] = closed ? 1 : 0;
    rt.opaque[i] = closed ? 1 : 0;
  }
  for (const c of Object.values(zone.containers)) {
    const def = content.containerTypes[c.type];
    forRect(c, w, (i) => {
      rt.containerAt.set(i, c.id);
      if (def?.blocksMovement ?? true) rt.solid[i] = 1;
      if (def?.blocksSight) rt.opaque[i] = 1;
    });
  }
  for (const s of layout.stations) {
    forRect(s, w, (i) => {
      rt.stationAt.set(i, s.id);
      rt.solid[i] = 1;
    });
  }
  for (const o of layout.objects) {
    if (o.type === 'blocker' && !zone.objects[o.id]?.removed) {
      forRect(o, w, (i) => {
        rt.objectAt.set(i, o.id);
        rt.solid[i] = 1;
        rt.opaque[i] = 1;
      });
    } else if ((o.type === 'interact' || o.type === 'siphon') && o.solid) {
      forRect(o, w, (i) => {
        rt.objectAt.set(i, o.id);
        rt.solid[i] = 1;
      });
    }
  }
  rt.lightDirty = true;
  rt.version++;
  rt.fovKey = '';
}

function forRect(
  r: { x: number; y: number; w: number; h: number },
  w: number,
  fn: (i: number) => void,
): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) fn(y * w + x);
}

export function inBounds(rt: ZoneRuntime, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < rt.w && y < rt.h;
}
export function isSolid(rt: ZoneRuntime, x: number, y: number): boolean {
  return !inBounds(rt, x, y) || rt.solid[y * rt.w + x] === 1;
}
export function isOpaque(rt: ZoneRuntime, x: number, y: number): boolean {
  return !inBounds(rt, x, y) || rt.opaque[y * rt.w + x] === 1;
}

export interface RayHit {
  /** True when the ray was stopped before reaching its end. */
  hit: boolean;
  /** Where the ray stopped (end point if not hit). */
  x: number;
  y: number;
  /** Blocking tile, if hit. */
  tx: number;
  ty: number;
}

/**
 * Grid traversal (Amanatides–Woo) from (x0,y0) to (x1,y1). `blocks(i)` decides which tiles stop the ray.
 * The starting tile never blocks.
 */
export function raycast(
  rt: ZoneRuntime,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  blocks: (i: number) => boolean,
): RayHit {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tx = Math.floor(x0);
  let ty = Math.floor(y0);
  const endX = Math.floor(x1);
  const endY = Math.floor(y1);
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) * tDeltaY : Infinity;
  let t = 0;
  for (let guard = 0; guard < 512; guard++) {
    if (tx === endX && ty === endY) break;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if (t > 1) break;
    if (!inBounds(rt, tx, ty) || blocks(ty * rt.w + tx)) {
      return { hit: true, x: x0 + dx * t, y: y0 + dy * t, tx, ty };
    }
  }
  return { hit: false, x: x1, y: y1, tx: endX, ty: endY };
}

/** True when nothing opaque lies between the two points. */
export function lineOfSight(rt: ZoneRuntime, x0: number, y0: number, x1: number, y1: number): boolean {
  return !raycast(rt, x0, y0, x1, y1, (i) => rt.opaque[i] === 1).hit;
}
