/** Evaluates the shared Condition type used by dialogue choices, quests, travel events, triggers and radio. */
import type { ConditionT } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { dayOf, isNight } from '@/core/time';
import type { SkillId } from '@/core/types';
import { countItem } from './inventory';

export function knowsRecipe(ctx: GameContext, recipeId: string): boolean {
  const r = ctx.content.recipes[recipeId];
  if (!r) return false;
  return !r.requiresBlueprint || ctx.state.unlockedRecipes.includes(recipeId);
}

export function checkCondition(ctx: GameContext, c: ConditionT): boolean {
  const s = ctx.state;
  switch (c.type) {
    case 'hasItem':
      return countItem(ctx, c.itemId) >= c.qty;
    case 'quest': {
      const q = s.quests[c.questId];
      if (c.status === 'notStarted' && q) return false;
      if (c.status === 'started' && !q) return false;
      if (c.status && c.status !== 'notStarted' && c.status !== 'started' && q?.status !== c.status)
        return false;
      if (c.stage !== undefined && (!q || q.status !== 'active' || q.stage !== c.stage)) return false;
      if (c.minStage !== undefined && (!q || (q.status === 'active' && q.stage < c.minStage))) return false;
      if (c.outcome !== undefined && q?.outcome !== c.outcome) return false;
      return true;
    }
    case 'flag': {
      const v = s.flags[c.key];
      if (c.value === undefined) return !!v;
      return v === c.value;
    }
    case 'skill':
      return (s.player.skills[c.skill as SkillId] ?? 0) >= c.rank;
    case 'reputation':
      return s.reputation >= c.min;
    case 'time':
      return isNight(s.time.minutes) === c.night;
    case 'recipeKnown':
      return knowsRecipe(ctx, c.recipeId);
    case 'vehicle':
      return s.vehicle.owned === c.owned;
    case 'day':
      return dayOf(s.time.minutes) >= c.min;
    case 'not':
      return !checkCondition(ctx, c.cond);
    case 'any':
      return c.conds.some((cc) => checkCondition(ctx, cc));
  }
}

export function checkAll(ctx: GameContext, conds: readonly ConditionT[] | undefined): boolean {
  if (!conds) return true;
  for (const c of conds) if (!checkCondition(ctx, c)) return false;
  return true;
}

/** Short human text for a failed condition (shown on disabled dialogue choices). */
export function describeCondition(ctx: GameContext, c: ConditionT): string {
  switch (c.type) {
    case 'hasItem':
      return `Needs ${c.qty > 1 ? `${c.qty}× ` : ''}${ctx.content.items[c.itemId]?.name ?? c.itemId}`;
    case 'skill':
      return `${ctx.content.skills[c.skill]?.name ?? c.skill} ${c.rank}`;
    case 'reputation':
      return `Reputation ${c.min}`;
    case 'time':
      return c.night ? 'At night' : 'By day';
    default:
      return '';
  }
}
