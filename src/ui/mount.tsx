import { render } from 'preact';
import type { GameStore } from '@/core/store';
import type { GameHandle } from '@/game/createGame';
import { App } from './App';
import { StoreContext } from './context';
import { installUiKeys } from './keys';
import { installUiBridge } from './uiState';

const VIEW_W = 1280;

/**
 * Mounts the Preact overlay and keeps it (and the in-world UI layer) exactly over the letterboxed, scaled
 * game canvas. All UI is authored in 1280×720 logical pixels and scaled with a CSS transform.
 */
export function mountUI(store: GameStore, el: HTMLElement, game: GameHandle): void {
  const worldUi = document.getElementById('world-ui');
  const fit = () => {
    const r = game.canvas.getBoundingClientRect();
    if (r.width === 0) return;
    for (const layer of [el, worldUi]) {
      if (!layer) continue;
      layer.style.left = `${r.left + window.scrollX}px`;
      layer.style.top = `${r.top + window.scrollY}px`;
      layer.style.transform = `scale(${r.width / VIEW_W})`;
    }
  };
  window.addEventListener('resize', () => requestAnimationFrame(fit));
  game.onResize(() => requestAnimationFrame(fit));
  const poll = setInterval(fit, 500);
  window.addEventListener('beforeunload', () => clearInterval(poll));
  installUiBridge(store);
  installUiKeys(store);
  render(
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>,
    el,
  );
  fit();
}
