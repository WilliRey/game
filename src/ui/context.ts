import { createContext } from 'preact';
import { useContext, useEffect, useReducer } from 'preact/hooks';
import type { GameStore } from '@/core/store';

export const StoreContext = createContext<GameStore | null>(null);

export function useStore(): GameStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return store;
}

/** Re-render whenever the store notifies (batched to one flush per frame). */
export function useStoreVersion(store: GameStore): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => store.subscribe(() => force(undefined)), [store]);
  return store.version;
}

/** Re-render on a fixed heartbeat (the HUD uses this so needs and the clock tick without notify spam). */
export function useHeartbeat(hz: number): void {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(() => force(undefined), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
}
