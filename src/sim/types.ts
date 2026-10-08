/**
 * The per-zone simulation state. Plain JSON-friendly data so a save can snapshot a zone mid-visit.
 * Derived, rebuildable data (solid/opaque flags, FOV, spatial hash) lives in `sim/runtime.ts`.
 * Coordinates are in tiles (floats); tile (3, 4) spans x ∈ [3, 4), y ∈ [4, 5).
 */
import type { ItemStack, Uid } from '@/core/types';

export interface Vec {
  x: number;
  y: number;
}

export interface DoorState {
  id: string;
  x: number;
  y: number;
  open: boolean;
  locked: boolean;
  broken: boolean;
  hp: number;
  maxHp: number;
  keyId?: string;
  keyOnly?: boolean;
}

export interface ContainerState {
  id: string;
  type: string;
  /** Bounding box in tiles (containers can span several tiles, e.g. a car wreck). */
  x: number;
  y: number;
  w: number;
  h: number;
  rolled: boolean;
  searched: boolean;
  items: ItemStack[];
  locked: boolean;
  keyId?: string;
  keyOnly?: boolean;
  lootTable?: string;
  alarm?: boolean;
  label?: string;
}

export type ZombieMode = 'idle' | 'wander' | 'investigate' | 'chase' | 'attack' | 'search' | 'dead';

export interface Zombie {
  id: Uid;
  type: string;
  x: number;
  y: number;
  /** Knockback velocity (tiles/s), decays quickly. */
  kx: number;
  ky: number;
  facing: number;
  hp: number;
  maxHp: number;
  mode: ZombieMode;
  modeTime: number;
  /** Where the zombie is heading (noise source, last known player position, wander point). */
  target: Vec | null;
  path: Vec[] | null;
  pathIndex: number;
  repathIn: number;
  senseIn: number;
  attackCooldown: number;
  /** > 0 while winding up a swing at the player. */
  windup: number;
  stagger: number;
  bashDoor: string | null;
  bashIn: number;
  awake: boolean;
  nestId?: string;
  screamIn: number;
  groanIn: number;
  hitFlash: number;
  /** Sim time of the last damage taken (health bar visibility). */
  damagedAt: number;
  stuck: number;
}

export type Stance = 'walk' | 'sprint' | 'crouch';

/** A timed, interruptible action (search, pick a lock, siphon, cut a chain, use an item...). */
export interface TimedAction {
  kind: 'timed';
  verb: 'search' | 'lockpick' | 'force' | 'siphon' | 'cut' | 'use' | 'repair';
  targetId: string;
  t: number;
  duration: number;
  /** Released key cancels hold actions; `use` actions are not held. */
  hold: boolean;
  noiseIn: number;
}

export interface MeleeAction {
  kind: 'melee';
  phase: 'windup' | 'recovery';
  t: number;
  windup: number;
  recovery: number;
  uid: Uid | null;
  angle: number;
}

export interface ReloadAction {
  kind: 'reload';
  t: number;
  duration: number;
  uid: Uid;
}

export type PlayerAction = TimedAction | MeleeAction | ReloadAction;

export interface PlayerEntity {
  x: number;
  y: number;
  radius: number;
  /** Aim direction in radians (0 = +x / east, π/2 = +y / south). */
  facing: number;
  crouched: boolean;
  aiming: boolean;
  sprinting: boolean;
  moving: boolean;
  vx: number;
  vy: number;
  /** Seconds since stamina was last spent (regen waits for `staminaRegenDelay`). */
  staminaIdle: number;
  action: PlayerAction | null;
  fireCooldown: number;
  shoveCooldown: number;
  /** Extra spread in degrees from movement and recoil. */
  bloom: number;
  footstepIn: number;
  /** Loudest noise radius the player made recently (HUD noise meter). Decays. */
  noise: number;
  damagedAt: number;
  hurtFlash: number;
  /** Seconds left of the Paramedic's adrenaline (stamina costs nothing). */
  adrenaline: number;
  /** Seconds left of the Scavenger's scouting sense (containers and zombies show through walls). */
  scout: number;
}

export interface ThrownObject {
  id: string;
  itemId: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  duration: number;
}

export interface Hazard {
  id: string;
  /** fire/gas hurt; fuse explodes; decoy beeps and draws zombies; smoke blocks zombie sight. */
  kind: 'fire' | 'gas' | 'fuse' | 'decoy' | 'smoke';
  x: number;
  y: number;
  radius: number;
  ttl: number;
  /** Damage per second to anything inside (fire/gas); explosion damage for fuses. */
  dps: number;
  byPlayer: boolean;
  /** For fuses and decoys: the throwable item that made it. */
  itemId?: string;
  pulseIn: number;
  /** Decoys: noise radius of each beep. */
  noise?: number;
  /** Starting ttl (for fades). */
  ttl0?: number;
}

export interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ttl: number;
}

export interface Decal {
  x: number;
  y: number;
  kind: 'blood' | 'glass' | 'scorch' | 'gore';
  rot: number;
  scale: number;
}

export interface NoiseRecord {
  x: number;
  y: number;
  radius: number;
  source: string;
  byPlayer: boolean;
  ttl: number;
}

export interface NpcEntity {
  id: string;
  npcId: string;
  x: number;
  y: number;
  facing: number;
}

export interface WorldItem {
  uid: Uid;
  x: number;
  y: number;
  stack: ItemStack;
  /** Set for pre-placed pickups so taking them is remembered. */
  pickupId?: string;
}

/** Dynamic state of zone objects that aren't doors or containers (pickups, blockers, siphons, triggers). */
export interface ObjectState {
  done?: boolean;
  removed?: boolean;
  liters?: number;
  stored?: number;
}

export interface ZoneState {
  zoneId: string;
  w: number;
  h: number;
  /** Tile codes (index into TILE_KINDS), row-major. */
  tiles: number[];
  /** 1 = the player has seen this tile. */
  explored: number[];
  player: PlayerEntity;
  doors: Record<string, DoorState>;
  containers: Record<string, ContainerState>;
  objects: Record<string, ObjectState>;
  zombies: Zombie[];
  npcs: NpcEntity[];
  items: WorldItem[];
  thrown: ThrownObject[];
  hazards: Hazard[];
  tracers: Tracer[];
  decals: Decal[];
  noises: NoiseRecord[];
  nestsCleared: string[];
  /** Sim seconds since the zone was entered. */
  time: number;
  /** Seconds until the next night trickle spawn check. */
  spawnIn: number;
  enteredAtMinutes: number;
  safe: boolean;
  danger: number;
  /** Ambient (non-nest) zombie count when first populated; regeneration is capped by it. */
  ambientPopulation: number;
  nextId: number;
}
