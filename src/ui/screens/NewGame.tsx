import { useState } from 'preact/hooks';
import { DIFFICULTY_PRESETS, type Difficulty } from '@/config/balance';
import { startNewGame } from '@/systems/session';
import { Modal } from '../components/Modal';
import { useStore } from '../context';

export function NewGame() {
  const store = useStore();
  const [pick, setPick] = useState<Difficulty>('survivor');
  const pct = (v: number) => `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  return (
    <Modal
      id="newGame"
      title="New game"
      width={760}
      footer={
        <>
          <button class="btn" onClick={() => store.close('newGame')}>
            Back
          </button>
          <button class="btn btn-primary" data-action="start" onClick={() => startNewGame(store, pick)}>
            Begin
          </button>
        </>
      }
    >
      <p class="muted">
        {store.content.names.city ?? 'Harrow City'}, day 23 of the outbreak. You are{' '}
        {store.content.names.sam ?? 'Sam Keller'}, a city bus mechanic. The food ran out this morning, and
        your sister Jo hasn't called since the city fell.
      </p>
      <div class="difficulty-cards">
        {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map((d) => {
          const p = DIFFICULTY_PRESETS[d];
          return (
            <button
              key={d}
              class={`diff-card ${pick === d ? 'selected' : ''}`}
              data-difficulty={d}
              onClick={() => setPick(d)}
            >
              <div class="diff-name">{p.label}</div>
              <div class="diff-desc">{p.description}</div>
              <ul class="diff-stats muted">
                <li>Damage taken {pct(p.playerDamageTaken)}</li>
                <li>Zombie health {pct(p.zombieHp)}</li>
                <li>Needs drain {pct(p.needsDrain)}</li>
                <li>Loot {pct(p.lootQuantity)}</li>
              </ul>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
