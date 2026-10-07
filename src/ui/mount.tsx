import { render } from 'preact';
import type Phaser from 'phaser';
import type { GameStore } from '@/core/store';
import { App } from './App';
import { StoreContext } from './context';

const VIEW_W = 1280;

/**
 * Mounts the Preact overlay and keeps it exactly over the (letterboxed, scaled) Phaser canvas. All UI is
 * authored in 1280×720 logical pixels and scaled with a CSS transform.
 */
export function mountUI(store: GameStore, el: HTMLElement, game: Phaser.Game): void {
  const fit = () => {
    const canvas = game.canvas;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    if (r.width === 0) return;
    el.style.left = `${r.left + window.scrollX}px`;
    el.style.top = `${r.top + window.scrollY}px`;
    el.style.transform = `scale(${r.width / VIEW_W})`;
  };
  window.addEventListener('resize', () => requestAnimationFrame(fit));
  game.scale.on('resize', () => requestAnimationFrame(fit));
  game.events.once('ready', fit);
  const poll = setInterval(fit, 500);
  window.addEventListener('beforeunload', () => clearInterval(poll));
  render(
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>,
    el,
  );
  fit();
}
