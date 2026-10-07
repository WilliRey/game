import { useStore } from '../context';

export function MainMenu() {
  const store = useStore();
  const names = store.content.names;
  return (
    <div class="screen main-menu" data-screen="mainMenu">
      <div class="title-block">
        <h1 class="game-title">{names.game ?? 'HOLDOUT'}</h1>
        <div class="tagline">Day 23. The food ran out this morning.</div>
      </div>
      <nav class="menu-buttons">
        <button class="btn btn-primary" data-action="new-game" onClick={() => store.open('newGame')}>
          New Game
        </button>
        <button class="btn" data-action="load-game" onClick={() => store.open('saves', { mode: 'load' })}>
          Load Game
        </button>
        <button class="btn" onClick={() => store.open('settings')}>
          Settings
        </button>
      </nav>
      <div class="menu-footer">v0.1 · placeholder art and sound · keyboard + mouse</div>
    </div>
  );
}
