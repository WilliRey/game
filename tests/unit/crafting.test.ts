import { describe, expect, it } from 'vitest';
import { buildUpgrade, collectWater, rainCollectorStored, rest, upgradeState } from '@/systems/base';
import { passTime } from '@/systems/clock';
import {
  attachMod,
  craft,
  craftContext,
  detachMod,
  dismantle,
  recipeStatus,
  repair,
} from '@/systems/crafting';
import { addItem, countItem, findStack } from '@/systems/inventory';
import { weaponStats } from '@/systems/items';
import { learnRecipe } from '@/systems/story';
import { arena, makeCtx } from './helpers';

describe('crafting', () => {
  it('needs the blueprint, the station tier and the materials', () => {
    const { ctx } = makeCtx();
    const r = ctx.content.recipes.nail_bat!;
    const bench = craftContext(ctx, 'workbench', 1);
    expect(recipeStatus(ctx, r, bench).known).toBe(false);
    learnRecipe(ctx, 'nail_bat');
    expect(recipeStatus(ctx, r, bench).canCraft).toBe(false);
    addItem(ctx, 'bat', 1);
    addItem(ctx, 'nails', 2);
    expect(recipeStatus(ctx, r, craftContext(ctx, 'inventory')).canCraft).toBe(false);
    expect(recipeStatus(ctx, r, bench).canCraft).toBe(true);
    const res = craft(ctx, 'nail_bat', bench);
    expect(res.ok).toBe(true);
    expect(countItem(ctx, 'nail_bat')).toBe(1);
    expect(countItem(ctx, 'bat')).toBe(0);
    expect(countItem(ctx, 'nails')).toBe(0);
  });

  it('crafted quality rises with bench tier and the Crafting skill', () => {
    const q = (tier: number, skill: number) => {
      const { ctx } = makeCtx();
      ctx.state.player.skills.crafting = skill;
      addItem(ctx, 'cloth', 6);
      addItem(ctx, 'duct_tape', 2);
      return craft(ctx, 'padded_jacket', craftContext(ctx, 'workbench', tier)).stack!.quality ?? 1;
    };
    expect(q(2, 0)).toBeGreaterThan(q(1, 0));
    expect(q(1, 3)).toBeGreaterThan(q(1, 0));
  });

  it('higher-tier recipes need an upgraded bench', () => {
    const { ctx } = makeCtx();
    addItem(ctx, 'spring', 2);
    addItem(ctx, 'scrap_metal', 2);
    expect(
      recipeStatus(ctx, ctx.content.recipes.extended_mag!, craftContext(ctx, 'workbench', 1)).canCraft,
    ).toBe(false);
    expect(
      recipeStatus(ctx, ctx.content.recipes.extended_mag!, craftContext(ctx, 'workbench', 2)).canCraft,
    ).toBe(true);
  });

  it('cooking at the stove makes raw food safe', () => {
    const { ctx } = makeCtx();
    addItem(ctx, 'dirty_water', 1);
    const r = craft(ctx, 'boiled_water', craftContext(ctx, 'stove', 1));
    expect(r.ok).toBe(true);
    expect(countItem(ctx, 'boiled_water')).toBe(1);
  });

  it('crafting time passes on the clock', () => {
    const { ctx } = makeCtx();
    addItem(ctx, 'cloth', 3);
    const t = ctx.state.time.minutes;
    craft(ctx, 'bandage', craftContext(ctx, 'inventory'));
    expect(ctx.state.time.minutes - t).toBeCloseTo(ctx.content.recipes.bandage!.timeMinutes);
  });
});

describe('mods, repair and dismantle', () => {
  it('a suppressor cuts gunshot noise; detaching gives it back', () => {
    const { ctx } = makeCtx();
    const gun = addItem(ctx, 'pistol_9mm', 1)[0]!;
    const sup = addItem(ctx, 'suppressor', 1)[0]!;
    const before = weaponStats(ctx.content, gun);
    expect(attachMod(ctx, gun.uid, sup.uid).ok).toBe(true);
    const after = weaponStats(ctx.content, findStack(ctx, gun.uid)!);
    expect(before?.kind === 'firearm' && after?.kind === 'firearm' && after.noise < before.noise).toBe(true);
    expect(countItem(ctx, 'suppressor')).toBe(0);
    expect(detachMod(ctx, gun.uid, 'muzzle').ok).toBe(true);
    expect(countItem(ctx, 'suppressor')).toBe(1);
  });

  it('mods only fit their slot and weapon type', () => {
    const { ctx } = makeCtx();
    const bat = addItem(ctx, 'bat', 1)[0]!;
    const sup = addItem(ctx, 'suppressor', 1)[0]!;
    expect(attachMod(ctx, bat.uid, sup.uid).ok).toBe(false);
    const choke = addItem(ctx, 'choke', 1)[0]!;
    const pistol = addItem(ctx, 'pistol_9mm', 1)[0]!;
    expect(attachMod(ctx, pistol.uid, choke.uid).ok).toBe(false);
  });

  it('repair restores durability but lowers max durability; dismantle returns parts', () => {
    const { ctx } = makeCtx();
    const w = addItem(ctx, 'crowbar', 1)[0]!;
    w.durability = 10;
    const max = w.maxDurability!;
    addItem(ctx, 'scrap_metal', 1);
    addItem(ctx, 'duct_tape', 1);
    const bench = craftContext(ctx, 'workbench', 1);
    expect(repair(ctx, w.uid, bench).ok).toBe(true);
    expect(w.maxDurability).toBeLessThan(max);
    expect(w.durability).toBe(w.maxDurability);
    expect(dismantle(ctx, w.uid).ok).toBe(true);
    expect(countItem(ctx, 'crowbar')).toBe(0);
    expect(countItem(ctx, 'scrap_metal')).toBeGreaterThan(0);
  });
});

describe('safehouse', () => {
  it('upgrades cost materials (from pack and stash) and raise the tier', () => {
    const { ctx } = makeCtx();
    arena(ctx, 'base_a', ['#####', '#P..#', '#####'], { safe: true });
    const u = ctx.content.stationUpgrades.find((x) => x.station === 'workbench' && x.tier === 2)!;
    expect(upgradeState(ctx, u)).toBe('available');
    expect(buildUpgrade(ctx, u).ok).toBe(false);
    addItem(ctx, 'scrap_metal', 6);
    addItem(ctx, 'mechanical_parts', 2);
    addItem(ctx, 'duct_tape', 2);
    expect(buildUpgrade(ctx, u).ok).toBe(true);
    expect(ctx.state.base.workbenchTier).toBe(2);
    expect(countItem(ctx, 'scrap_metal')).toBe(0);
  });

  it('the rain collector fills with dirty water over time, up to its capacity', () => {
    const { ctx } = makeCtx();
    ctx.state.base.rainCollector = { built: true, stored: 0, lastTickMinutes: ctx.state.time.minutes };
    passTime(ctx, 180 * 2 + 10);
    expect(rainCollectorStored(ctx)).toBe(2);
    passTime(ctx, 180 * 20);
    expect(rainCollectorStored(ctx)).toBe(6);
    expect(collectWater(ctx)).toBe(6);
    expect(countItem(ctx, 'dirty_water')).toBeGreaterThanOrEqual(6);
  });

  it('sleeping heals slowly and drains needs at half rate', () => {
    const { ctx } = makeCtx();
    const p = ctx.state.player;
    p.hp = 50;
    p.hunger = 90;
    p.thirst = 90;
    rest(ctx, 8, 'sleep');
    expect(p.hp).toBeGreaterThan(50 + 8 * 5);
    expect(p.thirst).toBeGreaterThan(90 - (8 / 30) * 100 * 0.6);
  });
});
