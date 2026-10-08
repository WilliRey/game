/**
 * Loot tables (brief §5 Scavenging): one table per container type, scaled by the zone's danger tier.
 * Each container rolls from its own derived RNG stream (seed + zone + container), once, and the result is
 * saved — so the same container in the same save always holds the same things, whatever the search order.
 */
import { difficultyOf } from '@/config/balance';
import { Rng } from '@/core/rng';
import type { GameContext } from '@/core/store';
import type { ItemStack } from '@/core/types';
import { createStack } from './items';
import { SKILL, rank } from './progression';

export function lootRng(seed: string, ...parts: (string | number)[]): Rng {
  return Rng.fromSeed(`${seed}:loot:${parts.join(':')}`);
}

/** Roll a table for a danger tier (1..4). Pure apart from item uids. */
export function rollTable(
  ctx: GameContext,
  tableId: string,
  tier: number,
  rng: Rng,
  bonusChance = 0,
): ItemStack[] {
  const table = ctx.content.lootTables[tableId];
  if (!table) return [];
  const t = Math.max(1, Math.min(tier, table.rollsByTier.length));
  const [lo, hi] = table.rollsByTier[t - 1]!;
  let rolls = rng.int(lo, hi);
  const qtyMul = difficultyOf(ctx.state.difficulty).lootQuantity;
  rolls = Math.max(0, Math.round(rolls * qtyMul + (rng.next() - 0.5) * 0.4));
  if (bonusChance > 0 && rng.chance(bonusChance)) rolls += 1;
  const entries = table.entries.filter((e) => (e.minTier ?? 1) <= t && (e.maxTier ?? 99) >= t);
  const counts = new Map<string, number>();
  for (let i = 0; i < rolls; i++) {
    if (rng.chance(table.emptyChance)) continue;
    const e = rng.weighted(entries.map((x) => ({ weight: x.weight, value: x })));
    const qty = rng.int(e.qty[0], e.qty[1]);
    counts.set(e.itemId, (counts.get(e.itemId) ?? 0) + qty);
  }
  const out: ItemStack[] = [];
  for (const [itemId, qty] of counts) {
    const def = ctx.content.items[itemId];
    if (!def) continue;
    let left = qty;
    while (left > 0) {
      const n = Math.min(def.stack, left);
      const s = createStack(ctx.state, ctx.content, itemId, n);
      // Found weapons and armor are worn: 35–90% durability.
      if (s.maxDurability !== undefined)
        s.durability = Math.max(1, Math.round(s.maxDurability * rng.range(0.35, 0.9)));
      out.push(s);
      left -= n;
    }
  }
  return out;
}

/** Roll a container's contents for the current zone. */
export function rollContainer(
  ctx: GameContext,
  zoneId: string,
  containerId: string,
  containerType: string,
  tableOverride: string | undefined,
  danger: number,
): ItemStack[] {
  const table = tableOverride ?? ctx.content.containerTypes[containerType]?.lootTable;
  if (!table) return [];
  const rng = lootRng(ctx.state.seed, zoneId, containerId);
  return rollTable(ctx, table, Math.max(1, danger), rng, SKILL.bonusFindChance(rank(ctx, 'scavenging')));
}
