/**
 * Sam's background (BRIEF_V2 §4): a starting kit, skill spread, passive perk, an active ability on Q and
 * class-only gadget recipes, all from `classes.json`. Systems ask `perk(ctx)` for the multipliers and
 * `classOf(ctx)` for the rest; story text reads class-specific `{tokens}` through `story.text()`.
 */
import type { ClassDef, PerkModsT } from '@/content/schemas';
import type { Content } from '@/content';
import type { GameContext } from '@/core/store';
import type { SkillId } from '@/core/types';
import { addItem, equip } from './inventory';
import { learnRecipe } from './story';

export const DEFAULT_CLASS = 'mechanic';

/** The class definition for an id, falling back to the default (old saves, unknown ids). */
export function classDef(content: Content, classId: string | undefined): ClassDef {
  return (
    content.classes[classId ?? DEFAULT_CLASS] ?? content.classes[DEFAULT_CLASS] ?? content.lists.classes[0]!
  );
}

export function classOf(ctx: GameContext): ClassDef {
  return classDef(ctx.content, ctx.state.player.classId);
}

export type Perk = Required<PerkModsT>;

const NO_PERK: Perk = {
  repairCost: 1,
  repairWear: 1,
  craftTime: 1,
  vehicleRepairTime: 1,
  healing: 1,
  infectionRate: 1,
  firearmDamage: 1,
  reloadSpeed: 1,
  firearmSpread: 1,
  searchTime: 1,
  footstepNoise: 1,
  bonusFind: 0,
};

/** The current class's passive perk with every modifier filled in (1 = no change, 0 = no bonus). */
export function perk(ctx: GameContext): Perk {
  return { ...NO_PERK, ...classOf(ctx).perk.mods };
}

/** Can this class craft a recipe? Class gadgets belong to one class; everything else is open to all. */
export function recipeAllowed(ctx: GameContext, recipeClass: string | undefined): boolean {
  return !recipeClass || recipeClass === ctx.state.player.classId;
}

/**
 * Give a new game its class: kit (equipping weapons, armor and backpacks), starting skills, class
 * recipes and any blueprints in the kit.
 */
export function applyClassStart(ctx: GameContext): void {
  const cls = classOf(ctx);
  const pl = ctx.state.player;
  for (const [skill, r] of Object.entries(cls.skills) as [SkillId, number][])
    pl.skills[skill] = Math.max(pl.skills[skill] ?? 0, r);
  for (const k of cls.kit) {
    const def = ctx.content.items[k.itemId];
    if (!def) continue;
    if (def.blueprint) {
      learnRecipe(ctx, def.blueprint.recipeId, true);
      continue;
    }
    // Weapons, armor and backpacks go straight into their empty slots (addItem auto-equips); the kit's
    // melee weapon replaces whatever the common kit put there.
    const s = addItem(ctx, k.itemId, k.qty, 'start', k.mag !== undefined ? { mag: k.mag } : {})[0];
    if (s && def.weapon?.kind === 'melee') equip(ctx, s.uid, 'melee');
  }
  for (const r of cls.recipes) learnRecipe(ctx, r, true);
  pl.activeSlot = pl.equipment.melee ? 'melee' : pl.equipment.firearm1 ? 'firearm1' : 'melee';
}
