/** Transient UI state that isn't part of the game save: toasts, the hint queue and story cards. */
import type { GameStore, ScreenId } from '@/core/store';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'good';
  until: number;
}

export const uiState = {
  toasts: [] as Toast[],
  hints: [] as string[],
  cards: [] as { title: string; body: string }[],
};

let toastId = 0;

export function pushToast(store: GameStore, text: string, kind: Toast['kind'] = 'info'): void {
  const now = performance.now();
  // Collapse identical consecutive toasts.
  const last = uiState.toasts[uiState.toasts.length - 1];
  if (last && last.text === text && last.until > now) {
    last.until = now + 3500;
    return;
  }
  uiState.toasts.push({ id: ++toastId, text, kind, until: now + 3500 });
  if (uiState.toasts.length > 5) uiState.toasts.shift();
  store.notify();
}

/** Screens the world can ask for (from interactions and effects). */
export function openScreen(store: GameStore, screen: ScreenId, props?: Record<string, unknown>): void {
  store.open(screen, props);
}

/** Wire bus events from the systems to the UI. Lives for the whole app, not a session. */
export function installUiBridge(store: GameStore): void {
  const bus = store.bus;
  bus.on('ui:open', ({ screen, props }) => openScreen(store, screen, props));
  bus.on('ui:toast', ({ text, kind }) => pushToast(store, text, kind ?? 'info'));
  bus.on('ui:textCard', (card) => {
    uiState.cards.push({ title: card.title, body: card.body });
    if (!store.isOpen('textCard')) store.open('textCard');
    else store.notify();
  });
  bus.on('hint:show', ({ hintId }) => {
    uiState.hints.push(hintId);
    store.notify();
  });
  bus.on('player:died', ({ cause }) => {
    store.closeAll();
    store.open('death', { cause });
  });
  bus.on('session:reset', () => {
    uiState.toasts = [];
    uiState.hints = [];
    uiState.cards = [];
  });
}
