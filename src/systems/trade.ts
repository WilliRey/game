/**
 * Barter (brief §5 Trading): money is worthless, so every deal is goods for goods. Traders mark up what
 * they sell and pay less for what they buy, pay more for categories they want and less for junk, and give
 * better rates with camp reputation and the Barter skill. Item condition affects value. Overpayment is
 * kept as credit with that trader. Stock restocks every few days and grows with reputation and flags.
 *
 * No-exploit invariant: for any item and any reputation/skill, what a trader pays you for it is strictly
 * less than what they charge you to buy it back (sell prices round up, buy prices round down).
 */
import { BALANCE } from '@/config/balance';
import { Rng } from '@/core/rng';
import type { GameContext } from '@/core/store';
import type { ItemStack, Uid } from '@/core/types';
import { addStack, findStack, mergeInto, removeStack, takeStackFromList } from './inventory';
import { condition, createStack } from './items';
import { SKILL, rank } from './progression';

/** Value of one unit of a stack, before trader rates: base value × condition × quality. */
export function unitValue(ctx: GameContext, s: ItemStack): number {
  const def = ctx.content.items[s.itemId];
  if (!def) return 0;
  const T = BALANCE.trade;
  const cond = s.maxDurability ? T.conditionFloor + (1 - T.conditionFloor) * condition(s) : 1;
  return def.value * cond * (s.quality ?? 1);
}

/** Discount fraction 0..(0.15 + 0.10) from camp reputation and the Barter skill. */
export function tradeDiscount(ctx: GameContext): number {
  const T = BALANCE.trade;
  return (
    T.reputationMaxDiscount * Math.max(0, Math.min(1, ctx.state.reputation / 100)) +
    SKILL.barter(rank(ctx, 'barter'))
  );
}

/** What the trader charges you per unit. Rounded up. */
export function sellPrice(ctx: GameContext, _traderId: string, s: ItemStack): number {
  const v = unitValue(ctx, s);
  if (v <= 0) return 0;
  return Math.max(1, Math.ceil(v * BALANCE.trade.sellMarkup * (1 - tradeDiscount(ctx)) - 1e-9));
}

/** What the trader pays you per unit. Rounded down; never reaches their sell price. */
export function buyPrice(ctx: GameContext, traderId: string, s: ItemStack): number {
  const def = ctx.content.items[s.itemId];
  const t = ctx.content.traders[traderId];
  if (!def || !t) return 0;
  const T = BALANCE.trade;
  const cat = t.wants.includes(def.category)
    ? T.wantedCategoryMultiplier
    : t.junk.includes(def.category)
      ? T.junkMultiplier
      : 1;
  const raw = unitValue(ctx, s) * T.buyRate * cat * (1 + tradeDiscount(ctx) * 0.5);
  const cap = sellPrice(ctx, traderId, s) - 1;
  return Math.max(0, Math.min(Math.floor(raw + 1e-9), cap));
}

// ---------------------------------------------------------------- stock

export function restockIfDue(ctx: GameContext, traderId: string, force = false): void {
  const t = ctx.state.traders[traderId];
  const def = ctx.content.traders[traderId];
  if (!t || !def) return;
  const now = ctx.state.time.minutes;
  if (!force && now - t.lastRestockMinutes < def.restockDays * 1440) return;
  t.restocks += 1;
  t.lastRestockMinutes = now;
  const rng = Rng.fromSeed(`${ctx.state.seed}:trader:${traderId}:${t.restocks}`);
  const stock: ItemStack[] = [];
  for (const e of def.stock) {
    if (ctx.state.reputation < e.minRep) continue;
    if (e.flag && !ctx.state.flags[e.flag]) continue;
    if (!rng.chance(e.chance)) continue;
    const qty = rng.int(e.qty[0], e.qty[1]);
    if (qty <= 0) continue;
    const item = ctx.content.items[e.itemId];
    if (!item) continue;
    let left = qty;
    while (left > 0) {
      const n = Math.min(item.stack, left);
      const s = createStack(ctx.state, ctx.content, e.itemId, n);
      if (s.maxDurability) s.durability = Math.round(s.maxDurability * rng.range(0.7, 1));
      if (item.weapon?.firearm) s.mag = 0;
      mergeInto(ctx, stock, s);
      left -= n;
    }
  }
  t.stock = stock;
}

// ---------------------------------------------------------------- deals

export interface Line {
  uid: Uid;
  qty: number;
}

export interface Quote {
  offerValue: number;
  requestValue: number;
  credit: number;
  /** Offer + credit covers the request. */
  ok: boolean;
  /** Credit left with the trader after the deal. */
  creditAfter: number;
}

export function quote(ctx: GameContext, traderId: string, offer: Line[], request: Line[]): Quote {
  const t = ctx.state.traders[traderId]!;
  let offerValue = 0;
  for (const l of offer) {
    const s = findStack(ctx, l.uid);
    if (s) offerValue += buyPrice(ctx, traderId, s) * Math.min(l.qty, s.qty);
  }
  let requestValue = 0;
  for (const l of request) {
    const s = t.stock.find((x) => x.uid === l.uid);
    if (s) requestValue += sellPrice(ctx, traderId, s) * Math.min(l.qty, s.qty);
  }
  const ok = offerValue + t.credit >= requestValue && (offer.length > 0 || request.length > 0);
  return {
    offerValue,
    requestValue,
    credit: t.credit,
    ok,
    creditAfter: Math.max(0, t.credit + offerValue - requestValue),
  };
}

export function executeTrade(
  ctx: GameContext,
  traderId: string,
  offer: Line[],
  request: Line[],
): { ok: boolean; message: string } {
  const t = ctx.state.traders[traderId];
  if (!t) return { ok: false, message: 'No trader.' };
  const q = quote(ctx, traderId, offer, request);
  if (!q.ok) return { ok: false, message: 'Your offer does not cover it.' };
  const given: ItemStack[] = [];
  const taken: ItemStack[] = [];
  for (const l of offer) {
    const s = removeStack(ctx, l.uid, l.qty, 'traded');
    if (!s) continue;
    given.push(s);
    mergeInto(ctx, t.stock, s);
  }
  for (const l of request) {
    const s = takeStackFromList(ctx, t.stock, l.uid, l.qty);
    if (!s) continue;
    taken.push(s);
    addStack(ctx, s, 'trade');
  }
  t.credit = q.creditAfter;
  ctx.bus.emit('trade:completed', { traderId, given, taken });
  const name = ctx.content.traders[traderId]?.name ?? 'The trader';
  return {
    ok: true,
    message: q.creditAfter > 0 ? `Deal. ${name} owes you ${q.creditAfter} in credit.` : 'Deal.',
  };
}
