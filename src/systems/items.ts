/** Item definitions, stack instances and derived weapon stats (quality, mods, durability). */
import { BALANCE } from '@/config/balance';
import type { Content } from '@/content';
import type { ItemDef, WeaponStatMods } from '@/content/schemas';
import { newUid } from '@/core/store';
import type { GameState, ItemStack, ModSlot } from '@/core/types';

export function itemDef(content: Content, itemId: string): ItemDef {
  const d = content.items[itemId];
  if (!d) throw new Error(`Unknown item '${itemId}'`);
  return d;
}

export interface StackOptions {
  mag?: number;
  quality?: number;
  durability?: number;
}

/** A fresh stack with instance data (durability, empty magazine) filled in. */
export function createStack(
  state: GameState,
  content: Content,
  itemId: string,
  qty = 1,
  opts: StackOptions = {},
): ItemStack {
  const def = itemDef(content, itemId);
  const s: ItemStack = { uid: newUid(state, 'i'), itemId, qty };
  if (def.durability !== undefined) {
    const q = opts.quality ?? 1;
    const max = Math.round(def.durability * q * (modStats(content, s).durability ?? 1));
    s.maxDurability = max;
    s.durability = Math.min(max, opts.durability ?? max);
  }
  if (opts.quality !== undefined && opts.quality !== 1) s.quality = Math.round(opts.quality * 100) / 100;
  if (def.weapon?.kind === 'firearm') s.mag = opts.mag ?? 0;
  return s;
}

export function cloneStack(state: GameState, s: ItemStack, qty = s.qty): ItemStack {
  return { ...s, uid: newUid(state, 'i'), qty, mods: s.mods ? { ...s.mods } : undefined };
}

/** Only plain stackable items merge; anything with instance data stays separate. */
export function canMerge(content: Content, a: ItemStack, b: ItemStack): boolean {
  if (a.itemId !== b.itemId) return false;
  const def = content.items[a.itemId];
  if (!def || def.stack <= 1) return false;
  return a.durability === undefined && b.durability === undefined && !a.mods && !b.mods;
}

/** item id, `cat:<category>` or `tag:<tag>`. */
export function matchesItem(content: Content, itemId: string, matcher: string): boolean {
  if (matcher === itemId) return true;
  const def = content.items[itemId];
  if (!def) return false;
  if (matcher.startsWith('cat:')) return def.category === matcher.slice(4);
  if (matcher.startsWith('tag:')) return def.tags.includes(matcher.slice(4));
  return false;
}

export function stackWeight(content: Content, s: ItemStack): number {
  return (content.items[s.itemId]?.weight ?? 0) * s.qty;
}

export function listWeight(content: Content, list: readonly ItemStack[]): number {
  let w = 0;
  for (const s of list) w += stackWeight(content, s);
  return w;
}

export const RARITY_COLOR: Record<string, string> = {
  common: '#c9c4b8',
  uncommon: '#79b26f',
  rare: '#6f9fd8',
  epic: '#b884d8',
};

// ---------------------------------------------------------------- weapon stats

/** Combined multiplicative/additive modifiers from a stack's attached mods. */
export function modStats(content: Content, s: ItemStack): WeaponStatMods {
  const out: WeaponStatMods = {};
  if (!s.mods) return out;
  for (const modId of Object.values(s.mods)) {
    const m = modId ? content.items[modId]?.mod : undefined;
    if (!m) continue;
    for (const [k, v] of Object.entries(m.stats) as [keyof WeaponStatMods, number | boolean][]) {
      if (typeof v === 'boolean')
        (out as Record<string, unknown>)[k] = v || (out as Record<string, unknown>)[k];
      else if (k === 'magSize') out.magSize = (out.magSize ?? 0) + v;
      else (out as Record<string, number>)[k] = ((out as Record<string, number>)[k] ?? 1) * v;
    }
  }
  return out;
}

export interface MeleeStats {
  kind: 'melee';
  damage: number;
  arcDeg: number;
  range: number;
  windupMs: number;
  recoveryMs: number;
  stamina: number;
  knockback: number;
  staggerChance: number;
  cleave: boolean;
  heavy: boolean;
}
export interface FirearmStats {
  kind: 'firearm';
  damage: number;
  ammoType: string;
  magSize: number;
  reloadMs: number;
  shellByShell: boolean;
  spreadBaseDeg: number;
  spreadMaxDeg: number;
  pellets: number;
  range: number;
  noise: number;
  fireIntervalMs: number;
  jamChance: number;
  recoverable: boolean;
  recoilBloom: number;
  suppressed: boolean;
}
export interface ThrowStats {
  kind: 'throwable';
  damage: number;
  effect: 'noise' | 'fire' | 'explosion';
  radius: number;
  noise: number;
  durationSec: number;
  fuseMs: number;
  throwRange: number;
}
export type WeaponStats = MeleeStats | FirearmStats | ThrowStats;

/** Bare hands, used when the melee slot is empty or the weapon is broken. */
export const FISTS: MeleeStats = {
  kind: 'melee',
  damage: 5,
  arcDeg: 60,
  range: 1.0,
  windupMs: 90,
  recoveryMs: 260,
  stamina: 6,
  knockback: 0.3,
  staggerChance: 0.15,
  cleave: false,
  heavy: false,
};

/** Effective stats of a weapon stack: base × quality × mods. Skills are applied by the combat code. */
export function weaponStats(content: Content, s: ItemStack): WeaponStats | null {
  const def = content.items[s.itemId];
  const w = def?.weapon;
  if (!w) return null;
  const q = s.quality ?? 1;
  const m = modStats(content, s);
  if (w.kind === 'melee' && w.melee) {
    return {
      kind: 'melee',
      damage: w.damage * q * (m.damage ?? 1),
      arcDeg: w.melee.arcDeg,
      range: w.melee.range * (m.range ?? 1),
      windupMs: w.melee.windupMs,
      recoveryMs: w.melee.recoveryMs,
      stamina: w.melee.stamina * (m.stamina ?? 1),
      knockback: w.melee.knockback * (m.knockback ?? 1),
      staggerChance: w.melee.staggerChance,
      cleave: w.melee.cleave || !!m.cleave,
      heavy: w.melee.heavy,
    };
  }
  if (w.kind === 'firearm' && w.firearm) {
    const f = w.firearm;
    const suppressed = !!m.suppressed;
    return {
      kind: 'firearm',
      damage: w.damage * q * (m.damage ?? 1),
      ammoType: f.ammoType,
      magSize: f.magSize + (m.magSize ?? 0),
      reloadMs: f.reloadMs,
      shellByShell: f.shellByShell,
      spreadBaseDeg: f.spreadBaseDeg * (m.spread ?? 1),
      spreadMaxDeg: f.spreadMaxDeg * (m.spread ?? 1),
      pellets: f.pellets,
      range: f.range * (m.range ?? 1),
      noise: suppressed ? (f.suppressedNoise ?? BALANCE.noise.suppressed) : f.noise * (m.noise ?? 1),
      fireIntervalMs: f.fireIntervalMs,
      jamChance: f.jamChance * (m.jamChance ?? 1),
      recoverable: f.recoverable,
      recoilBloom: m.recoilBloom ?? 1,
      suppressed,
    };
  }
  if (w.kind === 'throwable' && w.throwable) {
    const t = w.throwable;
    return {
      kind: 'throwable',
      damage: w.damage,
      effect: t.effect,
      radius: t.radius,
      noise: t.noise,
      durationSec: t.durationSec,
      fuseMs: t.fuseMs,
      throwRange: t.throwRange,
    };
  }
  return null;
}

export function isBroken(s: ItemStack): boolean {
  return s.durability !== undefined && s.durability <= 0;
}

/** Mod slots a weapon accepts that a given mod item fits (slot, weapon kind, ammo type). */
export function modFits(content: Content, weapon: ItemStack, modItemId: string): ModSlot | null {
  const wdef = content.items[weapon.itemId]?.weapon;
  const mdef = content.items[modItemId]?.mod;
  if (!wdef || !mdef) return null;
  if (!wdef.modSlots.includes(mdef.slot)) return null;
  if (mdef.appliesTo !== wdef.kind) return null;
  if (mdef.ammoTypes && wdef.firearm && !mdef.ammoTypes.includes(wdef.firearm.ammoType)) return null;
  return mdef.slot;
}

/** Durability as 0..1, or 1 for items without durability. */
export function condition(s: ItemStack): number {
  if (s.durability === undefined || !s.maxDurability) return 1;
  return Math.max(0, Math.min(1, s.durability / s.maxDurability));
}
