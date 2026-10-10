/** Global UI keys: Esc, Tab, J, M, K, ` (console) and F3 (debug overlay). Gameplay keys live in `game/input.ts`. */
import type { GameStore, ScreenId } from '@/core/store';
import { devTools } from '@/dev/devtools';

const NOT_ESCAPABLE: ReadonlySet<ScreenId> = new Set<ScreenId>(['death', 'mainMenu', 'travelEvent']);

export function installUiKeys(store: GameStore): void {
  window.addEventListener('keydown', (e) => {
    const el = document.activeElement as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    if (e.code === 'Backquote' && devTools.enabled && store.phase === 'playing') {
      e.preventDefault();
      store.toggle('console');
      return;
    }
    if (typing && e.code !== 'Escape') return;
    if (e.code === 'Tab') e.preventDefault();
    if (store.phase !== 'playing') {
      if (e.code === 'Escape') {
        const top = store.topScreen;
        if (top && top.id !== 'mainMenu') store.close(top.id);
      }
      return;
    }
    const top = store.topScreen;
    switch (e.code) {
      case 'Escape': {
        e.preventDefault();
        if (!top) store.open('pause');
        else if (!NOT_ESCAPABLE.has(top.id)) store.close(top.id);
        return;
      }
      case 'Tab':
      case 'KeyI':
        toggleIf(store, 'inventory');
        return;
      case 'KeyJ':
        toggleIf(store, 'journal');
        return;
      case 'KeyM':
        toggleIf(store, 'zoneMap');
        return;
      case 'KeyK':
        toggleIf(store, 'skills');
        return;
      case 'F3':
        if (devTools.enabled) {
          e.preventDefault();
          devTools.overlay = !devTools.overlay;
          store.notify();
        }
        return;
    }
  });
}

/** Toggle a screen, but don't open it over a modal that owns the player's attention. */
function toggleIf(store: GameStore, id: ScreenId): void {
  if (store.isOpen(id)) {
    store.close(id);
    return;
  }
  const top = store.topScreen;
  const replaceable: ScreenId[] = ['inventory', 'journal', 'zoneMap', 'skills', 'loot'];
  if (top && !replaceable.includes(top.id)) return;
  if (top) store.close(top.id);
  store.open(id);
}
