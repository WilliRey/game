import { useState } from 'preact/hooks';
import type { ItemCategory } from '@/content/schemas';
import { EQUIP_SLOTS, QUICK_SLOT_COUNT, type EquipSlot, type ItemStack } from '@/core/types';
import {
  carriedWeight,
  carryCapacity,
  dropItem,
  equip,
  equippedIn,
  findStack,
  isEquipped,
  setQuickSlot,
  slotFor,
  unequip,
} from '@/systems/inventory';
import { RARITY_COLOR, stackWeight } from '@/systems/items';
import { useItem } from '@/systems/survival';
import { ItemDetails } from '../components/ItemDetails';
import { ItemIcon } from '../components/ItemIcon';
import { ScreenTabs } from '../components/Tabs';
import { useStore } from '../context';
import { pushToast } from '../uiState';

const SLOT_NAMES: Record<EquipSlot, string> = {
  head: 'Head',
  torso: 'Torso',
  backpack: 'Backpack',
  firearm1: 'Firearm 1',
  firearm2: 'Firearm 2',
  melee: 'Melee',
  throwable: 'Throwable',
};

type Filter = 'all' | 'weapons' | 'consumables' | 'materials' | 'other';
const FILTERS: { id: Filter; label: string; cats: ItemCategory[] | null }[] = [
  { id: 'all', label: 'All', cats: null },
  { id: 'weapons', label: 'Gear', cats: ['weapon', 'throwable', 'ammo', 'mod', 'armor', 'backpack', 'tool'] },
  { id: 'consumables', label: 'Food & meds', cats: ['food', 'drink', 'medical'] },
  { id: 'materials', label: 'Materials', cats: ['material', 'fuel', 'junk'] },
  { id: 'other', label: 'Notes & quest', cats: ['note', 'blueprint', 'quest'] },
];
const CAT_ORDER: ItemCategory[] = [
  'weapon',
  'throwable',
  'ammo',
  'armor',
  'backpack',
  'mod',
  'tool',
  'medical',
  'food',
  'drink',
  'material',
  'fuel',
  'blueprint',
  'note',
  'quest',
  'junk',
];

export function Inventory() {
  const store = useStore();
  const ctx = store.ctx;
  const p = store.state.player;
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const content = store.content;
  const cats = FILTERS.find((f) => f.id === filter)!.cats;
  const items = p.inventory
    .filter((s) => !cats || cats.includes(content.items[s.itemId]!.category))
    .sort(
      (a, b) =>
        CAT_ORDER.indexOf(content.items[a.itemId]!.category) -
          CAT_ORDER.indexOf(content.items[b.itemId]!.category) ||
        content.items[a.itemId]!.name.localeCompare(content.items[b.itemId]!.name),
    );
  const selected = findStack(ctx, sel) ?? null;
  const weight = carriedWeight(ctx);
  const cap = carryCapacity(ctx);
  const act = (fn: () => void) => {
    fn();
    store.notify();
  };
  const def = selected ? content.items[selected.itemId] : undefined;
  const slot = selected ? slotFor(ctx, selected) : null;
  const compareWith = selected && slot && !isEquipped(ctx, selected.uid) ? equippedIn(ctx, slot) : undefined;
  const usable =
    !!def && (!!def.use || !!def.note || !!def.blueprint || (!!def.fuel && ctx.state.vehicle.owned));
  const quickable = !!def?.use;

  return (
    <div class="screen dim" data-screen="inventory">
      <div class="panel inv-panel">
        <div class="panel-header">
          <ScreenTabs current="inventory" />
          <div class={`weight ${weight > cap ? 'bad' : ''}`} title="Carried weight / capacity">
            <span class="num">{weight.toFixed(1)}</span> / <span class="num">{cap}</span> kg
            {weight > cap ? ' · Encumbered' : ''}
          </div>
          <button class="btn btn-small close-x" onClick={() => store.close('inventory')}>
            ✕
          </button>
        </div>
        <div class="inv-body">
          <div class="inv-equip">
            <div class="section-title">Equipped</div>
            {EQUIP_SLOTS.map((sl) => {
              const st = equippedIn(ctx, sl);
              return (
                <div
                  key={sl}
                  class={`equip-row ${st && sel === st.uid ? 'selected' : ''} ${p.activeSlot === sl ? 'active-slot' : ''}`}
                  onClick={() => st && setSel(st.uid)}
                >
                  <span class="equip-slot muted">{SLOT_NAMES[sl]}</span>
                  {st ? (
                    <>
                      <ItemIcon itemId={st.itemId} qty={st.qty} size={28} />
                      <span
                        class="equip-name"
                        style={{ color: RARITY_COLOR[content.items[st.itemId]!.rarity] }}
                      >
                        {content.items[st.itemId]!.name}
                      </span>
                    </>
                  ) : (
                    <span class="dim-text">{sl === 'melee' ? 'Fists' : '—'}</span>
                  )}
                </div>
              );
            })}
            <div class="section-title">Quick slots</div>
            <div class="quick-row">
              {Array.from({ length: QUICK_SLOT_COUNT }, (_, i) => {
                const st = findStack(ctx, p.quickSlots[i]);
                return (
                  <div
                    key={i}
                    class="qslot big"
                    title={st ? content.items[st.itemId]!.name : 'Empty'}
                    onClick={() => st && setSel(st.uid)}
                  >
                    <span class="qkey">{i + 5}</span>
                    {st ? <ItemIcon itemId={st.itemId} qty={st.qty} size={36} /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div class="inv-list">
            <div class="filter-row">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  class={`chip-btn ${filter === f.id ? 'active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div class="item-rows" data-inventory-list>
              {items.length === 0 ? <div class="dim-text empty-note">Nothing here.</div> : null}
              {items.map((s: ItemStack) => {
                const d = content.items[s.itemId]!;
                return (
                  <div
                    key={s.uid}
                    class={`item-row ${sel === s.uid ? 'selected' : ''}`}
                    data-item-row={s.itemId}
                    onClick={() => setSel(s.uid)}
                    onDblClick={() => {
                      if (d.use || d.note || d.blueprint)
                        act(() => {
                          const msg = useItem(ctx, s.uid);
                          if (msg) pushToast(store, msg);
                        });
                      else if (slotFor(ctx, s))
                        act(() => (isEquipped(ctx, s.uid) ? undefined : equip(ctx, s.uid)));
                    }}
                  >
                    <ItemIcon itemId={s.itemId} size={30} />
                    <span class="item-row-name" style={{ color: RARITY_COLOR[d.rarity] }}>
                      {d.name}
                      {isEquipped(ctx, s.uid) ? <span class="tag">E</span> : null}
                      {p.quickSlots.includes(s.uid) ? (
                        <span class="tag">Q{p.quickSlots.indexOf(s.uid) + 5}</span>
                      ) : null}
                    </span>
                    {s.maxDurability ? (
                      <span class="row-cond" title="Durability">
                        <span
                          style={{ width: `${Math.round(((s.durability ?? 0) / s.maxDurability) * 100)}%` }}
                        />
                      </span>
                    ) : null}
                    <span class="num row-qty">{s.qty > 1 ? `×${s.qty}` : ''}</span>
                    <span class="num row-w muted">{stackWeight(content, s).toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div class="inv-detail">
            {selected ? (
              <>
                <ItemDetails stack={selected} compare={compareWith ?? undefined} />
                <div class="detail-actions">
                  {usable ? (
                    <button
                      class="btn btn-primary"
                      data-action="use"
                      onClick={() =>
                        act(() => {
                          const msg = useItem(ctx, selected.uid);
                          if (msg) pushToast(store, msg);
                        })
                      }
                    >
                      {def?.category === 'food'
                        ? 'Eat'
                        : def?.category === 'drink'
                          ? 'Drink'
                          : def?.note || def?.blueprint
                            ? 'Read'
                            : def?.fuel
                              ? 'Pour into tank'
                              : 'Use'}
                    </button>
                  ) : null}
                  {slot && !isEquipped(ctx, selected.uid) ? (
                    slot === 'firearm1' || slot === 'firearm2' ? (
                      <>
                        <button class="btn" onClick={() => act(() => equip(ctx, selected.uid, 'firearm1'))}>
                          Equip slot 1
                        </button>
                        <button class="btn" onClick={() => act(() => equip(ctx, selected.uid, 'firearm2'))}>
                          Equip slot 2
                        </button>
                      </>
                    ) : (
                      <button
                        class="btn"
                        data-action="equip"
                        onClick={() => act(() => equip(ctx, selected.uid))}
                      >
                        Equip
                      </button>
                    )
                  ) : null}
                  {isEquipped(ctx, selected.uid) ? (
                    <button
                      class="btn"
                      onClick={() =>
                        act(() => {
                          for (const sl of EQUIP_SLOTS)
                            if (p.equipment[sl] === selected.uid) unequip(ctx, sl);
                        })
                      }
                    >
                      Unequip
                    </button>
                  ) : null}
                  {quickable ? (
                    <div class="quick-assign">
                      <span class="muted small">Quick slot</span>
                      {Array.from({ length: QUICK_SLOT_COUNT }, (_, i) => (
                        <button
                          key={i}
                          class={`btn btn-small ${p.quickSlots[i] === selected.uid ? 'btn-primary' : ''}`}
                          onClick={() =>
                            act(() =>
                              setQuickSlot(ctx, i, p.quickSlots[i] === selected.uid ? null : selected.uid),
                            )
                          }
                        >
                          {i + 5}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div class="drop-row">
                    {selected.qty > 1 ? (
                      <button class="btn btn-small" onClick={() => act(() => dropItem(ctx, selected.uid, 1))}>
                        Drop 1
                      </button>
                    ) : null}
                    <button
                      class="btn btn-small btn-danger"
                      data-action="drop"
                      onClick={() => act(() => dropItem(ctx, selected.uid))}
                    >
                      Drop{selected.qty > 1 ? ' all' : ''}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div class="dim-text empty-note">
                Select an item. Double-click to use or equip.
                <br />
                <br />
                Over capacity you move slower and can't sprint. Backpacks raise capacity.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
