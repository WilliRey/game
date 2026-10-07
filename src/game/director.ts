/** Switches Phaser scenes in response to session and zone events, and buffers scripted camera pans. */
import type Phaser from 'phaser';
import type { GameEvents } from '@/core/events';
import type { GameStore } from '@/core/store';
import { enterZone } from '@/systems/zones';

/** A pan requested by an effect, waiting for the zone scene (which may be restarting) to play it. */
export const cinematics: { pending: GameEvents['fx:pan'] | null } = { pending: null };

export function installDirector(game: Phaser.Game, store: GameStore): void {
  const bus = store.bus;
  const switchTo = (key: 'Title' | 'Zone') => {
    setTimeout(() => {
      for (const k of ['Title', 'Zone']) if (k !== key && game.scene.isActive(k)) game.scene.stop(k);
      if (game.scene.isActive(key)) game.scene.stop(key);
      game.scene.start(key);
    }, 0);
  };
  bus.on('fx:pan', (p) => {
    cinematics.pending = p;
  });
  bus.on('session:reset', () => {
    cinematics.pending = null;
  });
  bus.on('session:started', () => switchTo('Zone'));
  bus.on('session:ended', () => switchTo('Title'));
  bus.on('zone:loaded', () => {
    if (store.phase === 'playing') switchTo('Zone');
  });
  bus.on('travel:zone', ({ zoneId, entry }) => {
    setTimeout(() => enterZone(store.ctx, zoneId, entry), 0);
  });
}
