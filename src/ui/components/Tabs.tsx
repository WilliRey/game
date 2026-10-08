import type { ScreenId } from '@/core/store';
import { useStore } from '../context';

const TABS: { id: ScreenId; label: string; key: string; props?: Record<string, unknown> }[] = [
  { id: 'inventory', label: 'Inventory', key: 'Tab' },
  { id: 'crafting', label: 'Craft', key: '', props: { station: 'inventory' } },
  { id: 'skills', label: 'Skills', key: 'K' },
  { id: 'journal', label: 'Journal', key: 'J' },
];

/** Tab strip shared by the inventory-family screens; switching replaces the current screen. */
export function ScreenTabs({ current }: { current: ScreenId }) {
  const store = useStore();
  return (
    <div class="screen-tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          class={`tab ${current === t.id ? 'active' : ''}`}
          onClick={() => {
            if (t.id === current) return;
            store.close(current);
            store.open(t.id, t.props);
          }}
        >
          {t.label}
          {t.key ? <span class="kbd tab-key">{t.key}</span> : null}
        </button>
      ))}
    </div>
  );
}
