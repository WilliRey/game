import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/config/balance';
import { passTime } from '@/systems/clock';
import { addItem } from '@/systems/inventory';
import { addEffect, damagePlayer, getEffect, hasEffect, useItem } from '@/systems/survival';
import { makeCtx } from './helpers';

describe('needs', () => {
  it('hunger empties in ~50 game hours and thirst in ~30', () => {
    const { ctx } = makeCtx();
    const p = ctx.state.player;
    p.hunger = 100;
    p.thirst = 100;
    p.godMode = true;
    passTime(ctx, 30 * 60);
    expect(p.thirst).toBeLessThan(1);
    expect(p.hunger).toBeCloseTo(100 - (30 / BALANCE.needs.hungerHoursToEmpty) * 100, 0);
    passTime(ctx, 20 * 60);
    expect(p.hunger).toBeLessThan(1);
  });

  it('drains faster with exertion and slower asleep', () => {
    const a = makeCtx().ctx;
    const b = makeCtx().ctx;
    const c = makeCtx().ctx;
    for (const x of [a, b, c]) x.state.player.hunger = 100;
    passTime(a, 600, 'active', false);
    passTime(b, 600, 'active', true);
    passTime(c, 600, 'sleep');
    const lost = (x: typeof a) => 100 - x.state.player.hunger;
    expect(lost(b) / lost(a)).toBeCloseTo(BALANCE.needs.exertionMultiplier, 1);
    expect(lost(c) / lost(a)).toBeCloseTo(BALANCE.needs.sleepMultiplier, 1);
  });

  it('starving and dehydration cost health', () => {
    const { ctx } = makeCtx();
    const p = ctx.state.player;
    p.hunger = 0;
    p.thirst = 0;
    passTime(ctx, 60);
    expect(p.hp).toBeCloseTo(100 - BALANCE.needs.starvingHpPerHour - BALANCE.needs.dehydratedHpPerHour, 0);
  });
});

describe('status effects', () => {
  it('bleeding drains health until bandaged', () => {
    const { ctx } = makeCtx();
    addEffect(ctx, 'bleeding', BALANCE.health.bleedMinutes);
    passTime(ctx, 10);
    expect(ctx.state.player.hp).toBeLessThan(100);
    const b = addItem(ctx, 'bandage', 1)[0]!;
    useItem(ctx, b.uid);
    expect(hasEffect(ctx, 'bleeding')).toBe(false);
  });

  it('an untreated bleed clots on its own, so a long walk does not bleed you dry', () => {
    const { ctx } = makeCtx();
    // Fed enough not to starve, not enough for the well-fed regeneration to hide the loss.
    ctx.state.player.hunger = 75;
    ctx.state.player.thirst = 75;
    addEffect(ctx, 'bleeding', BALANCE.health.bleedMinutes);
    passTime(ctx, 180);
    expect(hasEffect(ctx, 'bleeding')).toBe(false);
    const lost = 100 - ctx.state.player.hp;
    expect(lost).toBeCloseTo(BALANCE.health.bleedMinutes * BALANCE.health.bleedHpPerMinute, 0);
  });

  it('infection progresses over days, antibiotics knock it back 40, untreated it kills', () => {
    const { ctx } = makeCtx();
    const p = ctx.state.player;
    addEffect(ctx, 'infection', 0);
    passTime(ctx, 24 * 60);
    const after1day = getEffect(ctx, 'infection')!.value;
    expect(after1day).toBeCloseTo(100 / 3, 0);
    const pills = addItem(ctx, 'antibiotics', 1)[0]!;
    useItem(ctx, pills.uid);
    expect(getEffect(ctx, 'infection')).toBeUndefined();
    addEffect(ctx, 'infection', 10);
    p.hunger = 100;
    p.thirst = 100;
    for (let h = 0; h < 72 && !p.dead; h++) {
      p.hunger = 100;
      p.thirst = 100;
      passTime(ctx, 60);
    }
    expect(p.dead).toBe(true);
  });

  it('raw food can cause food poisoning which wears off', () => {
    const { ctx } = makeCtx({ seed: 'poison' });
    let poisoned = false;
    for (let i = 0; i < 20 && !poisoned; i++) {
      const m = addItem(ctx, 'raw_meat', 1)[0]!;
      useItem(ctx, m.uid);
      poisoned = hasEffect(ctx, 'food_poisoning');
    }
    expect(poisoned).toBe(true);
    ctx.state.player.hp = 100;
    passTime(ctx, BALANCE.health.foodPoisoningMinutes + 5);
    expect(hasEffect(ctx, 'food_poisoning')).toBe(false);
  });

  it('well-fed regenerates slowly; zombie hits can infect (armor helps)', () => {
    const { ctx } = makeCtx();
    const p = ctx.state.player;
    p.hp = 50;
    p.hunger = 100;
    p.thirst = 100;
    passTime(ctx, 30);
    expect(hasEffect(ctx, 'well_fed')).toBe(true);
    expect(p.hp).toBeGreaterThan(50);
    let infected = 0;
    for (let i = 0; i < 400; i++) {
      p.hp = 100;
      p.effects = [];
      damagePlayer(ctx, 1, 'walker', { infectionChance: 0.05 });
      if (hasEffect(ctx, 'infection')) infected++;
    }
    expect(infected).toBeGreaterThan(5);
    expect(infected).toBeLessThan(45);
  });
});
