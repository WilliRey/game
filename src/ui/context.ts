import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useReducer } from 'preact/hooks';
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
  const rendered = store.version;
  useLayoutEffect(() => {
    const off = store.subscribe(() => force(undefined));
    // A notify flushed between this render and the subscription would be lost (the game can boot to the
    // main menu before the UI subscribes, e.g. on a cached reload): catch up once.
    if (store.version !== rendered) force(undefined);
    return off;
  }, [store]);
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
