/**
 * Saving and loading from the running game (brief §5): manual saves when it's safe, loading a slot into
 * the store, the autosave triggers (zone transitions, quest steps, sleeping in the bed) and "load the
 * last save" after death.
 */
import { BALANCE } from '@/config/balance';
import type { GameContext, GameStore } from '@/core/store';
import type { GameState } from '@/core/types';
import { latestSave, loadSlot, SaveError, writeSave, type SlotId } from './save';
import { onSessionStart, quitToMenu, resumeGame } from './session';
import { enterZone } from './zones';

function toast(store: GameStore, text: string, kind: 'info' | 'warn' | 'good'): void {
  store.bus.emit('ui:toast', { text, kind });
}

/** Why the game can't be saved right now, or null if it can. Autosaves also wait for decent health. */
export function saveBlocker(ctx: GameContext, auto = false): string | null {
  const s = ctx.state;
  if (!s) return 'No game in progress.';
  if (s.player.dead) return "You're dead.";
  if (s.travel || !s.zone) return 'Not while travelling.';
  const z = s.zone;
  const S = BALANCE.save;
  if (!z.safe) {
    const p = z.player;
    const hunted = z.zombies.some(
      (zb) =>
        zb.hp > 0 &&
        (zb.mode === 'chase' || zb.mode === 'attack') &&
        Math.hypot(zb.x - p.x, zb.y - p.y) < S.autosaveHuntRadius,
    );
    if (hunted) return "You can't save while the dead are hunting you.";
    if (auto && s.player.hp < S.autosaveMinHp) return 'Too hurt to autosave.';
  }
  if (auto && z.player.action?.kind === 'timed') return 'Busy.';
  return null;
}

/** Save to a slot. Manual saves explain why they can't happen; autosaves just wait. */
export function saveGame(store: GameStore, slot: SlotId, auto = false): boolean {
  const blocker = saveBlocker(store.ctx, auto);
  if (blocker) {
    if (!auto) toast(store, blocker, 'warn');
    return false;
  }
  try {
    writeSave(store.content, store.state, slot);
  } catch (e) {
    toast(store, `Couldn't save: ${e instanceof Error ? e.message : String(e)}`, 'warn');
    return false;
  }
  store.bus.emit('save:written', { slot, auto });
  toast(store, auto ? 'Autosaved' : 'Game saved', 'good');
  return true;
}

/** Replace the running game (or the main menu) with a saved one. */
export function loadGame(store: GameStore, slot: SlotId): boolean {
  let state: GameState;
  try {
    state = loadSlot(store.content, slot);
  } catch (e) {
    toast(store, e instanceof SaveError ? e.message : `Couldn't load: ${String(e)}`, 'warn');
    return false;
  }
  resumeGame(store, state);
  if (!store.state.zone) {
    // A save without a live zone (made by an older build, or the map changed): arrive at its node.
    const node = store.content.worldNodes[store.state.world.currentNode];
    enterZone(store.ctx, node?.zoneId ?? BALANCE.start.zone, node?.entry);
  }
  store.bus.emit('save:loaded', { slot });
  return true;
}

export function loadLatest(store: GameStore): boolean {
  const m = latestSave();
  return m ? loadGame(store, m.slot) : false;
}

/**
 * Autosave triggers. Requests are remembered and written as soon as it's safe (not hunted, not mid-
 * action, health above `autosaveMinHp`), so a quest step in the middle of a fight saves once it's over.
 */
function installAutosave(store: GameStore): () => void {
  const bus = store.bus;
  let pending: 'zone' | 'quest' | 'sleep' | null = null;
  let last = -Infinity;
  const request = (why: 'zone' | 'quest' | 'sleep') => () => {
    if (pending !== 'zone' && pending !== 'sleep') pending = why;
  };
  const offs = [
    bus.on('zone:entered', request('zone')),
    bus.on('quest:started', request('quest')),
    bus.on('quest:advanced', request('quest')),
    bus.on('quest:completed', request('quest')),
    bus.on('quest:failed', request('quest')),
    bus.on('player:slept', request('sleep')),
  ];
  const tick = () => {
    if (!pending || store.phase !== 'playing' || !store.hasGame) return;
    const now = performance.now();
    if (pending === 'quest' && now - last < BALANCE.save.autosaveMinIntervalSeconds * 1000) return;
    if (saveBlocker(store.ctx, true)) return;
    pending = null;
    last = now;
    saveGame(store, 'auto', true);
  };
  const timer = setInterval(tick, 400);
  return () => {
    clearInterval(timer);
    offs.forEach((off) => off());
  };
}

/** App-lifetime wiring: autosave for every session, and the death screen's "load last save". */
export function installSaveBridge(store: GameStore): void {
  onSessionStart(installAutosave);
  store.bus.on('ui:loadLatest', () => {
    if (!loadLatest(store)) quitToMenu(store);
  });
}
