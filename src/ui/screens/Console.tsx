import { useEffect, useRef, useState } from 'preact/hooks';
import { runCommand } from '@/dev/console';
import { useStore } from '../context';

const history: string[] = [];
const log: string[] = ['HOLDOUT debug console — type help'];

export function Console() {
  const store = useStore();
  const input = useRef<HTMLInputElement>(null);
  const [, setTick] = useState(0);
  const [hi, setHi] = useState(history.length);
  useEffect(() => {
    input.current?.focus();
  }, []);
  const submit = (line: string) => {
    if (!line.trim()) return;
    history.push(line);
    setHi(history.length);
    log.push(`> ${line}`, ...runCommand(store, line));
    while (log.length > 200) log.shift();
    setTick((t) => t + 1);
  };
  return (
    <div class="console" data-screen="console">
      <div class="console-log">
        {log.slice(-40).map((l, i) => (
          <div key={i} class={l.startsWith('>') ? 'accent' : ''}>
            {l}
          </div>
        ))}
      </div>
      <input
        ref={input}
        class="console-input"
        spellcheck={false}
        placeholder="give bandage 3 · time 21:00 · spawn walker 5 · tp firehouse9 · help"
        onKeyDown={(e) => {
          const el = e.currentTarget;
          if (e.key === 'Enter') {
            submit(el.value);
            el.value = '';
          } else if (e.key === 'ArrowUp') {
            const n = Math.max(0, hi - 1);
            setHi(n);
            el.value = history[n] ?? '';
            e.preventDefault();
          } else if (e.key === 'ArrowDown') {
            const n = Math.min(history.length, hi + 1);
            setHi(n);
            el.value = history[n] ?? '';
            e.preventDefault();
          } else if (e.key === 'Escape' || e.key === '`') {
            e.preventDefault();
            el.blur();
            store.close('console');
          }
          e.stopPropagation();
        }}
      />
    </div>
  );
}
