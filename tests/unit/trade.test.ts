import { describe, expect, it } from 'vitest';
import { addItem, countItem } from '@/systems/inventory';
import { createStack } from '@/systems/items';
import { buyPrice, executeTrade, quote, restockIfDue, sellPrice } from '@/systems/trade';
import { makeCtx } from './helpers';

describe('barter pricing', () => {
  it('no-exploit invariant: no item ever sells for more than it costs to buy back', () => {
    const { ctx } = makeCtx();
    const traders = ctx.content.lists.traders.map((t) => t.id);
    let checked = 0;
    for (const rep of [0, 25, 50, 75, 100]) {
      ctx.state.reputation = rep;
      for (const barter of [0, 3, 5]) {
        ctx.state.player.skills.barter = barter;
        for (const item of ctx.content.lists.items) {
          for (const cond of [1, 0.5, 0.05]) {
            const s = createStack(ctx.state, ctx.content, item.id, 1, { quality: cond === 0.5 ? 1.2 : 1 });
            if (s.maxDurability) s.durability = Math.round(s.maxDurability * cond);
            for (const t of traders) {
              const buy = buyPrice(ctx, t, s);
              const sell = sellPrice(ctx, t, s);
              if (item.value > 0)
                expect(buy, `${item.id} @${t} rep ${rep} barter ${barter}`).toBeLessThan(sell);
              else expect(buy).toBe(0);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('a sell-then-buy-back loop always loses value', () => {
    const { ctx } = makeCtx();
    ctx.state.reputation = 100;
    ctx.state.player.skills.barter = 5;
    const t = ctx.state.traders.vera!;
    t.unlocked = true;
    t.stock = [];
    const gun = addItem(ctx, 'pistol_9mm', 1)[0]!;
    executeTrade(ctx, 'vera', [{ uid: gun.uid, qty: 1 }], []);
    const credit = t.credit;
    expect(credit).toBeGreaterThan(0);
    const back = t.stock.find((s) => s.itemId === 'pistol_9mm')!;
    const q = quote(ctx, 'vera', [], [{ uid: back.uid, qty: 1 }]);
    expect(q.ok).toBe(false);
  });

  it('traders pay more for wanted categories and less for junk; reputation helps', () => {
    const { ctx } = makeCtx();
    const beans = createStack(ctx.state, ctx.content, 'canned_beans', 1);
    // Gus wants food, Vera treats it as junk.
    expect(buyPrice(ctx, 'gus', beans)).toBeGreaterThan(buyPrice(ctx, 'vera', beans));
    const knife = createStack(ctx.state, ctx.content, 'fire_axe', 1);
    ctx.state.reputation = 0;
    const low = sellPrice(ctx, 'vera', knife);
    ctx.state.reputation = 100;
    expect(sellPrice(ctx, 'vera', knife)).toBeLessThan(low);
  });

  it('worn items are worth less', () => {
    const { ctx } = makeCtx();
    const a = createStack(ctx.state, ctx.content, 'crowbar', 1);
    const b = createStack(ctx.state, ctx.content, 'crowbar', 1);
    b.durability = 10;
    expect(buyPrice(ctx, 'vera', b)).toBeLessThan(buyPrice(ctx, 'vera', a));
  });

  it('overpayment becomes credit that pays for later deals', () => {
    const { ctx } = makeCtx();
    const t = ctx.state.traders.gus!;
    t.stock = [createStack(ctx.state, ctx.content, 'cloth', 2)];
    const jewels = addItem(ctx, 'jewelry', 5)[0]!;
    const res = executeTrade(ctx, 'gus', [{ uid: jewels.uid, qty: 5 }], [{ uid: t.stock[0]!.uid, qty: 1 }]);
    expect(res.ok).toBe(true);
    expect(t.credit).toBeGreaterThan(0);
    expect(countItem(ctx, 'cloth')).toBe(1);
    const q = quote(ctx, 'gus', [], [{ uid: t.stock.find((s) => s.itemId === 'cloth')!.uid, qty: 1 }]);
    expect(q.ok).toBe(true);
  });

  it('stock restocks from tables, gated by reputation and flags, deterministic per save', () => {
    const a = makeCtx({ seed: 'shop' }).ctx;
    const b = makeCtx({ seed: 'shop' }).ctx;
    restockIfDue(a, 'vera', true);
    restockIfDue(b, 'vera', true);
    const sig = (x: typeof a) =>
      x.state.traders
        .vera!.stock.map((s) => `${s.itemId}${s.qty}`)
        .sort()
        .join();
    expect(sig(a)).toBe(sig(b));
    expect(a.state.traders.vera!.stock.some((s) => s.itemId === 'bp_crossbow')).toBe(false);
    a.state.flags.vera_trusts = true;
    restockIfDue(a, 'vera', true);
    expect(a.state.traders.vera!.stock.some((s) => s.itemId === 'bp_crossbow')).toBe(true);
  });
});
