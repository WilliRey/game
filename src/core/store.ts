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
  | 'console';

/** Screens that stop the game clock while open (brief §5 "Clock behavior"). */
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
  'journal',
]);

export interface ScreenEntry {
  id: ScreenId;
  props?: Record<string, unknown>;
}

/**
 * The single owner of game state at runtime. Systems get the GameContext; presentation reads
 * `store.ctx.state` and subscribes to `store.subscribe` for re-render notifications.
 */
export class GameStore {
  ctx: GameContext;
  screens: ScreenEntry[] = [];
  version = 0;
  private listeners = new Set<() => void>();
  private rafPending = false;

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
  get hasGame(): boolean {
    return this.ctx.state !== null;
  }

  /** Install a state (new game or loaded save) and re-attach the RNG to its stored stream. */
  setState(state: GameState): void {
    this.ctx.state = state;
    this.ctx.rng = new Rng(state.rng);
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
    for (const s of this.screens) {
      if (CLOCK_STOPPING.has(s.id)) return true;
      if (s.id === 'inventory' && this.ctx.settings.inventoryPausesClock) return true;
      if (s.id === 'loot') return true;
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
  notify(): void {
    this.version++;
    if (this.rafPending) return;
    this.rafPending = true;
    const flush = () => {
      this.rafPending = false;
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
