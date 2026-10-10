import { useEffect, useState } from 'preact/hooks';
import type { ItemStack } from '@/core/types';
import {
  carriedWeight,
  carryCapacity,
  findStack,
  putIntoContainer,
  takeAll,
  takeFromContainer,
} from '@/systems/inventory';
import { RARITY_COLOR, stackWeight } from '@/systems/items';
import { ItemDetails } from '../components/ItemDetails';
import { ItemIcon } from '../components/ItemIcon';
import { useStore } from '../context';

/** Loot window: take one item, take everything, or stash things of yours in the container. */
export function Loot({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const ctx = store.ctx;
  const containerId = String(entry.props?.containerId ?? '');
  const c = store.state.zone?.containers[containerId];
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Key repeat from an E still held since the search must not close the window it just opened.
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'KeyF') {
        e.preventDefault();
        if (e.code === 'KeyF' && c) takeAll(ctx, containerId);
        store.close('loot');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!c) return null;
  const name = c.label ?? store.content.containerTypes[c.type]?.name ?? 'Container';
  const weight = carriedWeight(ctx);
  const cap = carryCapacity(ctx);
  const act = (fn: () => void) => {
    fn();
    store.notify();
  };
  const hovered = c.items.find((s) => s.uid === hover) ?? findStack(ctx, hover) ?? null;
  const row = (s: ItemStack, onClick: () => void, side: 'mine' | 'theirs') => {
    const d = store.content.items[s.itemId]!;
    return (
      <div
        key={s.uid}
        class="item-row"
        data-loot-row={side === 'theirs' ? s.itemId : undefined}
        onMouseEnter={() => setHover(s.uid)}
        onClick={() => act(onClick)}
        title={side === 'theirs' ? 'Click to take' : 'Click to put in the container'}
      >
        <ItemIcon itemId={s.itemId} size={28} />
        <span class="item-row-name" style={{ color: RARITY_COLOR[d.rarity] }}>
          {d.name}
        </span>
        <span class="num row-qty">{s.qty > 1 ? `×${s.qty}` : ''}</span>
        <span class="num row-w muted">{stackWeight(store.content, s).toFixed(1)}</span>
      </div>
    );
  };
  return (
    <div class="screen dim" data-screen="loot">
      <div class="panel loot-panel">
        <div class="panel-header">
          <h2>{name}</h2>
          <div class={`weight ${weight > cap ? 'bad' : ''}`}>
            <span class="num">{weight.toFixed(1)}</span> / <span class="num">{cap}</span> kg
          </div>
          <button class="btn btn-small close-x" onClick={() => store.close('loot')}>
            ✕
          </button>
        </div>
        <div class="loot-body">
          <div class="loot-col">
            <div class="section-title">Your pack</div>
            <div class="item-rows">
              {store.state.player.inventory.map((s) =>
                row(s, () => putIntoContainer(ctx, containerId, s.uid), 'mine'),
              )}
            </div>
          </div>
          <div class="loot-col">
            <div class="section-title">{name}</div>
            <div class="item-rows" data-loot-list>
              {c.items.length === 0 ? <div class="dim-text empty-note">Empty.</div> : null}
              {c.items.map((s) => row(s, () => takeFromContainer(ctx, containerId, s.uid), 'theirs'))}
            </div>
          </div>
          <div class="loot-detail">
            {hovered ? (
              <ItemDetails stack={hovered} />
            ) : (
              <div class="dim-text empty-note">Hover an item for details.</div>
            )}
          </div>
        </div>
        <div class="panel-footer">
          <span class="muted small footer-hint">
            Click to move an item · <span class="kbd">F</span> take all · <span class="kbd">E</span> close ·
            the world keeps moving
          </span>
          <button
            class="btn btn-primary"
            data-action="take-all"
            disabled={!c.items.length}
            onClick={() => act(() => takeAll(ctx, containerId))}
          >
            Take all
          </button>
          <button class="btn" onClick={() => store.close('loot')}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
