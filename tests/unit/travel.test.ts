/**
 * World map travel: walking costs time and needs, far places need the vehicle, driving burns fuel,
 * stranded players can always walk home, and travel events are deterministic per save.
 */
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/store';
import { BALANCE } from '@/config/balance';
import { addItem, countItem } from '@/systems/inventory';
import { addEffect } from '@/systems/survival';
import {
  arrive,
  chooseEventOption,
  eventChoices,
  isStranded,
  refuelVehicle,
  startTravel,
  travelPlan,
} from '@/systems/travel';
import { enterZone } from '@/systems/zones';
import { makeCtx } from './helpers';

function at(nodeZone: string, seed = 'travel'): GameContext {
  const { ctx } = makeCtx({ setup: true, seed });
  for (const n of ctx.content.lists.worldNodes)
    if (!ctx.state.world.knownNodes.includes(n.id)) ctx.state.world.knownNodes.push(n.id);
  enterZone(ctx, nodeZone);
  return ctx;
}

/** Resolve whatever event interrupted the trip with its first enabled choice, then arrive. */
function finishTrip(ctx: GameContext): void {
  if (ctx.state.travel?.eventId) {
    const c = eventChoices(ctx).find((x) => x.enabled)!;
    expect(chooseEventOption(ctx, c.index)).toBeTypeOf('string');
    arrive(ctx);
  }
}

describe('travel plans', () => {
  it('walking costs time and needs; St. Agnes is too far on foot', () => {
    const ctx = at('firehouse9');
    const near = travelPlan(ctx, 'firehouse9', 'route17');
    expect(near.km).toBeGreaterThan(3);
    expect(near.foot.available).toBe(true);
    expect(near.foot.minutes).toBeGreaterThan(60);
    expect(near.foot.hunger).toBeGreaterThan(2);
    expect(near.foot.thirst).toBeGreaterThan(near.foot.hunger);
    const far = travelPlan(ctx, 'firehouse9', 'st_agnes');
    expect(far.foot.available).toBe(false);
    expect(far.foot.reason).toMatch(/Too far/);
    expect(far.vehicle.available).toBe(false);
    expect(far.vehicle.reason).toBe('No vehicle');
  });

  it('driving is faster, burns fuel, and needs enough of it', () => {
    const ctx = at('firehouse9');
    ctx.state.vehicle.owned = true;
    ctx.state.vehicle.fuel = 2;
    const p = travelPlan(ctx, 'firehouse9', 'st_agnes');
    expect(p.vehicle.available).toBe(false);
    expect(p.vehicle.reason).toMatch(/Not enough fuel/);
    // The repaired ambulance comes with 10 L: enough to reach the hospital.
    ctx.state.vehicle.fuel = 10;
    const q = travelPlan(ctx, 'firehouse9', 'st_agnes');
    expect(q.vehicle.available).toBe(true);
    expect(q.vehicle.fuel).toBeLessThanOrEqual(10);
    expect(q.vehicle.minutes).toBeLessThan(travelPlan(ctx, 'firehouse9', 'route17').foot.minutes);
    expect(q.vehicle.eventChance).toBeLessThan(travelPlan(ctx, 'firehouse9', 'route17').foot.eventChance);
  });

  it('forecasts health lost on the way to bleeding and empty needs', () => {
    const ctx = at('firehouse9');
    expect(travelPlan(ctx, 'firehouse9', 'route17').foot.hpLoss).toBe(0);
    addEffect(ctx, 'bleeding', BALANCE.health.bleedMinutes);
    const bleeding = travelPlan(ctx, 'firehouse9', 'route17').foot.hpLoss;
    expect(bleeding).toBeCloseTo(BALANCE.health.bleedMinutes * BALANCE.health.bleedHpPerMinute, 1);
    ctx.state.player.thirst = 0;
    expect(travelPlan(ctx, 'firehouse9', 'route17').foot.hpLoss).toBeGreaterThan(bleeding + 5);
  });

  it('locked places and the current place cannot be travelled to', () => {
    const ctx = at('firehouse9');
    expect(travelPlan(ctx, 'firehouse9', 'northgate_bridge').foot.available).toBe(false);
    expect(travelPlan(ctx, 'firehouse9', 'firehouse9').foot.reason).toBe('You are here');
  });

  it('a stranded player can always walk home, slowly', () => {
    const ctx = at('st_agnes');
    ctx.state.vehicle.owned = true;
    ctx.state.vehicle.fuel = 0;
    expect(isStranded(ctx, 'st_agnes')).toBe(true);
    const p = travelPlan(ctx, 'st_agnes', 'firehouse9');
    expect(p.foot.available).toBe(true);
    expect(p.foot.forced).toBe(true);
    // Fuel cans in the pack count: then the drive home is possible and the long walk is not offered.
    addItem(ctx, 'fuel_can', 2);
    expect(isStranded(ctx, 'st_agnes')).toBe(false);
    expect(travelPlan(ctx, 'st_agnes', 'firehouse9').foot.available).toBe(false);
  });
});

describe('journeys', () => {
  it('walking passes time, drains needs and arrives at the destination', () => {
    const ctx = at('firehouse9');
    const s = ctx.state;
    s.player.hunger = 90;
    s.player.thirst = 90;
    const plan = travelPlan(ctx, 'firehouse9', 'route17');
    const t0 = s.time.minutes;
    expect(startTravel(ctx, 'route17', 'foot')).toBeNull();
    finishTrip(ctx);
    expect(s.time.minutes - t0).toBeGreaterThanOrEqual(plan.foot.minutes);
    expect(90 - s.player.hunger).toBeGreaterThanOrEqual(plan.foot.hunger - 0.01);
    expect(90 - s.player.thirst).toBeGreaterThanOrEqual(plan.foot.thirst - 0.01);
    expect(s.zone?.zoneId).toBe('route17');
    expect(s.world.currentNode).toBe('route17');
    expect(s.travel).toBeNull();
    // The zone we left is remembered.
    expect(s.zones.firehouse9).toBeDefined();
  });

  it('driving uses fuel and arrives quickly', () => {
    const ctx = at('firehouse9');
    const s = ctx.state;
    s.vehicle.owned = true;
    s.vehicle.fuel = 30;
    const plan = travelPlan(ctx, 'firehouse9', 'st_agnes');
    const t0 = s.time.minutes;
    expect(startTravel(ctx, 'st_agnes', 'vehicle')).toBeNull();
    finishTrip(ctx);
    expect(s.vehicle.fuel).toBeCloseTo(30 - plan.vehicle.fuel, 5);
    expect(s.zone?.zoneId).toBe('st_agnes');
    expect(s.time.minutes - t0).toBeGreaterThanOrEqual(plan.vehicle.minutes);
  });

  it('refuses a trip that is not possible', () => {
    const ctx = at('firehouse9');
    expect(startTravel(ctx, 'st_agnes', 'foot')).toMatch(/Too far/);
    expect(ctx.state.zone?.zoneId).toBe('firehouse9');
    expect(ctx.state.travel).toBeNull();
  });

  it('events and their outcomes are deterministic for a save', () => {
    const run = (seed: string) => {
      const ctx = at('firehouse9', seed);
      const log: string[] = [];
      for (let i = 0; i < 8; i++) {
        const to = ctx.state.world.currentNode === 'firehouse9' ? 'route17' : 'firehouse9';
        startTravel(ctx, to, 'foot');
        if (ctx.state.travel?.eventId) {
          const c = eventChoices(ctx).find((x) => x.enabled)!;
          log.push(`${ctx.state.travel.eventId}:${chooseEventOption(ctx, c.index)}`);
          arrive(ctx);
        } else log.push('-');
        ctx.state.player.hunger = 100;
        ctx.state.player.thirst = 100;
        ctx.state.player.hp = 100;
      }
      return log;
    };
    const a = run('det-1');
    expect(run('det-1')).toEqual(a);
    expect(a.some((x) => x !== '-')).toBe(true);
  });

  it('pours fuel cans into the tank only while they fit', () => {
    const ctx = at('firehouse9');
    ctx.state.vehicle.owned = true;
    ctx.state.vehicle.fuel = 28;
    addItem(ctx, 'fuel_can', 3);
    expect(refuelVehicle(ctx)).toBe(10);
    expect(ctx.state.vehicle.fuel).toBe(38);
    expect(countItem(ctx, 'fuel_can')).toBe(1);
  });
});
