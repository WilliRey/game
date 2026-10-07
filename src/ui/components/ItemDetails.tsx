import type { ItemStack } from '@/core/types';
import { RARITY_COLOR, statRows, stackWeight, useNotes } from '@/systems/items';
import { useStore } from '../context';
import { ItemIcon } from './ItemIcon';

/** Item tooltip: description, stats, and a comparison against `compare` (usually what's equipped). */
export function ItemDetails({
  stack,
  compare,
  compareLabel,
}: {
  stack: ItemStack;
  compare?: ItemStack;
  compareLabel?: string;
}) {
  const store = useStore();
  const def = store.content.items[stack.itemId];
  if (!def) return null;
  const rows = statRows(store.content, stack);
  const other = compare ? statRows(store.content, compare) : [];
  const notes = useNotes(store.content, stack.itemId);
  const mods = Object.entries(stack.mods ?? {}).filter(([, v]) => v);
  return (
    <div class="item-details" data-item={stack.itemId}>
      <div class="item-details-head">
        <ItemIcon itemId={stack.itemId} qty={stack.qty} size={46} />
        <div>
          <div class="item-name" style={{ color: RARITY_COLOR[def.rarity] }}>
            {def.name}
          </div>
          <div class="muted item-sub">
            {def.rarity} · {def.category}
            {stack.jammed ? <span class="bad"> · jammed</span> : null}
            {stack.durability !== undefined && stack.durability <= 0 ? (
              <span class="bad"> · broken</span>
            ) : null}
          </div>
        </div>
      </div>
      {def.description ? <p class="item-desc">{def.description}</p> : null}
      {rows.length ? (
        <table class="stat-table">
          <tbody>
            {rows.map((r) => {
              const o = other.find((x) => x.label === r.label);
              let cls = '';
              if (o && r.better && o.value !== r.value)
                cls = (r.better === 'higher') === r.value > o.value ? 'good' : 'bad';
              return (
                <tr key={r.label}>
                  <td class="muted">{r.label}</td>
                  <td class={`num ${cls}`}>{r.fmt(r.value)}</td>
                  {compare ? <td class="num dim-text">{o ? o.fmt(o.value) : '—'}</td> : null}
                </tr>
              );
            })}
          </tbody>
          {compare ? (
            <tfoot>
              <tr>
                <td />
                <td class="muted small">this</td>
                <td class="muted small">{compareLabel ?? 'equipped'}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      ) : null}
      {mods.length ? (
        <div class="item-mods">
          Mods:{' '}
          {mods.map(([slot, id]) => (
            <span key={slot} class="chip">
              {slot}: {store.content.items[id!]?.name ?? id}
            </span>
          ))}
        </div>
      ) : null}
      {notes.length ? (
        <ul class="item-notes">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      <div class="item-foot muted num">
        {stackWeight(store.content, stack).toFixed(2)} kg · value {def.value}
        {stack.qty > 1 ? ` each, ×${stack.qty}` : ''}
      </div>
    </div>
  );
}
