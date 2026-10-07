/**
 * World map travel (brief §5): walking costs game time, and so food and water at exertion rates, and may
 * trigger a travel event; places beyond `maxFootKm` are too far to walk. Driving is much faster with a
 * lower event chance but burns fuel. The vehicle travels with the player (DESIGN decision 37).
 *
 * Travel events are data (`travelEvents.json`): choices filtered by conditions, each with weighted
 * outcomes that run effects. Every roll uses the saved RNG.
 */
import { BALANCE, difficultyOf } from '@/config/balance';
import type { ConditionT, EffectT, TravelEventDef, WorldNodeDef } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { isNight } from '@/core/time';
import type { TravelMode } from '@/core/types';
import { getLayout } from '@/sim/layout';
import { passTime } from './clock';
import { checkAll, describeCondition } from './conditions';
import { applyEffects } from './effects';
import { countItem, removeItem } from './inventory';
import { SKILL, rank } from './progression';
import { getEffect } from './survival';
import { enterZone, leaveZone } from './zones';

export interface TravelOption {
  mode: TravelMode;
  available: boolean;
  /** Why the option is unavailable, or a warning when it is (forced march). */
  reason?: string;
  minutes: number;
  fuel: number;
  eventChance: number;
  hunger: number;
  thirst: number;
  /** Health lost on the way to bleeding, food poisoning and empty needs (not counting events). */
  hpLoss: number;
  /** A walk beyond the normal limit, allowed only when the player would otherwise be stranded. */
  forced?: boolean;
}

export interface TravelPlan {
  km: number;
  foot: TravelOption;
  vehicle: TravelOption;
}

export function worldNode(ctx: GameContext, id: string): WorldNodeDef | undefined {
  return ctx.content.worldNodes[id];
}

/** Straight-line distance between two nodes; map units are kilometres. */
export function distanceKm(a: WorldNodeDef, b: WorldNodeDef): number {
  return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 10) / 10;
}

/** Hunger and thirst lost per game minute while travelling. */
function drainPerMinute(ctx: GameContext, exertion: boolean): { hunger: number; thirst: number } {
  const n = BALANCE.needs;
  const mult =
    difficultyOf(ctx.state.difficulty).needsDrain *
    SKILL.needsDrain(rank(ctx, 'survival')) *
    (exertion ? n.exertionMultiplier : 1);
  return {
    hunger: (100 * mult) / (n.hungerHoursToEmpty * 60),
    thirst: (100 * mult) / (n.thirstHoursToEmpty * 60),
  };
}

/** Health lost over `minutes` of travel to bleeding, food poisoning and running out of food or water. */
export function projectedHpLoss(ctx: GameContext, minutes: number, exertion: boolean): number {
  const p = ctx.state.player;
  if (p.godMode) return 0;
  const n = BALANCE.needs;
  const h = BALANCE.health;
  const drain = drainPerMinute(ctx, exertion);
  let loss = 0;
  const bleed = getEffect(ctx, 'bleeding');
  if (bleed) loss += h.bleedHpPerMinute * Math.min(minutes, Math.max(0, bleed.value));
  const poison = getEffect(ctx, 'food_poisoning');
  if (poison) loss += h.foodPoisoningHpPerMinute * Math.min(minutes, Math.max(0, poison.value));
  const thirstRate = drain.thirst * (poison ? 1.6 : 1);
  loss += (Math.max(0, minutes - p.hunger / drain.hunger) * n.starvingHpPerHour) / 60;
  loss += (Math.max(0, minutes - p.thirst / thirstRate) * n.dehydratedHpPerHour) / 60;
  return loss;
}

function eventChance(ctx: GameContext, mode: TravelMode, km: number): number {
  const T = BALANCE.travel;
  const base = mode === 'foot' ? T.footEventChance : T.vehicleEventChance;
  const scale = Math.max(0.5, Math.min(1.5, km / T.eventReferenceKm));
  const night = isNight(ctx.state.time.minutes) ? T.nightEventMultiplier : 1;
  return Math.min(0.9, base * scale * night);
}

/** Litres in the tank plus what the fuel cans in the pack would add. */
export function fuelAvailable(ctx: GameContext): number {
  const per = ctx.content.items.fuel_can?.fuel?.liters ?? 5;
  return ctx.state.vehicle.fuel + countItem(ctx, 'fuel_can') * per;
}

/** True when no other known place can be reached normally: then walking any distance is allowed. */
export function isStranded(ctx: GameContext, fromId: string): boolean {
  const from = worldNode(ctx, fromId);
  if (!from) return false;
  const T = BALANCE.travel;
  const fuel = ctx.state.vehicle.owned ? fuelAvailable(ctx) : 0;
  for (const id of ctx.state.world.knownNodes) {
    const n = worldNode(ctx, id);
    if (!n || n.id === fromId || n.lockedText) continue;
    const km = distanceKm(from, n);
    if (km <= T.maxFootKm) return false;
    if (ctx.state.vehicle.owned && km * T.fuelPerKm <= fuel + 1e-9) return false;
  }
  return true;
}

/** Cost and availability of travelling from one node to another, on foot and by vehicle. */
export function travelPlan(ctx: GameContext, fromId: string, toId: string): TravelPlan {
  const T = BALANCE.travel;
  const from = worldNode(ctx, fromId);
  const to = worldNode(ctx, toId);
  const km = from && to ? distanceKm(from, to) : 0;
  const blocked = !from || !to ? 'Unknown place' : from.id === to.id ? 'You are here' : to.lockedText;

  const footMinutes = Math.round(km * T.footMinutesPerKm);
  const footDrain = drainPerMinute(ctx, true);
  const foot: TravelOption = {
    mode: 'foot',
    available: !blocked,
    reason: blocked,
    minutes: footMinutes,
    fuel: 0,
    eventChance: eventChance(ctx, 'foot', km),
    hunger: footDrain.hunger * footMinutes,
    thirst: footDrain.thirst * footMinutes,
    hpLoss: projectedHpLoss(ctx, footMinutes, true),
  };
  if (!blocked && km > T.maxFootKm) {
    if (isStranded(ctx, fromId)) {
      foot.forced = true;
      foot.minutes = Math.round(footMinutes * T.forcedMarchTimeMultiplier);
      foot.hunger = footDrain.hunger * foot.minutes;
      foot.thirst = footDrain.thirst * foot.minutes;
      foot.hpLoss = projectedHpLoss(ctx, foot.minutes, true);
      foot.eventChance = Math.min(0.9, foot.eventChance * 1.5);
      foot.reason = 'A long, dangerous walk. Nothing else is in reach.';
    } else {
      foot.available = false;
      foot.reason = `Too far to walk (${km} km; ${T.maxFootKm} km at most)`;
    }
  }

  const fuel = Math.round(km * T.fuelPerKm * 10) / 10;
  const vehicleMinutes = Math.max(1, Math.round(km * T.vehicleMinutesPerKm));
  const carDrain = drainPerMinute(ctx, false);
  const v = ctx.state.vehicle;
  const vehicle: TravelOption = {
    mode: 'vehicle',
    available: !blocked && v.owned && v.fuel + 1e-9 >= fuel,
    reason:
      blocked ??
      (!v.owned
        ? 'No vehicle'
        : v.fuel + 1e-9 < fuel
          ? `Not enough fuel (needs ${fuel} L, tank has ${Math.floor(v.fuel * 10) / 10} L)`
          : undefined),
    minutes: vehicleMinutes,
    fuel,
    eventChance: eventChance(ctx, 'vehicle', km),
    hunger: carDrain.hunger * vehicleMinutes,
    thirst: carDrain.thirst * vehicleMinutes,
    hpLoss: projectedHpLoss(ctx, vehicleMinutes, false),
  };
  return { km, foot, vehicle };
}

/** Pour every fuel can that fits into the tank. Returns litres added. */
export function refuelVehicle(ctx: GameContext): number {
  const v = ctx.state.vehicle;
  if (!v.owned) return 0;
  const per = ctx.content.items.fuel_can?.fuel?.liters ?? 5;
  let added = 0;
  while (countItem(ctx, 'fuel_can') > 0 && v.fuel + per <= v.maxFuel + 0.01) {
    removeItem(ctx, 'fuel_can', 1, 'refuel');
    v.fuel = Math.min(v.maxFuel, v.fuel + per);
    added += per;
  }
  if (added > 0) ctx.bus.emit('sfx:play', { key: 'siphon' });
  return added;
}

// ---------------------------------------------------------------- the journey

function eligibleEvents(ctx: GameContext, mode: TravelMode): TravelEventDef[] {
  return ctx.content.travelEvents.filter(
    (e) =>
      e.modes.includes(mode) &&
      !(e.once && ctx.state.world.seenEvents.includes(e.id)) &&
      checkAll(ctx, e.if) &&
      e.choices.some((c) => checkAll(ctx, c.if)),
  );
}

/**
 * Leave the current zone and travel. Time passes (needs drain), fuel burns, and an event may interrupt
 * the trip; without one the player arrives straight away. Returns an error message when travel isn't
 * possible.
 */
export function startTravel(ctx: GameContext, toId: string, mode: TravelMode): string | null {
  const s = ctx.state;
  const from = s.world.currentNode;
  const plan = travelPlan(ctx, from, toId);
  const opt = mode === 'foot' ? plan.foot : plan.vehicle;
  if (!opt.available) return opt.reason ?? 'You can’t go there.';
  s.travel = { from, to: toId, mode, km: plan.km, minutes: opt.minutes, fuel: opt.fuel };
  leaveZone(ctx);
  if (mode === 'vehicle') s.vehicle.fuel = Math.max(0, s.vehicle.fuel - opt.fuel);
  ctx.bus.emit('travel:started', { from, to: toId, mode });
  passTime(ctx, opt.minutes, 'travel', mode === 'foot');
  if (s.player.dead) return null;
  const pool = eligibleEvents(ctx, mode);
  if (pool.length > 0 && ctx.rng.chance(opt.eventChance)) {
    const ev = ctx.rng.weighted(pool.map((e) => ({ value: e, weight: e.weight })));
    s.travel.eventId = ev.id;
    if (!s.world.seenEvents.includes(ev.id)) s.world.seenEvents.push(ev.id);
    ctx.bus.emit('travel:event', { eventId: ev.id });
    return null;
  }
  arrive(ctx);
  return null;
}

/** Conditions worth showing on a disabled choice (the player can do something about them). */
const SHOW_DISABLED: ReadonlySet<ConditionT['type']> = new Set(['hasItem', 'skill', 'reputation']);

export interface EventChoiceView {
  index: number;
  text: string;
  enabled: boolean;
  reason?: string;
}

export function currentEvent(ctx: GameContext): TravelEventDef | undefined {
  const id = ctx.state.travel?.eventId;
  return id ? ctx.content.travelEvents.find((e) => e.id === id) : undefined;
}

export function eventChoices(ctx: GameContext): EventChoiceView[] {
  const ev = currentEvent(ctx);
  if (!ev) return [];
  const out: EventChoiceView[] = [];
  ev.choices.forEach((c, index) => {
    const failing = c.if.filter((cond) => !checkAll(ctx, [cond]));
    if (failing.length === 0) out.push({ index, text: c.text, enabled: true });
    else if (failing.every((f) => SHOW_DISABLED.has(f.type)))
      out.push({
        index,
        text: c.text,
        enabled: false,
        reason: failing.map((f) => describeCondition(ctx, f)).join(', '),
      });
  });
  return out;
}

/** Short, player-facing lines for what an outcome did ("+2 Scrap Metal", "−8 health"). */
export function summarizeEffects(ctx: GameContext, effects: readonly EffectT[]): string[] {
  const name = (id: string) => ctx.content.items[id]?.name ?? id;
  const out: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case 'giveItem':
        out.push(`+${e.qty} ${name(e.itemId)}`);
        break;
      case 'takeItem':
        out.push(`−${e.qty} ${name(e.itemId)}`);
        break;
      case 'damage':
        out.push(`−${e.hp} health`);
        break;
      case 'heal':
        if (e.hp) out.push(`+${e.hp} health`);
        break;
      case 'needs':
        if (e.hunger) out.push(`${e.hunger > 0 ? '+' : '−'}${Math.abs(e.hunger)} food`);
        if (e.thirst) out.push(`${e.thirst > 0 ? '+' : '−'}${Math.abs(e.thirst)} water`);
        break;
      case 'fuel':
        out.push(`${e.liters > 0 ? '+' : '−'}${Math.abs(e.liters)} L fuel`);
        break;
      case 'time':
        out.push(`+${e.minutes} min`);
        break;
      case 'reputation':
        out.push(`${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)} camp reputation`);
        break;
      case 'xp':
        out.push(`+${e.amount} XP`);
        break;
      case 'unlockNode':
        out.push(`New location: ${ctx.content.worldNodes[e.nodeId]?.name ?? e.nodeId}`);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Take a choice: roll one of its weighted outcomes and apply it. Returns the outcome text. */
export function chooseEventOption(ctx: GameContext, index: number): string | null {
  const t = ctx.state.travel;
  const ev = currentEvent(ctx);
  const choice = ev?.choices[index];
  if (!t || !ev || !choice || t.choice !== undefined || !checkAll(ctx, choice.if)) return null;
  const outcome = ctx.rng.weighted(choice.outcomes.map((o) => ({ value: o, weight: o.weight })));
  t.choice = index;
  t.outcomeText = outcome.text;
  t.outcomeSummary = summarizeEffects(ctx, outcome.effects);
  applyEffects(ctx, outcome.effects, `travel:${ev.id}`);
  return outcome.text;
}

/** Finish the journey: enter the destination zone. */
export function arrive(ctx: GameContext): void {
  const s = ctx.state;
  const t = s.travel;
  if (!t || s.player.dead) return;
  const dest = worldNode(ctx, t.to);
  s.travel = null;
  if (!dest) return;
  enterZone(ctx, dest.zoneId, dest.entry);
  const h = Math.floor(t.minutes / 60);
  const m = t.minutes % 60;
  const took = h > 0 ? `${h} h ${m} min` : `${m} min`;
  ctx.bus.emit('ui:toast', {
    text: `Arrived at ${dest.name ?? dest.id} · ${took}${t.mode === 'vehicle' ? ` · ${t.fuel} L fuel` : ''}`,
    kind: 'info',
  });
  ctx.bus.emit('travel:arrived', { nodeId: dest.id, mode: t.mode });
}

/** Searched / total containers across every zone of a node (a node can span several zones). */
export function nodeSearched(ctx: GameContext, nodeId: string): { searched: number; total: number } {
  const n = worldNode(ctx, nodeId);
  if (!n) return { searched: 0, total: 0 };
  let searched = 0;
  let total = 0;
  for (const z of ctx.content.lists.zones) {
    if (z.id !== n.zoneId && z.exitNode !== n.id) continue;
    const mem = ctx.state.zones[z.id];
    const live = ctx.state.zone?.zoneId === z.id ? ctx.state.zone : null;
    const containers = live ? Object.values(live.containers) : mem ? Object.values(mem.containers) : null;
    if (containers) {
      total += containers.length;
      searched += containers.filter((c) => c.searched).length;
    } else total += getLayout(ctx.content, z.id).containers.length;
  }
  return { searched, total };
}
