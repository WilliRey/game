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
  range: 1.05,
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

// ---------------------------------------------------------------- tooltips

export interface StatRow {
  label: string;
  value: number;
  /** Format for display. */
  fmt: (v: number) => string;
  /** Higher numbers are better (for comparison coloring). Undefined = neutral. */
  better?: 'higher' | 'lower';
}

const n0 = (v: number) => String(Math.round(v));
const n1 = (v: number) => (Math.round(v * 10) / 10).toString();
const pct = (v: number) => `${Math.round(v * 100)}%`;
const plus = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

/** Numeric stats of an item instance for tooltips and before/after previews. */
export function statRows(content: Content, s: ItemStack): StatRow[] {
  const def = content.items[s.itemId];
  if (!def) return [];
  const rows: StatRow[] = [];
  const st = weaponStats(content, s);
  if (st?.kind === 'melee') {
    rows.push({ label: 'Damage', value: st.damage, fmt: n1, better: 'higher' });
    rows.push({
      label: 'Swings / s',
      value: 1000 / (st.windupMs + st.recoveryMs),
      fmt: n1,
      better: 'higher',
    });
    rows.push({ label: 'Reach', value: st.range, fmt: n1, better: 'higher' });
    rows.push({ label: 'Arc°', value: st.arcDeg, fmt: n0, better: 'higher' });
    rows.push({ label: 'Stamina / swing', value: st.stamina, fmt: n1, better: 'lower' });
    rows.push({ label: 'Knockback', value: st.knockback, fmt: n1, better: 'higher' });
  } else if (st?.kind === 'firearm') {
    rows.push({
      label: st.pellets > 1 ? `Damage (×${st.pellets})` : 'Damage',
      value: st.damage,
      fmt: n1,
      better: 'higher',
    });
    rows.push({ label: 'Shots / s', value: 1000 / st.fireIntervalMs, fmt: n1, better: 'higher' });
    rows.push({ label: 'Magazine', value: st.magSize, fmt: n0, better: 'higher' });
    rows.push({
      label: 'Reload s',
      value: (st.reloadMs / 1000) * (st.shellByShell ? st.magSize : 1),
      fmt: n1,
      better: 'lower',
    });
    rows.push({ label: 'Spread°', value: st.spreadBaseDeg, fmt: n1, better: 'lower' });
    rows.push({ label: 'Range', value: st.range, fmt: n0, better: 'higher' });
    rows.push({ label: 'Noise radius', value: st.noise, fmt: n0, better: 'lower' });
    if (st.jamChance > 0) rows.push({ label: 'Jam chance', value: st.jamChance, fmt: pct, better: 'lower' });
  } else if (st?.kind === 'throwable') {
    if (st.damage)
      rows.push({
        label: st.effect === 'fire' ? 'Burn / s' : 'Damage',
        value: st.damage,
        fmt: n0,
        better: 'higher',
      });
    rows.push({ label: 'Radius', value: st.radius, fmt: n1, better: 'higher' });
    rows.push({ label: 'Noise radius', value: st.noise, fmt: n0 });
  }
  if (def.armor) {
    rows.push({ label: 'Damage reduction', value: def.armor.damageReduction, fmt: pct, better: 'higher' });
    rows.push({ label: 'Bite protection', value: def.armor.infectionReduction, fmt: pct, better: 'higher' });
    if (def.armor.noisePenalty)
      rows.push({ label: 'Noise penalty', value: def.armor.noisePenalty, fmt: pct, better: 'lower' });
  }
  if (def.backpack)
    rows.push({ label: 'Carry capacity', value: def.backpack.capacityBonus, fmt: plus, better: 'higher' });
  const u = def.use;
  if (u) {
    if (u.hunger) rows.push({ label: 'Hunger', value: u.hunger, fmt: plus, better: 'higher' });
    if (u.thirst) rows.push({ label: 'Thirst', value: u.thirst, fmt: plus, better: 'higher' });
    if (u.hp) rows.push({ label: 'Health', value: u.hp, fmt: plus, better: 'higher' });
    if (u.stamina) rows.push({ label: 'Stamina', value: u.stamina, fmt: plus, better: 'higher' });
    if (u.foodPoisonChance)
      rows.push({ label: 'Food poisoning risk', value: u.foodPoisonChance, fmt: pct, better: 'lower' });
  }
  if (s.maxDurability)
    rows.push({
      label: 'Durability',
      value: s.durability ?? s.maxDurability,
      fmt: (v) => `${Math.round(v)}/${s.maxDurability}`,
      better: 'higher',
    });
  if (s.quality && s.quality !== 1)
    rows.push({ label: 'Quality', value: s.quality, fmt: pct, better: 'higher' });
  return rows;
}

/** Plain-language effects for consumables. */
export function useNotes(content: Content, itemId: string): string[] {
  const u = content.items[itemId]?.use;
  const out: string[] = [];
  if (!u) return out;
  if (u.cureBleeding) out.push('Stops bleeding');
  if (u.antibiotic) out.push('Knocks infection back 40%');
  if (u.cureFoodPoisoning) out.push('Cures food poisoning');
  if (u.raw) out.push('Raw: cook or boil it first');
  return out;
}
