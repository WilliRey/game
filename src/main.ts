import './ui/styles.css';
import { ContentError, loadContent } from './content';
import { GameStore } from './core/store';
import { AudioManager } from './game/audio/AudioManager';
import { createGame } from './game/createGame';
import { mountUI } from './ui/mount';
import { runCommand } from './dev/console';
import { devTools } from './dev/devtools';

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
  game.registry.set('audio', new AudioManager(store));
  mountUI(store, document.getElementById('ui')!, game);
  // Exposed for the Playwright tests and the browser console; `cmd` runs debug-console commands.
  (window as unknown as { holdout: unknown }).holdout = {
    store,
    game,
    cmd: devTools.enabled ? (line: string) => runCommand(store, line) : undefined,
  };
}

boot();
