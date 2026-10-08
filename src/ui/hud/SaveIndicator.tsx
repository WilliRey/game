import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../context';

/** A small, quiet "Autosaved" note in the corner for a couple of seconds after each autosave. */
export function SaveIndicator() {
  const store = useStore();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = store.bus.on('save:written', ({ auto }) => {
      if (!auto) return;
      setShown(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(false), 2200);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [store]);
  return shown ? (
    <div class="save-indicator" data-autosaved>
      <span class="save-dot" /> Autosaved
    </div>
  ) : null;
}
