import type { JSX } from 'preact';
import type { ScreenEntry, ScreenId } from '@/core/store';
import { useHeartbeat, useStore, useStoreVersion } from './context';
import { DebugPanel } from './hud/DebugPanel';
import { Hud } from './hud/Hud';
import { Toasts } from './hud/Toasts';
import { Console } from './screens/Console';
import { Crafting } from './screens/Crafting';
import { Death } from './screens/Death';
import { Dialogue } from './screens/Dialogue';
import { Journal } from './screens/Journal';
import { Trade } from './screens/Trade';
import { ZoneMap } from './screens/ZoneMap';
import { WorldMap } from './screens/WorldMap';
import { TravelEvent } from './screens/TravelEvent';
import { Saves } from './screens/Saves';
import { Inventory } from './screens/Inventory';
import { Loot } from './screens/Loot';
import { MainMenu } from './screens/MainMenu';
import { NewGame } from './screens/NewGame';
import { Pause } from './screens/Pause';
import { Settings } from './screens/Settings';
import { Skills } from './screens/Skills';
import { Sleep } from './screens/Sleep';
import { Stash } from './screens/Stash';
import { Workbench } from './screens/Workbench';
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
  crafting: Crafting,
  workbench: Workbench,
  stash: Stash,
  sleep: Sleep,
  skills: Skills,
  dialogue: Dialogue,
  trade: Trade,
  journal: Journal,
  zoneMap: ZoneMap,
  worldMap: WorldMap,
  travelEvent: TravelEvent,
  saves: Saves,
};

export function App() {
  const store = useStore();
  useStoreVersion(store);
  const settings = store.settings;
  const hud = store.phase === 'playing' && !store.isOpen('death') && !store.cinematic;
  return (
    <div class="ui-root" style={{ '--ui-scale': String(settings.uiScale) } as JSX.CSSProperties}>
      {hud ? <Hud /> : null}
      {store.phase === 'playing' ? <DebugPanel /> : null}
      {store.screens.map((entry) => {
        const C = SCREENS[entry.id];
        return C ? <C key={entry.id} entry={entry} /> : null;
      })}
      {hud ? null : <OverlayToasts />}
    </div>
  );
}

/** Toasts when the HUD isn't showing (main menu, death screen): save/load and import messages. */
function OverlayToasts() {
  useHeartbeat(4);
  return <Toasts />;
}
