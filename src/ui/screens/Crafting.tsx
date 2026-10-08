import { craftContext, type Station } from '@/systems/crafting';
import { CraftPanel, STATION_NAME } from '../components/CraftPanel';
import { ScreenTabs } from '../components/Tabs';
import { useStore } from '../context';

/** Crafting at a station (stove, campfire, reloading bench) or by hand from the inventory tabs. */
export function Crafting({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const station = (entry.props?.station as Station | undefined) ?? 'inventory';
  const cc = craftContext(store.ctx, station, entry.props?.tier as number | undefined);
  return (
    <div class="screen dim" data-screen="crafting">
      <div class="panel craft-panel">
        <div class="panel-header">
          {station === 'inventory' ? <ScreenTabs current="crafting" /> : <h2>{STATION_NAME[station]}</h2>}
          {station !== 'inventory' ? <span class="muted">tier {cc.tier}</span> : null}
          <button class="btn btn-small close-x" onClick={() => store.close('crafting')}>
            ✕
          </button>
        </div>
        <CraftPanel cc={cc} />
      </div>
    </div>
  );
}
