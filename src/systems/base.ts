/**
 * The safehouse (brief §5 Safehouse & base): station upgrades paid in materials, the rain collector that
 * fills with dirty water over time, and the bunk for sleeping or waiting (which also saves).
 */
import { BALANCE } from '@/config/balance';
import type { StationUpgradeDef } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { passTime } from './clock';
import { available, craftContext } from './crafting';
import { addItem, countItem, takeFromList } from './inventory';
import { applyEffect } from './effects';

export type UpgradeState = 'built' | 'available' | 'locked' | 'needsPrevious';

export function stationTier(ctx: GameContext, station: StationUpgradeDef['station']): number {
  const b = ctx.state.base;
  switch (station) {
    case 'workbench':
      return b.workbenchTier;
    case 'stove':
      return b.stoveTier;
    case 'reloading':
      return b.reloadingBench ? 1 : 0;
    case 'rainCollector':
      return b.rainCollector.built ? 1 : 0;
  }
}

export function upgradeState(ctx: GameContext, u: StationUpgradeDef): UpgradeState {
  const tier = stationTier(ctx, u.station);
  if (tier >= u.tier) return 'built';
  if (u.requiresFlag && !ctx.state.flags[u.requiresFlag]) return 'locked';
  if (tier < u.tier - 1) return 'needsPrevious';
  return 'available';
}

export function canAffordUpgrade(ctx: GameContext, u: StationUpgradeDef): boolean {
  const cc = craftContext(ctx, 'workbench');
  return u.cost.every((c) => available(ctx, cc, c.itemId) >= c.qty);
}

export function buildUpgrade(ctx: GameContext, u: StationUpgradeDef): { ok: boolean; message: string } {
  if (upgradeState(ctx, u) !== 'available') return { ok: false, message: 'Not available.' };
  if (!canAffordUpgrade(ctx, u)) return { ok: false, message: 'Missing materials.' };
  for (const c of u.cost) {
    const fromPack = Math.min(c.qty, countItem(ctx, c.itemId));
    if (fromPack) takeFromList(ctx, ctx.state.player.inventory, c.itemId, fromPack);
    if (c.qty - fromPack > 0) takeFromList(ctx, ctx.state.base.stash, c.itemId, c.qty - fromPack);
    ctx.bus.emit('item:removed', { itemId: c.itemId, qty: c.qty, reason: 'upgrade' });
  }
  applyEffect(ctx, { type: 'baseUpgrade', station: u.station, tier: u.tier });
  passTime(ctx, 60, 'active');
  return { ok: true, message: u.description };
}

/** Lazily fill the rain collector for the time that has passed. Returns liters (units) stored. */
export function rainCollectorStored(ctx: GameContext): number {
  const rc = ctx.state.base.rainCollector;
  if (!rc.built) return 0;
  const B = BALANCE.base;
  const now = ctx.state.time.minutes;
  const produced = Math.floor((now - rc.lastTickMinutes) / B.rainCollectorMinutesPerUnit);
  if (produced > 0) {
    rc.stored = Math.min(B.rainCollectorCapacity, rc.stored + produced);
    rc.lastTickMinutes += produced * B.rainCollectorMinutesPerUnit;
  }
  if (rc.stored >= B.rainCollectorCapacity) rc.lastTickMinutes = now;
  return rc.stored;
}

export function collectWater(ctx: GameContext): number {
  const n = rainCollectorStored(ctx);
  if (n <= 0) {
    ctx.bus.emit('ui:toast', { text: 'The barrel is dry. Check back later.', kind: 'info' });
    return 0;
  }
  ctx.state.base.rainCollector.stored = 0;
  addItem(ctx, 'dirty_water', n, 'rain');
  ctx.bus.emit('ui:toast', { text: `Collected ${n}× dirty water. Boil it at the stove.`, kind: 'good' });
  ctx.bus.emit('sfx:play', { key: 'drink' });
  return n;
}

/** Sleep (heals, saves) or just wait. Stops early if something goes wrong (dying of thirst...). */
export function rest(ctx: GameContext, hours: number, mode: 'sleep' | 'wait'): void {
  const before = ctx.state.player.hp;
  passTime(ctx, hours * 60, mode === 'sleep' ? 'sleep' : 'active');
  if (mode === 'sleep') ctx.bus.emit('player:slept', { hours });
  const healed = Math.round(ctx.state.player.hp - before);
  ctx.bus.emit('ui:toast', {
    text:
      mode === 'sleep'
        ? `You slept ${hours} h.${healed > 0 ? ` +${healed} health.` : ''}`
        : `You waited ${hours} h.`,
    kind: 'info',
  });
}

export function installBaseListeners(ctx: GameContext): () => void {
  return ctx.bus.on('base:collectWater', () => collectWater(ctx));
}
