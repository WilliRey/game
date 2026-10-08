import { useState } from 'preact/hooks';
import { latestSave } from '@/systems/save';
import { quitToMenu } from '@/systems/session';
import { useStore } from '../context';

function sinceSave(): string {
  const m = latestSave();
  if (!m) return 'You have no save yet.';
  const min = Math.floor((Date.now() - m.savedAt) / 60000);
  return min < 1 ? 'Last saved just now.' : `Last saved ${min} min ago.`;
}

export function Pause() {
  const store = useStore();
  const [quitting, setQuitting] = useState(false);
  return (
    <div class="screen dim" data-screen="pause">
      <div class="pause-menu">
        <h2 class="pause-title">Paused</h2>
        <button class="btn btn-primary" onClick={() => store.close('pause')}>
          Resume
        </button>
        <button class="btn" onClick={() => store.open('saves', { mode: 'save' })}>
          Save game
        </button>
        <button class="btn" onClick={() => store.open('saves', { mode: 'load' })}>
          Load game
        </button>
        <button class="btn" onClick={() => store.open('settings')}>
          Settings
        </button>
        <button class="btn" onClick={() => store.open('skills')}>
          Skills
        </button>
        <button
          class="btn btn-danger"
          data-action="quit"
          onClick={() => (quitting ? quitToMenu(store) : setQuitting(true))}
        >
          {quitting ? 'Quit? Unsaved progress is lost' : 'Quit to main menu'}
        </button>
        <div class="muted small">{sinceSave()}</div>
        <div class="pause-keys muted">
          <span class="kbd">WASD</span> move · <span class="kbd">Shift</span> sprint ·{' '}
          <span class="kbd">C</span> crouch · <span class="kbd">E</span> interact ·{' '}
          <span class="kbd">LMB</span> attack · <span class="kbd">RMB</span> aim · <span class="kbd">R</span>{' '}
          reload · <span class="kbd">Space</span> shove · <span class="kbd">G</span> throw ·{' '}
          <span class="kbd">F</span> flashlight · <span class="kbd">1–4</span> weapons ·{' '}
          <span class="kbd">5–8</span> quick items · <span class="kbd">Tab</span> inventory ·{' '}
          <span class="kbd">J</span> journal · <span class="kbd">M</span> map · <span class="kbd">K</span>{' '}
          skills
        </div>
      </div>
    </div>
  );
}
