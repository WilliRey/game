import { useEffect } from 'preact/hooks';
import { useStore } from '../context';
import { uiState } from '../uiState';

/** Story text cards: notes, radio broadcasts, scripted moments. Stops the clock while open. */
export function TextCard() {
  const store = useStore();
  const card = uiState.cards[0];
  const next = () => {
    uiState.cards.shift();
    if (!uiState.cards.length) store.close('textCard');
    else store.notify();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return; // a held key must not skip a whole stack of cards
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!card) return null;
  return (
    <div class="screen dim" data-screen="textCard">
      <div class="text-card">
        <h2>{card.title}</h2>
        <div class="text-card-body">
          {card.body.split('\n').map((line, i) => (line ? <p key={i}>{line}</p> : <br key={i} />))}
        </div>
        <div class="text-card-footer">
          {uiState.cards.length > 1 ? <span class="muted">{uiState.cards.length - 1} more</span> : <span />}
          <button class="btn btn-primary" data-action="continue" onClick={next}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
