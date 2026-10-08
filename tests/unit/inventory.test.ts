import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/config/balance';
import {
  addItem,
  carriedWeight,
  carryCapacity,
  countItem,
  dropItem,
  equip,
  isEncumbered,
  removeItem,
  setQuickSlot,
  stashItem,
  unstashItem,
} from '@/systems/inventory';
import { updateEncumbrance } from '@/systems/survival';
import { arena, makeCtx } from './helpers';

describe('inventory', () => {
  it('stacks up to the item stack size and splits the rest', () => {
    const { ctx } = makeCtx();
    addItem(ctx, 'canned_beans', 7);
    addItem(ctx, 'canned_beans', 7);
    const stacks = ctx.state.player.inventory.filter((s) => s.itemId === 'canned_beans');
    expect(stacks.map((s) => s.qty).sort()).toEqual([10, 4].sort());
    expect(countItem(ctx, 'canned_beans')).toBe(14);
    expect(countItem(ctx, 'cat:food')).toBe(14);
  });

  it('weapons never stack and carry durability', () => {
    const { ctx } = makeCtx();
    addItem(ctx, 'bat', 1);
    addItem(ctx, 'bat', 1);
    const bats = ctx.state.player.inventory.filter((s) => s.itemId === 'bat');
    expect(bats.length).toBe(2);
    expect(bats[0]!.durability).toBe(ctx.content.items.bat!.durability);
  });

  it('weight, capacity, backpacks and encumbrance', () => {
    const { ctx } = makeCtx();
    expect(carryCapacity(ctx)).toBe(BALANCE.carry.base);
    addItem(ctx, 'car_battery', 1); // 12 kg
    addItem(ctx, 'wood_plank', 9); // 9 kg
    expect(carriedWeight(ctx)).toBeCloseTo(21);
    expect(isEncumbered(ctx)).toBe(true);
    expect(updateEncumbrance(ctx)).toBe(true);
    expect(ctx.state.player.effects.some((e) => e.id === 'encumbered')).toBe(true);
    const pack = addItem(ctx, 'school_backpack', 1)[0]!;
    expect(ctx.state.player.equipment.backpack).toBe(pack.uid);
    expect(carryCapacity(ctx)).toBe(BALANCE.carry.base + 8);
    expect(isEncumbered(ctx)).toBe(false);
  });

  it('removing items clears equipment and quick slots that referenced them', () => {
    const { ctx } = makeCtx();
    const water = addItem(ctx, 'water_bottle', 1)[0]!;
    setQuickSlot(ctx, 0, water.uid);
    const knife = addItem(ctx, 'knife', 1)[0]!;
    expect(equip(ctx, knife.uid, 'melee')).toBe(true);
    removeItem(ctx, 'water_bottle', 1);
    expect(ctx.state.player.quickSlots[0]).toBeNull();
    removeItem(ctx, 'knife', 1);
    expect(ctx.state.player.equipment.melee).toBeUndefined();
  });

  it('refuses to remove more than you have', () => {
    const { ctx } = makeCtx();
    addItem(ctx, 'nails', 2);
    expect(removeItem(ctx, 'nails', 3)).toBe(false);
    expect(countItem(ctx, 'nails')).toBe(2);
  });

  it('drops to the ground and moves to and from the stash', () => {
    const { ctx } = makeCtx();
    const { zone } = arena(ctx, 'inv_drop', ['#####', '#P..#', '#####']);
    const rope = addItem(ctx, 'cloth', 5)[0]!;
    expect(dropItem(ctx, rope.uid, 2)).toBe(true);
    expect(zone.items.length).toBe(1);
    expect(zone.items[0]!.stack.qty).toBe(2);
    expect(countItem(ctx, 'cloth')).toBe(3);
    const rest = ctx.state.player.inventory.find((s) => s.itemId === 'cloth')!;
    stashItem(ctx, rest.uid);
    expect(countItem(ctx, 'cloth')).toBe(0);
    expect(ctx.state.base.stash[0]!.qty).toBe(3);
    unstashItem(ctx, ctx.state.base.stash[0]!.uid);
    expect(countItem(ctx, 'cloth')).toBe(3);
  });
});
