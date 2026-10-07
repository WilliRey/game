/** XP, levels, skill points and the per-rank skill bonuses (brief: each rank a small, clear bonus). */
import { BALANCE } from '@/config/balance';
import type { GameContext } from '@/core/store';
import type { SkillId } from '@/core/types';

/** Total XP needed to reach `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  const p = BALANCE.progression;
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(p.xpPerLevelBase * Math.pow(p.xpPerLevelGrowth, l - 1));
  return total;
}

export function grantXp(ctx: GameContext, amount: number, source: string): void {
  if (amount <= 0) return;
  const pl = ctx.state.player;
  pl.xp += Math.round(amount);
  ctx.bus.emit('xp:gained', { amount: Math.round(amount), total: pl.xp, source });
  while (pl.xp >= xpForLevel(pl.level + 1)) {
    pl.level += 1;
    pl.skillPoints += 1;
    ctx.bus.emit('level:up', { level: pl.level });
    ctx.bus.emit('ui:toast', { text: `Level ${pl.level}! +1 skill point (K to spend)`, kind: 'good' });
  }
}

export function rank(ctx: GameContext, skill: SkillId): number {
  return ctx.state.player.skills[skill] ?? 0;
}

export function canRaise(ctx: GameContext, skill: SkillId): boolean {
  return ctx.state.player.skillPoints > 0 && rank(ctx, skill) < BALANCE.progression.maxSkillRank;
}

export function raiseSkill(ctx: GameContext, skill: SkillId): boolean {
  if (!canRaise(ctx, skill)) return false;
  ctx.state.player.skills[skill] += 1;
  ctx.state.player.skillPoints -= 1;
  ctx.bus.emit('ui:refresh', {});
  return true;
}

/** Skill bonuses in one place so the descriptions in skills.json stay honest. */
export const SKILL = {
  meleeDamage: (r: number) => 1 + 0.08 * r,
  meleeStamina: (r: number) => 1 - 0.05 * r,
  firearmSpread: (r: number) => 1 - 0.08 * r,
  reloadSpeed: (r: number) => 1 + 0.08 * r,
  searchTime: (r: number) => 1 - BALANCE.search.scavengingRankReduction * r,
  bonusFindChance: (r: number) => 0.05 * r,
  craftQuality: (r: number) => BALANCE.crafting.qualityPerCraftingRank * r,
  repairWear: (r: number) => 1 - 0.15 * r,
  needsDrain: (r: number) => 1 - 0.06 * r,
  healing: (r: number) => 1 + 0.1 * r,
  barter: (r: number) => BALANCE.trade.barterRankDiscount * r,
  noise: (r: number) => 1 - 0.08 * r,
  spotted: (r: number) => 1 - 0.05 * r,
};
