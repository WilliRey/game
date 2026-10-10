import type { Difficulty } from '@/config/balance';
import type { ObjectState, WorldItem, ZoneState } from '@/sim/types';
import type { RngState } from './rng';

// ---------- ids ----------
export type ItemId = string;
export type ZoneId = string;
export type QuestId = string;
export type NpcId = string;
export type TraderId = string;
export type NodeId = string;
export type RecipeId = string;
export type Uid = string;

export type SkillId = 'melee' | 'firearms' | 'scavenging' | 'crafting' | 'survival' | 'barter' | 'stealth';
export const SKILL_IDS: SkillId[] = [
  'melee',
  'firearms',
  'scavenging',
  'crafting',
  'survival',
  'barter',
  'stealth',
];

export type EquipSlot = 'head' | 'torso' | 'backpack' | 'firearm1' | 'firearm2' | 'melee' | 'throwable';
export const EQUIP_SLOTS: EquipSlot[] = [
  'head',
  'torso',
  'backpack',
  'firearm1',
  'firearm2',
  'melee',
  'throwable',
];
export type WeaponSlot = 'firearm1' | 'firearm2' | 'melee' | 'throwable';
export const WEAPON_SLOTS: WeaponSlot[] = ['firearm1', 'firearm2', 'melee', 'throwable'];
export type ModSlot = 'muzzle' | 'sight' | 'magazine' | 'stock' | 'head' | 'grip';
export const QUICK_SLOT_COUNT = 4;

// ---------- items ----------
/** A stack in an inventory. Weapons/armor are never stacked (qty 1) and carry instance data. */
export interface ItemStack {
  uid: Uid;
  itemId: ItemId;
  qty: number;
  durability?: number;
  maxDurability?: number;
  /** Rounds currently loaded in a firearm. */
  mag?: number;
  mods?: Partial<Record<ModSlot, ItemId>>;
  /** Crafted quality multiplier (affects damage and durability). Undefined = 1. */
  quality?: number;
  /** Crude firearms can jam; reloading clears it. */
  jammed?: boolean;
}

// ---------- status effects ----------
export type EffectId = 'bleeding' | 'infection' | 'food_poisoning' | 'encumbered' | 'well_fed';
export interface StatusEffect {
  id: EffectId;
  /** Infection: progress 0..100. Food poisoning: remaining minutes. Others: unused (0). */
  value: number;
}

// ---------- player ----------
export interface PlayerState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  /** 0 = starving, 100 = full. */
  hunger: number;
  /** 0 = dehydrated, 100 = full. */
  thirst: number;
  xp: number;
  level: number;
  skillPoints: number;
  skills: Record<SkillId, number>;
  effects: StatusEffect[];
  inventory: ItemStack[];
  equipment: Partial<Record<EquipSlot, Uid>>;
  quickSlots: (Uid | null)[];
  activeSlot: WeaponSlot;
  flashlightOn: boolean;
  /** Game seconds (state.time.seconds) of the last attack or hit taken; drives the exertion drain. */
  lastCombatAt: number;
  godMode: boolean;
  noclip: boolean;
  /** Set when the player dies; the death screen reloads the last save. */
  dead?: boolean;
  /** Sam's background (classes.json). */
  classId: string;
  /** Seconds until the class ability (Q) can be used again. */
  abilityCooldown: number;
}

// ---------- time ----------
export interface TimeState {
  /** Game minutes since day 0, 00:00. */
  minutes: number;
  /** Game-clock seconds elapsed while the clock ran (sim timers). */
  seconds: number;
  /** Debug time scale (1 = normal). */
  scale: number;
}

// ---------- zone persistence ----------
export interface RememberedContainer {
  rolled: boolean;
  searched: boolean;
  items: ItemStack[];
  locked: boolean;
}
export interface RememberedDoor {
  open: boolean;
  hp: number;
  locked: boolean;
  broken: boolean;
}
export interface RememberedZombie {
  type: string;
  x: number;
  y: number;
  hp: number;
  nestId?: string;
}
/** What a zone remembers while the player is elsewhere (brief: zones remember their state). */
export interface RememberedZone {
  lastVisitMinutes: number;
  containers: Record<string, RememberedContainer>;
  doors: Record<string, RememberedDoor>;
  objects: Record<string, ObjectState>;
  /** Every item lying in the world (remaining pre-placed pickups and anything dropped). */
  items: WorldItem[];
  nestsCleared: string[];
  zombies: RememberedZombie[];
  /** Ambient (non-nest) population when first rolled; regeneration never exceeds it. */
  ambientPopulation: number;
  /** Run-length encoded explored bitmap. */
  explored: string;
}

// ---------- quests ----------
export type QuestStatus = 'active' | 'completed' | 'failed';
export interface QuestState {
  id: QuestId;
  status: QuestStatus;
  stage: number;
  /** Objective id → current count. */
  progress: Record<string, number>;
  outcome?: string;
  startedAtMinutes: number;
  completedAtMinutes?: number;
  completions: number;
}

// ---------- traders ----------
export interface TraderState {
  stock: ItemStack[];
  /** Overpayment kept by this trader, in value points. */
  credit: number;
  lastRestockMinutes: number;
  restocks: number;
  unlocked: boolean;
}

// ---------- base ----------
export interface BaseState {
  workbenchTier: number;
  stoveTier: number;
  reloadingBench: boolean;
  rainCollector: { built: boolean; stored: number; lastTickMinutes: number };
  stash: ItemStack[];
}

export interface VehicleState {
  owned: boolean;
  fuel: number;
  maxFuel: number;
}

export type TravelMode = 'foot' | 'vehicle';

/** A journey in progress: set while a travel event is on screen, cleared on arrival. */
export interface TravelState {
  from: NodeId;
  to: NodeId;
  mode: TravelMode;
  km: number;
  minutes: number;
  fuel: number;
  eventId?: string;
  /** Index of the choice taken and the outcome text, once the player has chosen. */
  choice?: number;
  outcomeText?: string;
  /** What the outcome did, for the event screen ("+2 Scrap Metal", "−8 health"). */
  outcomeSummary?: string[];
}

export interface WorldState {
  currentNode: NodeId;
  knownNodes: NodeId[];
  visitedNodes: NodeId[];
  /** Travel events already seen (some are one-off). */
  seenEvents: string[];
}

export interface SettingsState {
  masterVolume: number;
  sfxVolume: number;
  screenShake: boolean;
  damageNumbers: boolean;
  hints: boolean;
  uiScale: number;
  inventoryPausesClock: boolean;
}

export interface GameState {
  version: number;
  seed: string;
  difficulty: Difficulty;
  nextUid: number;
  rng: RngState;
  time: TimeState;
  player: PlayerState;
  /** The zone the player is in. Null only transiently while travelling. */
  zone: ZoneState | null;
  zones: Record<ZoneId, RememberedZone>;
  quests: Record<QuestId, QuestState>;
  trackedQuest: QuestId | null;
  flags: Record<string, boolean | number | string>;
  /** Standing with the Firehouse 9 camp, 0..100. Every trader there reads it. */
  reputation: number;
  traders: Record<TraderId, TraderState>;
  base: BaseState;
  vehicle: VehicleState;
  world: WorldState;
  travel: TravelState | null;
  unlockedRecipes: RecipeId[];
  notesRead: string[];
  broadcastsHeard: string[];
  hintsSeen: string[];
  stats: { kills: number; crafted: number; containersSearched: number; playSeconds: number };
}

export const DEFAULT_SETTINGS: SettingsState = {
  masterVolume: 0.7,
  sfxVolume: 1,
  screenShake: true,
  damageNumbers: true,
  hints: true,
  uiScale: 1,
  inventoryPausesClock: false,
};
