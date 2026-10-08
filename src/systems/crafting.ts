/**
 * Crafting (brief §5): recipes per station and tier, blueprints, crafted quality from bench tier and the
 * Crafting skill, weapon mods with before/after previews, repairs that cost a little max durability, and
 * dismantling for components. At the safehouse, inputs can come from the stash as well as the pack.
 */
import { BALANCE } from '@/config/balance';
import type { RecipeDef } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import type { ItemStack, ModSlot, Uid } from '@/core/types';
import { perk, recipeAllowed } from './classes';
import { passTime } from './clock';
import { knowsRecipe } from './conditions';
import { addItem, addStack, countIn, countItem, findStack, removeStack, takeFromList } from './inventory';
import { createStack, modFits, modStats, statRows, type StatRow } from './items';
import { SKILL, grantXp, rank } from './progression';

export type Station = RecipeDef['station'];

export interface CraftContext {
  station: Station;
  tier: number;
  /** At the safehouse the stash counts as available inputs. */
  useStash: boolean;
}

export function craftContext(ctx: GameContext, station: Station, tierOverride?: number): CraftContext {
  const b = ctx.state.base;
  const home = !!ctx.state.zone?.safe;
  let tier = tierOverride ?? 1;
  if (tierOverride === undefined && home) {
    if (station === 'workbench') tier = b.workbenchTier;
    if (station === 'stove') tier = b.stoveTier;
    if (station === 'reloading') tier = b.reloadingBench ? 1 : 0;
  }
  return { station, tier, useStash: home };
}

export function available(ctx: GameContext, cc: CraftContext, itemId: string): number {
  return countItem(ctx, itemId) + (cc.useStash ? countIn(ctx.content, ctx.state.base.stash, itemId) : 0);
}

export interface RecipeStatus {
  recipe: RecipeDef;
  known: boolean;
  stationOk: boolean;
  tierOk: boolean;
  toolOk: boolean;
  inputs: { itemId: string; need: number; have: number }[];
  canCraft: boolean;
}

export function recipeStatus(ctx: GameContext, r: RecipeDef, cc: CraftContext): RecipeStatus {
  const known = knowsRecipe(ctx, r.id);
  const stationOk = r.station === 'inventory' || r.station === cc.station;
  const tierOk = r.station === 'inventory' || cc.tier >= r.tier;
  const toolOk = !r.tool || countItem(ctx, r.tool) > 0;
  const inputs = r.inputs.map((i) => ({ itemId: i.itemId, need: i.qty, have: available(ctx, cc, i.itemId) }));
  const canCraft = known && stationOk && tierOk && toolOk && inputs.every((i) => i.have >= i.need);
  return { recipe: r, known, stationOk, tierOk, toolOk, inputs, canCraft };
}

/** Recipes worth showing at a station: its own plus the handheld ones. Unknown blueprint recipes are listed as locked. */
export function recipesAt(ctx: GameContext, cc: CraftContext): RecipeStatus[] {
  return ctx.content.lists.recipes
    .filter((r) => r.station === cc.station || r.station === 'inventory')
    .filter((r) => recipeAllowed(ctx, r.class))
    .map((r) => recipeStatus(ctx, r, cc))
    .sort(
      (a, b) =>
        Number(b.canCraft) - Number(a.canCraft) ||
        Number(b.known) - Number(a.known) ||
        a.recipe.category.localeCompare(b.recipe.category),
    );
}

/** Quality of crafted gear: better benches and more Crafting skill make better weapons. */
export function craftQuality(ctx: GameContext, tier: number): number {
  const C = BALANCE.crafting;
  return Math.min(
    1.25,
    0.88 + C.qualityPerBenchTier * (tier - 1) + SKILL.craftQuality(rank(ctx, 'crafting')),
  );
}

/** Consume inputs, pulling from the pack first and then the stash. */
function consume(ctx: GameContext, cc: CraftContext, itemId: string, qty: number): void {
  const fromPack = Math.min(qty, countItem(ctx, itemId));
  if (fromPack > 0) {
    const equipped = new Set(Object.values(ctx.state.player.equipment).filter((u): u is string => !!u));
    for (const s of takeFromList(ctx, ctx.state.player.inventory, itemId, fromPack, equipped)) {
      ctx.bus.emit('item:removed', { itemId: s.itemId, qty: s.qty, reason: 'crafted' });
      const p = ctx.state.player;
      for (const k of Object.keys(p.equipment) as (keyof typeof p.equipment)[])
        if (p.equipment[k] === s.uid) delete p.equipment[k];
      p.quickSlots = p.quickSlots.map((q) => (q === s.uid ? null : q));
    }
  }
  const rest = qty - fromPack;
  if (rest > 0 && cc.useStash) takeFromList(ctx, ctx.state.base.stash, itemId, rest);
}

export function craft(
  ctx: GameContext,
  recipeId: string,
  cc: CraftContext,
): { ok: boolean; message: string; stack?: ItemStack } {
  const r = ctx.content.recipes[recipeId];
  if (!r) return { ok: false, message: 'Unknown recipe.' };
  const st = recipeStatus(ctx, r, cc);
  if (!st.known) return { ok: false, message: 'You need the blueprint for that.' };
  if (!st.stationOk || !st.tierOk) return { ok: false, message: `Needs a tier ${r.tier} ${r.station}.` };
  if (!st.toolOk) return { ok: false, message: `Needs a ${ctx.content.items[r.tool!]?.name ?? r.tool}.` };
  if (!st.canCraft) return { ok: false, message: 'Missing materials.' };
  for (const i of r.inputs) consume(ctx, cc, i.itemId, i.qty);
  const out = ctx.content.items[r.output.itemId]!;
  const gear = !!out.weapon && out.weapon.kind !== 'throwable';
  const quality = gear || out.armor || out.mod ? craftQuality(ctx, Math.max(1, cc.tier)) : undefined;
  const stack = createStack(
    ctx.state,
    ctx.content,
    r.output.itemId,
    r.output.qty,
    quality !== undefined ? { quality } : {},
  );
  const added = addStack(ctx, stack, 'craft');
  const minutes =
    (r.station === 'stove' && cc.tier >= 2 ? r.timeMinutes / 2 : r.timeMinutes) * perk(ctx).craftTime;
  passTime(ctx, minutes, 'active');
  ctx.state.stats.crafted += 1;
  grantXp(ctx, r.xp + BALANCE.progression.craftXp, `craft:${r.id}`);
  ctx.bus.emit('item:crafted', { itemId: r.output.itemId, qty: r.output.qty, recipeId: r.id });
  const q = quality !== undefined ? ` (quality ${Math.round(quality * 100)}%)` : '';
  return {
    ok: true,
    message: `Crafted ${out.name}${r.output.qty > 1 ? ` ×${r.output.qty}` : ''}${q}.`,
    stack: added[0],
  };
}

// ---------------------------------------------------------------- mods

/** A copy of `weapon` with `modId` attached to its slot, for before/after previews. */
export function withMod(ctx: GameContext, weapon: ItemStack, modId: string | null, slot: ModSlot): ItemStack {
  const copy: ItemStack = { ...weapon, mods: { ...(weapon.mods ?? {}) } };
  if (modId) copy.mods![slot] = modId;
  else delete copy.mods![slot];
  const before = modStats(ctx.content, weapon).durability ?? 1;
  const after = modStats(ctx.content, copy).durability ?? 1;
  if (copy.maxDurability) {
    copy.maxDurability = Math.round((copy.maxDurability / before) * after);
    copy.durability = Math.min(copy.maxDurability, Math.round(((copy.durability ?? 0) / before) * after));
  }
  return copy;
}

export function modPreview(
  ctx: GameContext,
  weapon: ItemStack,
  modId: string | null,
  slot: ModSlot,
): { before: StatRow[]; after: StatRow[] } {
  return {
    before: statRows(ctx.content, weapon),
    after: statRows(ctx.content, withMod(ctx, weapon, modId, slot)),
  };
}

export function attachMod(ctx: GameContext, weaponUid: Uid, modUid: Uid): { ok: boolean; message: string } {
  const w = findStack(ctx, weaponUid);
  const m = findStack(ctx, modUid);
  if (!w || !m) return { ok: false, message: 'Missing item.' };
  const slot = modFits(ctx.content, w, m.itemId);
  if (!slot) return { ok: false, message: "That mod doesn't fit this weapon." };
  const old = w.mods?.[slot];
  const updated = withMod(ctx, w, m.itemId, slot);
  removeStack(ctx, modUid, 1, 'mod');
  Object.assign(w, {
    mods: updated.mods,
    maxDurability: updated.maxDurability,
    durability: updated.durability,
  });
  if (old) addItem(ctx, old, 1, 'mod');
  ctx.bus.emit('sfx:play', { key: 'craft' });
  return {
    ok: true,
    message: `Attached ${ctx.content.items[m.itemId]?.name}${old ? ` (removed ${ctx.content.items[old]?.name})` : ''}.`,
  };
}

export function detachMod(ctx: GameContext, weaponUid: Uid, slot: ModSlot): { ok: boolean; message: string } {
  const w = findStack(ctx, weaponUid);
  const old = w?.mods?.[slot];
  if (!w || !old) return { ok: false, message: 'Nothing attached there.' };
  const updated = withMod(ctx, w, null, slot);
  Object.assign(w, {
    mods: updated.mods,
    maxDurability: updated.maxDurability,
    durability: updated.durability,
  });
  if (w.mods && Object.keys(w.mods).length === 0) delete w.mods;
  addItem(ctx, old, 1, 'mod');
  return { ok: true, message: `Removed ${ctx.content.items[old]?.name}.` };
}

// ---------------------------------------------------------------- repair & dismantle

export function repairCost(ctx: GameContext, s: ItemStack): { itemId: string; qty: number }[] {
  const base = baseRepairCost(ctx, s);
  const m = perk(ctx).repairCost;
  if (m >= 1 || base.length === 0) return base;
  // A cheaper repair drops materials (rounding down), but always costs at least one of the first.
  const cut = base.map((c) => ({ itemId: c.itemId, qty: Math.floor(c.qty * m) })).filter((c) => c.qty > 0);
  return cut.length ? cut : [{ itemId: base[0]!.itemId, qty: 1 }];
}

function baseRepairCost(ctx: GameContext, s: ItemStack): { itemId: string; qty: number }[] {
  const def = ctx.content.items[s.itemId];
  if (!def) return [];
  if (def.repair) return def.repair;
  const R = BALANCE.crafting.repairCost;
  if (def.weapon?.kind === 'firearm') return R.firearm;
  if (def.weapon?.kind === 'melee') return R.melee;
  if (def.armor) return R.armor;
  return R.tool;
}

/** Max durability after one more repair. */
export function repairedMax(ctx: GameContext, s: ItemStack): number {
  const loss =
    BALANCE.crafting.repairMaxDurabilityLoss * SKILL.repairWear(rank(ctx, 'crafting')) * perk(ctx).repairWear;
  return Math.max(1, Math.round((s.maxDurability ?? 0) * (1 - loss)));
}

export function canRepair(ctx: GameContext, s: ItemStack, cc: CraftContext): boolean {
  if (s.maxDurability === undefined || (s.durability ?? 0) >= s.maxDurability) return false;
  return repairCost(ctx, s).every((c) => available(ctx, cc, c.itemId) >= c.qty);
}

export function repair(ctx: GameContext, uid: Uid, cc: CraftContext): { ok: boolean; message: string } {
  const s = findStack(ctx, uid);
  if (!s || s.maxDurability === undefined) return { ok: false, message: 'Nothing to repair.' };
  if (cc.station !== 'workbench') return { ok: false, message: 'Repairs need a workbench.' };
  if (!canRepair(ctx, s, cc)) return { ok: false, message: 'Missing materials.' };
  for (const c of repairCost(ctx, s)) consume(ctx, cc, c.itemId, c.qty);
  s.maxDurability = repairedMax(ctx, s);
  s.durability = s.maxDurability;
  s.jammed = false;
  passTime(ctx, 15, 'active');
  grantXp(ctx, 4, 'repair');
  ctx.bus.emit('sfx:play', { key: 'craft' });
  return {
    ok: true,
    message: `Repaired ${ctx.content.items[s.itemId]?.name}. Max durability now ${s.maxDurability}.`,
  };
}

/** Components you'd get back from dismantling (half, rounded down, at least one of the first part). */
export function dismantleYield(ctx: GameContext, s: ItemStack): { itemId: string; qty: number }[] {
  const def = ctx.content.items[s.itemId];
  const parts = def?.dismantle ?? [];
  const rate = BALANCE.crafting.dismantleReturnRate;
  const out = parts
    .map((p, i) => ({
      itemId: p.itemId,
      qty: Math.max(i === 0 ? 1 : 0, Math.floor(p.qty * rate * s.qty + (i === 0 ? 0.5 : 0))),
    }))
    .filter((p) => p.qty > 0);
  for (const m of Object.values(s.mods ?? {})) if (m) out.push({ itemId: m, qty: 1 });
  return out;
}

export function dismantle(ctx: GameContext, uid: Uid): { ok: boolean; message: string } {
  const s = findStack(ctx, uid);
  if (!s) return { ok: false, message: 'Nothing to dismantle.' };
  const parts = dismantleYield(ctx, s);
  if (!parts.length) return { ok: false, message: "That can't be taken apart." };
  removeStack(ctx, uid, undefined, 'dismantled');
  for (const p of parts) addItem(ctx, p.itemId, p.qty, 'dismantle');
  passTime(ctx, 10, 'active');
  grantXp(ctx, 3, 'dismantle');
  ctx.bus.emit('sfx:play', { key: 'craft' });
  return {
    ok: true,
    message: `Dismantled into ${parts.map((p) => `${p.qty}× ${ctx.content.items[p.itemId]?.name}`).join(', ')}.`,
  };
}
