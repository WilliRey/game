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

import { ZoneDef } from '@/content/schemas';
import { buildZone } from '@/sim/build';
import { getRuntime, type ZoneRuntime } from '@/sim/runtime';
import { newZombie } from '@/sim/spawn';
import type { Zombie, ZoneState } from '@/sim/types';

/** Inject a small test zone into the shared content and make it the active zone. */
export function arena(
  ctx: GameContext,
  id: string,
  map: string[],
  extra: Partial<Record<string, unknown>> = {},
): { zone: ZoneState; rt: ZoneRuntime } {
  const def = ZoneDef.parse({ id, danger: 1, map, ...extra });
  ctx.content.zones[id] = def;
  const zone = buildZone(ctx, id);
  ctx.state.zone = zone;
  return { zone, rt: getRuntime(ctx.content, zone) };
}

export function addZombie(
  ctx: GameContext,
  zone: ZoneState,
  type: string,
  x: number,
  y: number,
  facing = 0,
): Zombie {
  const z = newZombie(ctx, zone, type, x, y)!;
  z.facing = facing;
  z.senseIn = 0;
  zone.zombies.push(z);
  return z;
}
