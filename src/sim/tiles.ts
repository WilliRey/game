import { TILE_KIND_LIST, type TileKind } from '@/content/schemas';

/** Tile codes are indices into this list; zone grids store codes. */
export const TILE_KINDS: readonly TileKind[] = TILE_KIND_LIST;
export const TILE_CODE: Record<TileKind, number> = Object.fromEntries(
  TILE_KINDS.map((k, i) => [k, i]),
) as Record<TileKind, number>;

export interface TileProps {
  /** Blocks movement (doors are decided by their state, not this table). */
  solid: boolean;
  /** Blocks line of sight and bullets. */
  opaque: boolean;
  /** Footstep noise multiplier. */
  noise: number;
}

const P = (solid: boolean, opaque: boolean, noise = 1): TileProps => ({ solid, opaque, noise });

export const TILE_PROPS: Record<TileKind, TileProps> = {
  void: P(true, true),
  wall: P(true, true),
  floor: P(false, false),
  glass: P(false, false, 1.8),
  door: P(false, false),
  lockedDoor: P(false, false),
  window: P(true, false),
  rubble: P(false, false, 1.3),
  road: P(false, false),
  grass: P(false, false, 0.8),
  water: P(true, false),
  counter: P(true, false),
  tile: P(false, false, 1.1),
  carpet: P(false, false, 0.7),
  concrete: P(false, false),
  dirt: P(false, false, 0.9),
  fence: P(true, false),
  tree: P(true, true),
  bush: P(false, true, 1.2),
  stairs: P(false, false),
};

export function tileKindAt(tiles: readonly number[], w: number, x: number, y: number): TileKind {
  return TILE_KINDS[tiles[y * w + x] ?? 0] ?? 'void';
}

export function isDoorKind(kind: TileKind): boolean {
  return kind === 'door' || kind === 'lockedDoor';
}

/** Floors that read as "outdoors" for art and ambient light. */
export const OUTDOOR_KINDS: ReadonlySet<TileKind> = new Set<TileKind>([
  'road',
  'grass',
  'dirt',
  'concrete',
  'water',
]);
