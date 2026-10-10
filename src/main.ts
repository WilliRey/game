import './ui/styles.css';
import { ContentError, loadContent } from './content';
import { GameStore } from './core/store';
import { AudioManager } from './game/audio/AudioManager';
import { loadOverrides } from './game/art/assets';
import { createGame } from './game/createGame';
import { mountUI } from './ui/mount';
import { runCommand } from './dev/console';
import { devTools } from './dev/devtools';
import { installSaveBridge } from './systems/persistence';

function fatal(message: string): void {
  const el = document.getElementById('ui') ?? document.body;
  el.innerHTML = '';
  const box = document.createElement('pre');
  box.className = 'fatal';
  box.textContent = `HOLDOUT failed to start.\n\n${message}`;
  el.appendChild(box);
}

async function boot(): Promise<void> {
  let content;
  try {
    content = loadContent();
  } catch (e) {
    fatal(e instanceof ContentError ? e.message : String(e));
    throw e;
  }
  const store = new GameStore(content);
  installSaveBridge(store);
  const audio = new AudioManager(store);
  // Real models/textures listed in the asset overrides (none ship) load before anything is drawn.
  await loadOverrides();
  const game = createGame(store, document.getElementById('game')!, audio);
  mountUI(store, document.getElementById('ui')!, game);
  game.show('title');
  store.setPhase('menu');
  store.open('mainMenu');
  // Exposed for the Playwright tests and the browser console; `cmd` runs debug-console commands.
  (window as unknown as { holdout: unknown }).holdout = {
    store,
    game,
    cmd: devTools.enabled ? (line: string) => runCommand(store, line) : undefined,
  };
}

void boot();
