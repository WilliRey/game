import type { JSX } from 'preact';
import type { ScreenEntry, ScreenId } from '@/core/store';
import { useStore, useStoreVersion } from './context';
import { MainMenu } from './screens/MainMenu';

type ScreenComponent = (props: { entry: ScreenEntry }) => JSX.Element | null;

/** Screen id → component. Screens not yet implemented simply don't render. */
export const SCREENS: Partial<Record<ScreenId, ScreenComponent>> = {
  mainMenu: MainMenu,
};

export function App() {
  const store = useStore();
  useStoreVersion(store);
  const settings = store.settings;
  return (
    <div class="ui-root" style={{ '--ui-scale': String(settings.uiScale) } as JSX.CSSProperties}>
      {store.screens.map((entry) => {
        const C = SCREENS[entry.id];
        return C ? <C key={entry.id} entry={entry} /> : null;
      })}
    </div>
  );
}
