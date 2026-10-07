import type { Difficulty } from '@/config/balance';
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
export const SKILL_IDS: SkillId[] = ['melee', 'firearms', 'scavenging', 'crafting', 'survival', 'barter', 'stealth'];

export type EquipSlot = 'head' | 'torso' | 'backpack' | 'firearm1' | 'firearm2' | 'melee' | 'throwable';
export type WeaponSlot = 'firearm1' | 'firearm2' | 'melee' | 'throwable';
export const WEAPON_SLOTS: WeaponSlot[] = ['firearm1', 'firearm2', 'melee', 'throwable'];
export type ModSlot = 'muzzle' | 'sight' | 'magazine' | 'stock' | 'head' | 'grip';

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
  /** 0..1 crafted quality (affects stats). Undefined = 1. */
  quality?: number;
}

// ---------- status effects ----------
export type EffectId = 'bleeding' | 'infection' | 'food_poisoning' | 'encumbered' | 'well_fed';
export interface StatusEffect {
  id: EffectId;
  /** Generic magnitude: infection progress 0..100; remaining minutes for timed effects. */
  value: number;
}

// ---------- player ----------
export interface PlayerState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  hunger: number; // 0 = starving, 100 = full
  thirst: number; // 0 = dehydrated, 100 = full
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
  /** Combat timestamps in game seconds, used by needs drain. */
  lastCombatAt: number;
  godMode: boolean;
  noclip: boolean;
}

// ---------- time ----------
export interface TimeState {
  /** Game minutes since day 0, 00:00. */
  minutes: number;
  /** Game seconds elapsed (fractional), used by sim timers. */
  seconds: number;
  scale: number;
}

// ---------- zone persistence ----------
export interface RememberedContainer {
  rolled: boolean;
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
  id: Uid;
  type: string;
  x: number;
  y: number;
  hp: number;
  nestId?: string;
}
export interface DroppedItem {
  uid: Uid;
  x: number;
  y: number;
  stack: ItemStack;
}
export interface RememberedZone {
  visited: boolean;
  lastVisitMinutes: number;
  containers: Record<string, RememberedContainer>;
  doors: Record<string, RememberedDoor>;
  dropped: DroppedItem[];
  nestsCleared: string[];
  zombies: RememberedZombie[] | null; // null = never populated, roll fresh
  explored: string | null; // run-length encoded explored bitmap
  pickedUp: string[]; // ids of one-off world pickups taken
  triggered: string[]; // one-shot trigger ids fired
}

// ---------- quests ----------
export type QuestStatus = 'active' | 'completed' | 'failed';
export interface QuestState {
  id: QuestId;
  status: QuestStatus;
  stage: number;
  progress: Record<string, number>;
  outcome?: string;
  startedAtMinutes: number;
  completions: number;
}

// ---------- traders ----------
export interface TraderState {
  stock: ItemStack[];
  credit: number;
  lastRestockMinutes: number;
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

export interface WorldState {
  currentNode: NodeId;
  knownNodes: NodeId[];
  /** Remembered loot categories per node, populated on visit. */
  seenEvents: string[];
}

export interface SettingsState {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
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
  zone: import('@/sim/types').ZoneState | null;
  zones: Record<ZoneId, RememberedZone>;
  quests: Record<QuestId, QuestState>;
  trackedQuest: QuestId | null;
  flags: Record<string, boolean | number | string>;
  reputation: number;
  traders: Record<TraderId, TraderState>;
  base: BaseState;
  vehicle: VehicleState;
  world: WorldState;
  unlockedRecipes: RecipeId[];
  notesRead: string[];
  broadcastsHeard: string[];
  hintsSeen: string[];
  stats: { kills: number; zonesVisited: number; crafted: number; daysSurvived: number };
  storyCards: string[];
}

export const DEFAULT_SETTINGS: SettingsState = {
  masterVolume: 0.8,
  sfxVolume: 1,
  musicVolume: 0.5,
  screenShake: true,
  damageNumbers: true,
  hints: true,
  uiScale: 1,
  inventoryPausesClock: false,
};
