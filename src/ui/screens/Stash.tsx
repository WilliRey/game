import type { ItemStack } from '@/core/types';
import { carriedWeight, carryCapacity, stashItem, unstashItem } from '@/systems/inventory';
import { RARITY_COLOR, listWeight, stackWeight } from '@/systems/items';
import { ItemIcon } from '../components/ItemIcon';
import { useStore } from '../context';

/** The safehouse stash: large storage, no weight limit. Click to move items across. */
export function Stash() {
  const store = useStore();
  const ctx = store.ctx;
  const content = store.content;
  const stash = store.state.base.stash;
  const act = (fn: () => void) => {
    fn();
    store.notify();
  };
  const row = (s: ItemStack, onClick: () => void) => {
    const d = content.items[s.itemId]!;
    return (
      <div key={s.uid} class="item-row" onClick={() => act(onClick)}>
        <ItemIcon itemId={s.itemId} size={28} />
        <span class="item-row-name" style={{ color: RARITY_COLOR[d.rarity] }}>
          {d.name}
        </span>
        <span class="num row-qty">{s.qty > 1 ? `×${s.qty}` : ''}</span>
        <span class="num row-w muted">{stackWeight(content, s).toFixed(1)}</span>
      </div>
    );
  };
  const sorted = (l: ItemStack[]) =>
    [...l].sort(
      (a, b) =>
        content.items[a.itemId]!.category.localeCompare(content.items[b.itemId]!.category) ||
        a.itemId.localeCompare(b.itemId),
    );
  return (
    <div class="screen dim" data-screen="stash">
      <div class="panel loot-panel">
        <div class="panel-header">
          <h2>Stash</h2>
          <span class="muted">
            pack <span class="num">{carriedWeight(ctx).toFixed(1)}</span>/{carryCapacity(ctx)} kg · stash{' '}
            <span class="num">{listWeight(content, stash).toFixed(1)}</span> kg
          </span>
          <button class="btn btn-small close-x" onClick={() => store.close('stash')}>
            ✕
          </button>
        </div>
        <div class="loot-body" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div class="loot-col">
            <div class="section-title">Your pack — click to stash</div>
            <div class="item-rows">
              {sorted(store.state.player.inventory).map((s) => row(s, () => stashItem(ctx, s.uid)))}
            </div>
          </div>
          <div class="loot-col">
            <div class="section-title">Stash — click to take</div>
            <div class="item-rows">
              {stash.length === 0 ? (
                <div class="dim-text empty-note">
                  Empty. Crafting at the safehouse can use what's in here.
                </div>
              ) : null}
              {sorted(stash).map((s) => row(s, () => unstashItem(ctx, s.uid)))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
