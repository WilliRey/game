import { useEffect } from 'preact/hooks';
import { useStore } from '../context';
import { uiState } from '../uiState';

/** Contextual tutorial hint for firsts. One at a time; click or H dismisses; auto-hides after a while. */
export function HintPanel() {
  const store = useStore();
  const id = uiState.hints[0];
  const hint = id ? store.content.hints[id] : undefined;
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => {
      if (uiState.hints[0] === id) {
        uiState.hints.shift();
        store.notify();
      }
    }, 14000);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && uiState.hints[0] === id) {
        uiState.hints.shift();
        store.notify();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [id, store]);
  if (!hint) return null;
  return (
    <div
      class="hint-panel"
      data-hint={id}
      onClick={() => {
        uiState.hints.shift();
        store.notify();
      }}
    >
      <div class="hint-title">
        <span class="accent">Hint</span> · {hint.title}
      </div>
      <div class="hint-text">{hint.text}</div>
      <div class="hint-dismiss muted">click or H to dismiss</div>
    </div>
  );
}
