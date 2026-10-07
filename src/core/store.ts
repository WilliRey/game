import type { Content } from '@/content';
import type { Difficulty } from '@/config/balance';
import { EventBus } from './events';
import { Rng } from './rng';
import type { GameState, SettingsState } from './types';
import { DEFAULT_SETTINGS } from './types';

/** What every system receives. Pure modules take a GameContext; nothing in here touches Phaser or the DOM. */
export interface GameContext {
  state: GameState;
  content: Content;
  bus: EventBus;
  rng: Rng;
  settings: SettingsState;
}

export type ScreenId =
  | 'mainMenu'
  | 'pause'
  | 'settings'
  | 'inventory'
  | 'loot'
  | 'crafting'
  | 'workbench'
  | 'trade'
  | 'dialogue'
  | 'journal'
  | 'zoneMap'
  | 'worldMap'
  | 'sleep'
  | 'death'
  | 'textCard'
  | 'saves'
  | 'newGame'
  | 'stash'
  | 'travelEvent'
  | 'skills'
  | 'console'
  | 'credits';

/**
 * Screens that stop the game clock while open (brief §5 "Clock behavior"). The inventory, loot window and
 * journal are deliberately absent: in the field the world keeps moving unless the player opts into
 * `inventoryPausesClock` (DESIGN decision 16).
 */
export const CLOCK_STOPPING: ReadonlySet<ScreenId> = new Set<ScreenId>([
  'mainMenu',
  'pause',
  'settings',
  'crafting',
  'workbench',
  'trade',
  'dialogue',
  'zoneMap',
  'worldMap',
  'sleep',
  'death',
  'textCard',
  'saves',
  'newGame',
  'stash',
  'travelEvent',
  'skills',
  'console',
  'credits',
]);
const INVENTORY_LIKE: ReadonlySet<ScreenId> = new Set<ScreenId>(['inventory', 'loot', 'journal']);

export interface ScreenEntry {
  id: ScreenId;
  props?: Record<string, unknown>;
}

export type Phase = 'boot' | 'menu' | 'playing';

/**
 * The single owner of game state at runtime. Systems get the GameContext; presentation reads
 * `store.state` and subscribes via `store.subscribe` for re-render notifications.
 */
export class GameStore {
  ctx: GameContext;
  screens: ScreenEntry[] = [];
  phase: Phase = 'boot';
  version = 0;
  /** Unsubscribers for listeners that live as long as one play session (quests, hints, autosave...). */
  private sessionDisposers: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private flushPending = false;

  constructor(content: Content, settings: SettingsState = loadSettings()) {
    const bus = new EventBus();
    this.ctx = {
      state: null as unknown as GameState,
      content,
      bus,
      rng: Rng.fromSeed('unset'),
      settings,
    };
    bus.on('ui:refresh', () => this.notify());
  }

  get state(): GameState {
    return this.ctx.state;
  }
  get content(): Content {
    return this.ctx.content;
  }
  get bus(): EventBus {
    return this.ctx.bus;
  }
  get settings(): SettingsState {
    return this.ctx.settings;
  }
  get hasGame(): boolean {
    return this.ctx.state !== null;
  }

  /** Install a state (new game or loaded save) and re-attach the RNG to its stored stream. */
  setState(state: GameState): void {
    this.ctx.state = state;
    this.ctx.rng = new Rng(state.rng);
    this.notify();
  }

  /** Register a listener that is removed when the session ends (new game, load, quit to menu). */
  addSessionDisposer(fn: () => void): void {
    this.sessionDisposers.push(fn);
  }
  endSession(): void {
    for (const d of this.sessionDisposers.splice(0)) d();
  }

  setPhase(phase: Phase): void {
    this.phase = phase;
    this.notify();
  }

  // ---- UI stack ----
  get topScreen(): ScreenEntry | undefined {
    return this.screens[this.screens.length - 1];
  }
  isOpen(id: ScreenId): boolean {
    return this.screens.some((s) => s.id === id);
  }
  open(id: ScreenId, props?: Record<string, unknown>): void {
    this.screens = this.screens.filter((s) => s.id !== id);
    this.screens.push({ id, props });
    this.notify();
  }
  close(id?: ScreenId): void {
    if (id) this.screens = this.screens.filter((s) => s.id !== id);
    else this.screens.pop();
    this.notify();
  }
  closeAll(): void {
    this.screens = [];
    this.notify();
  }
  toggle(id: ScreenId, props?: Record<string, unknown>): void {
    if (this.isOpen(id)) this.close(id);
    else this.open(id, props);
  }
  /** True when a screen that stops the game clock is open. */
  get clockStopped(): boolean {
    if (this.phase !== 'playing') return true;
    for (const s of this.screens) {
      if (CLOCK_STOPPING.has(s.id)) return true;
      if (INVENTORY_LIKE.has(s.id) && this.ctx.settings.inventoryPausesClock) return true;
    }
    return false;
  }
  /** True when the player should not receive movement/attack input (any screen that captures keys). */
  get inputCaptured(): boolean {
    return this.screens.length > 0;
  }

  // ---- change notification ----
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  /** Schedule a UI refresh. Batched to one flush per frame. */
  notify(): void {
    this.version++;
    if (this.flushPending) return;
    this.flushPending = true;
    const flush = () => {
      this.flushPending = false;
      for (const l of [...this.listeners]) l();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else queueMicrotask(flush);
  }

  saveSettings(): void {
    try {
      localStorage.setItem('holdout.settings', JSON.stringify(this.ctx.settings));
    } catch {
      /* storage unavailable */
    }
    this.notify();
  }
}

export function loadSettings(): SettingsState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('holdout.settings') : null;
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<SettingsState>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}

export function newUid(state: GameState, prefix = 'u'): string {
  state.nextUid += 1;
  return `${prefix}${state.nextUid.toString(36)}`;
}

export type { Difficulty };
