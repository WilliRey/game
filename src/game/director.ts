/** Switches views in response to session and zone events, and buffers scripted camera pans. */
import type { GameEvents } from '@/core/events';
import type { GameStore } from '@/core/store';
import { enterZone } from '@/systems/zones';
import type { GameHandle, ViewKey } from './createGame';

/** A pan requested by an effect, waiting for the zone view (which may be rebuilding) to play it. */
export const cinematics: { pending: GameEvents['fx:pan'] | null } = { pending: null };

export function installDirector(game: GameHandle, store: GameStore): void {
  const bus = store.bus;
  const switchTo = (key: ViewKey) => {
    setTimeout(() => game.show(key), 0);
  };
  bus.on('fx:pan', (p) => {
    cinematics.pending = p;
  });
  bus.on('session:reset', () => {
    cinematics.pending = null;
  });
  bus.on('session:started', () => switchTo('zone'));
  bus.on('session:ended', () => switchTo('title'));
  bus.on('zone:loaded', () => {
    if (store.phase === 'playing') switchTo('zone');
  });
  bus.on('travel:zone', ({ zoneId, entry }) => {
    setTimeout(() => enterZone(store.ctx, zoneId, entry), 0);
  });
}
