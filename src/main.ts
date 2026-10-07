import './ui/styles.css';
import { ContentError, loadContent } from './content';
import { GameStore } from './core/store';
import { createGame } from './game/createGame';
import { mountUI } from './ui/mount';

function fatal(message: string): void {
  const el = document.getElementById('ui') ?? document.body;
  el.innerHTML = '';
  const box = document.createElement('pre');
  box.className = 'fatal';
  box.textContent = `HOLDOUT failed to start.\n\n${message}`;
  el.appendChild(box);
}

function boot(): void {
  let content;
  try {
    content = loadContent();
  } catch (e) {
    fatal(e instanceof ContentError ? e.message : String(e));
    throw e;
  }
  const store = new GameStore(content);
  const game = createGame(store, document.getElementById('game')!);
  mountUI(store, document.getElementById('ui')!, game);
  // Exposed for the Playwright smoke test and the browser console.
  (window as unknown as { holdout: unknown }).holdout = { store, game };
}

boot();
