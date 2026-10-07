import type { JSX } from 'preact';
import type { ScreenEntry, ScreenId } from '@/core/store';
import { useStore, useStoreVersion } from './context';
import { DebugPanel } from './hud/DebugPanel';
import { Hud } from './hud/Hud';
import { Console } from './screens/Console';
import { Death } from './screens/Death';
import { Inventory } from './screens/Inventory';
import { Loot } from './screens/Loot';
import { MainMenu } from './screens/MainMenu';
import { NewGame } from './screens/NewGame';
import { Pause } from './screens/Pause';
import { Settings } from './screens/Settings';
import { TextCard } from './screens/TextCard';

type ScreenComponent = (props: { entry: ScreenEntry }) => JSX.Element | null;

/** Screen id → component. */
export const SCREENS: Partial<Record<ScreenId, ScreenComponent>> = {
  mainMenu: MainMenu,
  newGame: NewGame,
  pause: Pause,
  settings: Settings,
  textCard: TextCard,
  death: Death,
  console: Console,
  inventory: Inventory,
  loot: Loot,
};

export function App() {
  const store = useStore();
  useStoreVersion(store);
  const settings = store.settings;
  return (
    <div class="ui-root" style={{ '--ui-scale': String(settings.uiScale) } as JSX.CSSProperties}>
      {store.phase === 'playing' ? <Hud /> : null}
      {store.phase === 'playing' ? <DebugPanel /> : null}
      {store.screens.map((entry) => {
        const C = SCREENS[entry.id];
        return C ? <C key={entry.id} entry={entry} /> : null;
      })}
    </div>
  );
}
