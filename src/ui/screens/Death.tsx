import { dayOf } from '@/core/time';
import { latestSave } from '@/systems/save';
import { quitToMenu } from '@/systems/session';
import { useStore } from '../context';

const CAUSES: Record<string, string> = {
  infection: 'The infection took you.',
  starvation: 'You starved.',
  dehydration: 'You died of thirst.',
  'blood loss': 'You bled out.',
};

export function Death({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const cause = String(entry.props?.cause ?? '');
  const latest = latestSave();
  return (
    <div class="screen death-screen" data-screen="death">
      <div class="death-box">
        <h1>You died</h1>
        <p class="muted">{CAUSES[cause] ?? 'The dead got you.'}</p>
        <p class="muted">
          Day {dayOf(store.state.time.minutes)} · {store.state.stats.kills} kills
        </p>
        <div class="death-actions">
          {latest ? (
            <button
              class="btn btn-primary"
              data-action="load-last"
              onClick={() => store.bus.emit('ui:loadLatest', {})}
            >
              Load last save
              <span class="menu-sub">
                {latest.slot === 'auto' ? 'Autosave' : 'Saved'} · Day {latest.day} · {latest.clock} ·{' '}
                {latest.location}
              </span>
            </button>
          ) : null}
          <button class="btn" onClick={() => quitToMenu(store)}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
