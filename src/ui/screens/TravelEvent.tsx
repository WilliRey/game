import { useEffect, useState } from 'preact/hooks';
import { arrive, chooseEventOption, currentEvent, eventChoices } from '@/systems/travel';
import { text } from '@/systems/story';
import { useStore } from '../context';

/** An encounter on the road (brief §5 travel events): pick a choice, read what happened, carry on. */
export function TravelEvent() {
  const store = useStore();
  const ctx = store.ctx;
  const ev = currentEvent(ctx);
  const t = store.state.travel;
  const [, setTick] = useState(0);
  const opts = eventChoices(ctx);
  const resolved = t?.choice !== undefined;

  const pick = (index: number) => {
    chooseEventOption(ctx, index);
    setTick((n) => n + 1);
    store.notify();
  };
  const carryOn = () => {
    store.close('travelEvent');
    arrive(ctx);
    store.notify();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (resolved) {
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
          e.preventDefault();
          carryOn();
        }
        return;
      }
      const n = Number(e.key);
      const c = opts[n - 1];
      if (c?.enabled) {
        e.preventDefault();
        pick(c.index);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!ev || !t) return null;
  const dest = store.content.worldNodes[t.to];
  return (
    <div class="screen dim" data-screen="travelEvent">
      <div class="panel event-panel">
        <div class="event-kicker muted small">
          On the way to {dest?.name ?? t.to} · {t.mode === 'vehicle' ? 'driving' : 'on foot'}
        </div>
        <h2 class="event-title">{ev.title}</h2>
        <div class="event-text">
          {text(ctx, ev.text)
            .split('\n')
            .map((l, i) => (l ? <p key={i}>{l}</p> : null))}
        </div>
        {resolved ? (
          <>
            <div class="event-outcome">
              <div class="muted small">{ev.choices[t.choice!]?.text}</div>
              <p>{text(ctx, t.outcomeText ?? '')}</p>
              {t.outcomeSummary?.length ? (
                <div class="event-summary">
                  {t.outcomeSummary.map((line) => (
                    <span
                      key={line}
                      class={`tag ${line.endsWith(' min') ? '' : line.startsWith('−') ? 'bad' : 'good'}`}
                    >
                      {line}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div class="event-actions">
              <button class="btn btn-primary" data-action="continue-travel" onClick={carryOn}>
                Continue to {dest?.name ?? t.to}
              </button>
            </div>
          </>
        ) : (
          <div class="dialogue-choices">
            {opts.map((c, i) => (
              <button
                key={c.index}
                class="choice"
                data-choice={i}
                disabled={!c.enabled}
                onClick={() => pick(c.index)}
              >
                <span class="choice-num">{i + 1}</span>
                {c.text}
                {c.reason ? <span class="choice-req"> [{c.reason}]</span> : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
