/**
 * Every texture the game draws is referenced through these keys. At boot, `placeholders.ts` generates a
 * procedural texture for each key that isn't already loaded, so dropping in a real sprite is a matter of
 * loading an image under the same key in `BootScene.preload` (see docs/CONTENT_GUIDE.md).
 */
import type { TileKind } from '@/content/schemas';

export const TILE_SIZE = 32;
export const TILE_VARIANTS = 4;

export const ART = {
  tile: (kind: TileKind, variant: number) => `tile.${kind}.${variant % TILE_VARIANTS}`,
  player: 'actor.player',
  zombie: (type: string) => `actor.zombie.${type}`,
  npc: 'actor.npc',
  corpse: (type: string) => `decal.corpse.${type}`,
  container: (type: string) => `container.${type}`,
  station: (kind: string) => `station.${kind}`,
  door: (state: 'closed' | 'open' | 'broken' | 'locked') => `door.${state}`,
  item: (category: string) => `item.${category}`,
  thrown: (itemId: string) => `thrown.${itemId}`,
  blood: (variant: number) => `decal.blood.${variant % 4}`,
  glassDecal: 'decal.glass',
  scorch: 'decal.scorch',
  light: 'fx.light',
  muzzle: 'fx.muzzle',
  gas: 'fx.gas',
  fire: 'fx.fire',
  spark: 'fx.spark',
  ping: 'fx.ping',
  marker: 'fx.marker',
  ring: 'fx.ring',
  vehicle: 'prop.ambulance',
  blocker: 'prop.chain_door',
  siphon: 'prop.fuel_cap',
  exit: 'prop.exit',
  lamp: 'prop.lamp',
  interact: 'prop.interact',
  skyline: 'title.skyline',
} as const;

export const ZOMBIE_TYPES = ['walker', 'runner', 'bloater', 'bloater_boss', 'screamer'];
export const CONTAINER_TYPES = [
  'fridge',
  'cabinet',
  'medicine_cabinet',
  'toolbox',
  'desk',
  'locker',
  'car_trunk',
  'dumpster',
  'corpse',
  'shelf',
  'crate',
  'wardrobe',
  'register',
  'pharmacy_shelf',
  'gun_locker',
  'hospital_cart',
];
export const STATION_KINDS = [
  'workbench',
  'stove',
  'reloading',
  'stash',
  'bed',
  'rainCollector',
  'campfire',
  'radio',
];
export const ITEM_ICON_CATEGORIES = [
  'food',
  'drink',
  'medical',
  'material',
  'tool',
  'ammo',
  'weapon',
  'mod',
  'armor',
  'backpack',
  'blueprint',
  'note',
  'quest',
  'throwable',
  'fuel',
  'junk',
];
export const THROWN_ITEMS = ['glass_bottle', 'molotov', 'pipe_bomb'];
