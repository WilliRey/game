import { loadContent, type Content } from '@/content';
import { GameStore, type GameContext } from '@/core/store';
import { installSession, newGameState, setupNewGame } from '@/systems/session';
import type { Difficulty } from '@/config/balance';

let cached: Content | null = null;
export function content(): Content {
  cached ??= loadContent();
  return cached;
}

/** A fresh game context with listeners installed, optionally with the new-game setup run. */
export function makeCtx(opts: { setup?: boolean; difficulty?: Difficulty; seed?: string } = {}): {
  store: GameStore;
  ctx: GameContext;
} {
  const store = new GameStore(content(), {
    masterVolume: 0,
    sfxVolume: 0,
    screenShake: false,
    damageNumbers: false,
    hints: true,
    uiScale: 1,
    inventoryPausesClock: false,
  });
  store.setState(newGameState(content(), opts.difficulty ?? 'survivor', opts.seed ?? 'test-seed'));
  installSession(store);
  if (opts.setup) setupNewGame(store.ctx);
  return { store, ctx: store.ctx };
}
