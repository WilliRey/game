/**
 * Turns a ZoneDef (ASCII map + legend + objects) into a static ZoneLayout: tile codes plus every placed
 * thing with its parameters. Pure and cached per zone id. Anything that changes during play lives in
 * ZoneState instead; the layout is what a Tiled importer would also have to produce.
 */
import type { Content } from '@/content';
import type { LegendEntryT, ZoneDef, ZoneObjectT } from '@/content/schemas';
import { zoneLegend } from '@/content/validate';
import { TILE_CODE } from './tiles';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutContainer extends Rect {
  id: string;
  type: string;
  lootTable?: string;
  items?: { itemId: string; qty: number }[];
  locked?: boolean;
  keyId?: string;
  alarm?: boolean;
  label?: string;
}

export interface LayoutDoor {
  id: string;
  x: number;
  y: number;
  open: boolean;
  locked: boolean;
  keyId?: string;
  hp?: number;
  /** True when the door sits in a wall running north–south (drawn rotated). */
  vertical: boolean;
}

export interface LayoutStation extends Rect {
  id: string;
  kind: string;
  tier?: number;
}

export interface LayoutLight {
  x: number;
  y: number;
  radius: number;
  color: number;
  flicker: boolean;
}

export interface LayoutExit extends Rect {
  id: string;
  nodeId?: string;
  toZone?: string;
  entry?: string;
  label?: string;
}

export interface ZoneLayout {
  zoneId: string;
  w: number;
  h: number;
  tiles: number[];
  containers: LayoutContainer[];
  doors: LayoutDoor[];
  stations: LayoutStation[];
  lights: LayoutLight[];
  spawnPoints: { x: number; y: number }[];
  starts: Record<string, { x: number; y: number }>;
  exits: LayoutExit[];
  /** Objects that keep their definition: npc, pickup, trigger, nest, spawn, label, blocker, interact, siphon. */
  objects: ZoneObjectT[];
}

const cache = new WeakMap<Content, Map<string, ZoneLayout>>();

export function getLayout(content: Content, zoneId: string): ZoneLayout {
  let perContent = cache.get(content);
  if (!perContent) {
    perContent = new Map();
    cache.set(content, perContent);
  }
  let layout = perContent.get(zoneId);
  if (!layout) {
    const def = content.zones[zoneId];
    if (!def) throw new Error(`Unknown zone '${zoneId}'`);
    layout = parseZone(content, def);
    perContent.set(zoneId, layout);
  }
  return layout;
}

function parseColor(c: string | undefined, fallback: number): number {
  if (!c) return fallback;
  const n = Number.parseInt(c.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
}

/** Flood-fill same-char clusters so multi-tile props become one thing. */
function clusters(map: string[], chars: (ch: string) => boolean): { ch: string; rect: Rect }[] {
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const seen = new Uint8Array(w * h);
  const out: { ch: string; rect: Rect }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = map[y]![x]!;
      if (seen[y * w + x] || !chars(ch)) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        minX = Math.min(minX, cx!);
        maxX = Math.max(maxX, cx!);
        minY = Math.min(minY, cy!);
        maxY = Math.max(maxY, cy!);
        for (const [nx, ny] of [
          [cx! + 1, cy!],
          [cx! - 1, cy!],
          [cx!, cy! + 1],
          [cx!, cy! - 1],
        ] as const) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) continue;
          if (map[ny]![nx] !== ch) continue;
          seen[ny * w + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      out.push({ ch, rect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } });
    }
  }
  return out;
}

function overlaps(a: Rect, x: number, y: number): boolean {
  return x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h;
}

export function parseZone(content: Content, def: ZoneDef): ZoneLayout {
  const legend: Record<string, LegendEntryT> = zoneLegend(content, def);
  const map = def.map;
  const h = map.length;
  const w = map[0]?.length ?? 0;
  const tiles = new Array<number>(w * h).fill(TILE_CODE.void);
  const doors: LayoutDoor[] = [];
  const spawnPoints: { x: number; y: number }[] = [];
  const starts: Record<string, { x: number; y: number }> = {};
  const lights: LayoutLight[] = [];
  const isWallish = (x: number, y: number) => {
    const t = legend[map[y]?.[x] ?? '#']?.tile ?? 'wall';
    return t === 'wall' || t === 'window' || t === 'void';
  };

  for (let y = 0; y < h; y++) {
    const row = map[y]!;
    for (let x = 0; x < w; x++) {
      const le = legend[row[x]!];
      if (!le) continue;
      tiles[y * w + x] = TILE_CODE[le.tile];
      if (le.tile === 'door' || le.tile === 'lockedDoor') {
        doors.push({
          id: `d_${x}_${y}`,
          x,
          y,
          open: !!le.open,
          locked: le.tile === 'lockedDoor',
          vertical: isWallish(x, y - 1) && isWallish(x, y + 1),
        });
      }
      if (le.spawn) spawnPoints.push({ x: x + 0.5, y: y + 0.5 });
      if (le.start && !starts.default) starts.default = { x: x + 0.5, y: y + 0.5 };
      if (le.light) {
        const fire = le.station === 'campfire';
        lights.push({
          x: x + 0.5,
          y: y + 0.5,
          radius: fire ? 6 : 5,
          color: fire ? 0xff8a30 : 0xffb060,
          flicker: fire,
        });
      }
    }
  }

  const containers: LayoutContainer[] = clusters(map, (ch) => !!legend[ch]?.container).map(
    ({ ch, rect }) => ({
      id: `c_${rect.x}_${rect.y}`,
      type: legend[ch]!.container!,
      ...rect,
    }),
  );
  const stations: LayoutStation[] = clusters(map, (ch) => !!legend[ch]?.station).map(({ ch, rect }) => ({
    id: `s_${rect.x}_${rect.y}`,
    kind: legend[ch]!.station!,
    ...rect,
  }));
  const exits: LayoutExit[] = clusters(map, (ch) => !!legend[ch]?.exit).map(({ rect }) => ({
    id: `x_${rect.x}_${rect.y}`,
    nodeId: def.exitNode,
    ...rect,
  }));

  const objects: ZoneObjectT[] = [];
  for (const o of def.objects) {
    switch (o.type) {
      case 'door': {
        const d = doors.find((dd) => dd.x === o.x && dd.y === o.y);
        if (!d) throw new Error(`zone ${def.id}: door object ${o.id} is not on a door tile`);
        d.id = o.id;
        if (o.locked !== undefined) d.locked = o.locked;
        if (o.keyId) d.keyId = o.keyId;
        if (o.hp) d.hp = o.hp;
        break;
      }
      case 'container': {
        const existing = containers.findIndex((c) => overlaps(c, o.x, o.y));
        const base = existing >= 0 ? containers[existing]! : undefined;
        const c: LayoutContainer = {
          id: o.id,
          type: o.containerType ?? base?.type ?? 'crate',
          x: base?.x ?? o.x,
          y: base?.y ?? o.y,
          w: base?.w ?? o.w,
          h: base?.h ?? o.h,
          lootTable: o.lootTable,
          items: o.items?.map((i) => ({ itemId: i.itemId, qty: i.qty })),
          locked: o.locked,
          keyId: o.keyId,
          alarm: o.alarm,
          label: o.label,
        };
        if (existing >= 0) containers[existing] = c;
        else containers.push(c);
        break;
      }
      case 'station': {
        const existing = stations.findIndex((s) => overlaps(s, o.x, o.y));
        const s: LayoutStation =
          existing >= 0
            ? { ...stations[existing]! }
            : { id: o.id, kind: o.station ?? 'workbench', x: o.x, y: o.y, w: o.w, h: o.h };
        s.id = o.id;
        if (o.station) s.kind = o.station;
        if (o.tier !== undefined) s.tier = o.tier;
        if (existing >= 0) stations[existing] = s;
        else stations.push(s);
        break;
      }
      case 'start':
        starts[o.id] = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
        if (!starts.default) starts.default = starts[o.id]!;
        break;
      case 'exit': {
        const existing = exits.findIndex((e) => overlaps(e, o.x, o.y));
        const e: LayoutExit = {
          id: o.id,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
          nodeId: o.toZone ? undefined : (o.nodeId ?? def.exitNode),
          toZone: o.toZone,
          entry: o.entry,
          label: o.label,
        };
        if (existing >= 0)
          exits[existing] = {
            ...e,
            x: exits[existing]!.x,
            y: exits[existing]!.y,
            w: exits[existing]!.w,
            h: exits[existing]!.h,
          };
        else exits.push(e);
        break;
      }
      case 'light':
        lights.push({
          x: o.x + 0.5,
          y: o.y + 0.5,
          radius: o.radius ?? 5,
          color: parseColor(o.color, 0xffa040),
          flicker: !!o.flicker,
        });
        break;
      case 'spawn':
        spawnPoints.push({ x: o.x + 0.5, y: o.y + 0.5 });
        objects.push(o);
        break;
      default:
        objects.push(o);
    }
  }
  return {
    zoneId: def.id,
    w,
    h,
    tiles,
    containers,
    doors,
    stations,
    lights,
    spawnPoints,
    starts,
    exits,
    objects,
  };
}
