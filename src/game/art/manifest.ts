/**
 * Every model and texture the renderer draws is referenced through these keys. `assets.ts` returns a
 * loaded real asset for a key when one is listed in its overrides, otherwise the procedural placeholder
 * from `models.ts` / `textures.ts` (see docs/CONTENT_GUIDE.md, "Replacing placeholder art").
 */
import type { BodyStyle } from './models';

export const MODELS = {
  /** Character part sets: player and NPCs use 'survivor'; zombies use their type. */
  body: (style: BodyStyle | string) => `model.body.${style}`,
  weapon: (itemId: string) => `model.weapon.${itemId}`,
  flashlight: 'model.flashlight',
  container: (type: string) => `container.${type}`,
  station: (kind: string) => `station.${kind}`,
  door: 'model.door',
  doorLocked: 'model.door.locked',
  doorBroken: 'model.door.broken',
  vehicle: 'prop.vehicle',
  blocker: 'prop.blocker',
  siphon: 'prop.siphon',
  board: 'prop.board',
  interact: 'prop.interact',
  lampPost: 'prop.lampPost',
  lampHanging: 'prop.lampHanging',
  exit: 'prop.exit',
  item: (category: string) => `model.item.${category}`,
  corpse: (type: string) => `model.corpse.${type}`,
  thrown: (itemId: string) => `model.thrown.${itemId}`,
} as const;

export const TEXTURES = {
  tileAtlas: 'tex.tiles',
  wall: 'tex.wall',
  fence: 'tex.fence',
  decal: (kind: string) => `tex.decal.${kind}`,
  dot: 'tex.dot',
  muzzle: 'tex.muzzle',
  skyline: 'tex.skyline',
  label: (text: string) => `tex.label.${text}`,
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
  'bus',
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

/** Item category colours for dropped items (and the 2D fallback). */
export const ITEM_COLORS: Record<string, string> = {
  food: '#8a7a5a',
  drink: '#3a6a8a',
  medical: '#a04040',
  material: '#6a6a62',
  tool: '#7a6a3a',
  ammo: '#9a8a3a',
  weapon: '#5a5f68',
  mod: '#4a6a4a',
  armor: '#4a4a72',
  backpack: '#6a5a3a',
  blueprint: '#3f5a8a',
  note: '#b8b0a0',
  quest: '#c0902a',
  throwable: '#4a7a3a',
  fuel: '#8a2a20',
  junk: '#5a564e',
};

/**
 * Containers whose models are vehicles or other big things: the model's height scales with its footprint
 * so a three-tile car isn't a flat slab.
 */
export const TALL_FOOTPRINT: Record<string, number> = {
  'container.car_trunk': 1.45,
  'container.bus': 1.7,
  'prop.vehicle': 1.55,
};
