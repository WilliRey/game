import { uiState } from '../uiState';

export function Toasts() {
  const now = performance.now();
  uiState.toasts = uiState.toasts.filter((t) => t.until > now);
  return (
    <div class="toasts" aria-live="polite">
      {uiState.toasts.map((t) => (
        <div
          key={t.id}
          class={`toast toast-${t.kind}`}
          style={{ opacity: Math.min(1, (t.until - now) / 600) }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
