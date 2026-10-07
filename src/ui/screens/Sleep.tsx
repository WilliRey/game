import { useState } from 'preact/hooks';
import { dayOf, formatClock } from '@/core/time';
import { rest } from '@/systems/base';
import { Modal } from '../components/Modal';
import { useStore } from '../context';

/** The bunk: sleep (heals slowly, drains needs at half rate, saves) or just wait. */
export function Sleep() {
  const store = useStore();
  const [hours, setHours] = useState(8);
  const [mode, setMode] = useState<'sleep' | 'wait'>('sleep');
  const t = store.state.time.minutes + hours * 60;
  const p = store.state.player;
  const warn = p.hunger < 25 || p.thirst < 25;
  return (
    <Modal
      id="sleep"
      title="Bunk"
      width={520}
      footer={
        <>
          <button class="btn" onClick={() => store.close('sleep')}>
            Cancel
          </button>
          <button
            class="btn btn-primary"
            data-action="rest"
            onClick={() => {
              store.close('sleep');
              rest(store.ctx, hours, mode);
              store.notify();
            }}
          >
            {mode === 'sleep' ? `Sleep ${hours} h` : `Wait ${hours} h`}
          </button>
        </>
      }
    >
      <div class="filter-row">
        <button class={`chip-btn ${mode === 'sleep' ? 'active' : ''}`} onClick={() => setMode('sleep')}>
          Sleep
        </button>
        <button class={`chip-btn ${mode === 'wait' ? 'active' : ''}`} onClick={() => setMode('wait')}>
          Wait
        </button>
      </div>
      <label class="setting">
        <span>Hours</span>
        <input
          type="range"
          min={1}
          max={12}
          step={1}
          value={hours}
          onInput={(e) => setHours(Number((e.target as HTMLInputElement).value))}
        />
        <span class="num">{hours} h</span>
      </label>
      <p>
        You'll {mode === 'sleep' ? 'wake' : 'be done'} on day {dayOf(t)} at {formatClock(t)}.
      </p>
      <p class="muted small">
        {mode === 'sleep'
          ? 'Sleeping heals slowly, needs drain at half rate, and the game saves when you wake.'
          : 'Waiting passes time at the normal rate.'}
      </p>
      {warn ? <p class="warn small">You're hungry or thirsty. Eat and drink before you sleep.</p> : null}
    </Modal>
  );
}
