/**
 * Play sessions: creating a new game, installing the listeners that live for one session (quests,
 * hints, autosave), and tearing them down when the player quits or loads.
 */
import { BALANCE, type Difficulty } from '@/config/balance';
import type { Content } from '@/content';
import { Rng } from '@/core/rng';
import type { GameContext, GameStore } from '@/core/store';
import { startTime } from '@/core/time';
import type { GameState, TraderState } from '@/core/types';
import { SKILL_IDS } from '@/core/types';
import { addItem, equip } from './inventory';
import { installQuestListeners, startQuest } from './quests';
import { showHint } from './story';
import { enterZone } from './zones';

export const SAVE_VERSION = 1;

/** Session hooks registered by other modules (autosave, hints...) so this file stays small. */
const sessionInstallers: ((store: GameStore) => (() => void) | void)[] = [];
export function onSessionStart(fn: (store: GameStore) => (() => void) | void): void {
  sessionInstallers.push(fn);
}

export function newTraderState(startUnlocked: boolean): TraderState {
  return { stock: [], credit: 0, lastRestockMinutes: -1e9, restocks: 0, unlocked: startUnlocked };
}

export function newGameState(content: Content, difficulty: Difficulty, seed = randomSeed()): GameState {
  const rng = Rng.fromSeed(seed);
  const traders: Record<string, TraderState> = {};
  for (const t of content.lists.traders) traders[t.id] = newTraderState(t.startUnlocked);
  return {
    version: SAVE_VERSION,
    seed,
    difficulty,
    nextUid: 0,
    rng: { ...rng.state },
    time: startTime(),
    player: {
      hp: BALANCE.health.maxHp,
      maxHp: BALANCE.health.maxHp,
      stamina: BALANCE.health.maxStamina,
      maxStamina: BALANCE.health.maxStamina,
      hunger: BALANCE.start.hunger,
      thirst: BALANCE.start.thirst,
      xp: 0,
      level: 1,
      skillPoints: 0,
      skills: Object.fromEntries(SKILL_IDS.map((s) => [s, 0])) as GameState['player']['skills'],
      effects: [],
      inventory: [],
      equipment: {},
      quickSlots: [null, null, null, null],
      activeSlot: 'melee',
      flashlightOn: false,
      lastCombatAt: -1e9,
      godMode: false,
      noclip: false,
    },
    zone: null,
    zones: {},
    quests: {},
    trackedQuest: null,
    flags: {},
    reputation: 10,
    traders,
    base: {
      workbenchTier: 1,
      stoveTier: 1,
      reloadingBench: false,
      rainCollector: { built: false, stored: 0, lastTickMinutes: 0 },
      stash: [],
    },
    vehicle: { owned: false, fuel: 0, maxFuel: BALANCE.travel.vehicleTankLiters },
    world: {
      currentNode: BALANCE.start.node,
      knownNodes: content.lists.worldNodes.filter((n) => n.startKnown).map((n) => n.id),
      visitedNodes: [],
      seenEvents: [],
    },
    unlockedRecipes: [],
    notesRead: [],
    broadcastsHeard: [],
    hintsSeen: [],
    stats: { kills: 0, crafted: 0, containersSearched: 0, playSeconds: 0 },
  };
}

export function randomSeed(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(36);
}

/** Starting kit, opening quest and the first zone. */
export function setupNewGame(ctx: GameContext): void {
  for (const { itemId, qty } of BALANCE.start.items) addItem(ctx, itemId, qty, 'start');
  const wrench = ctx.state.player.inventory.find((s) => s.itemId === 'wrench');
  if (wrench) equip(ctx, wrench.uid, 'melee');
  ctx.state.player.activeSlot = 'melee';
  enterZone(ctx, BALANCE.start.zone);
  startQuest(ctx, BALANCE.start.quest);
  showHint(ctx, 'move');
}

/** Install the per-session listeners. */
export function installSession(store: GameStore): void {
  store.addSessionDisposer(installQuestListeners(store.ctx));
  for (const install of sessionInstallers) {
    const off = install(store);
    if (off) store.addSessionDisposer(off);
  }
}

export function startNewGame(store: GameStore, difficulty: Difficulty, seed?: string): void {
  store.endSession();
  store.setState(newGameState(store.content, difficulty, seed));
  installSession(store);
  setupNewGame(store.ctx);
  store.closeAll();
  store.setPhase('playing');
  store.bus.emit('session:started', { loaded: false });
}

/** Resume a loaded state (save/load system calls this). */
export function resumeGame(store: GameStore, state: GameState): void {
  store.endSession();
  store.setState(state);
  installSession(store);
  store.closeAll();
  store.setPhase('playing');
  store.bus.emit('session:started', { loaded: true });
}

export function quitToMenu(store: GameStore): void {
  store.endSession();
  store.setPhase('menu');
  store.closeAll();
  store.bus.emit('session:ended', {});
  store.open('mainMenu');
}
