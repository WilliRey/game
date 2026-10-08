import { useStore } from '../context';

const CAT_COLOR: Record<string, string> = {
  food: '#8a6a3a',
  drink: '#3a6a8a',
  medical: '#8a3a3a',
  material: '#5a5a52',
  tool: '#6a5a3a',
  ammo: '#8a7a2a',
  weapon: '#4a4f58',
  mod: '#4a5a4a',
  armor: '#4a4a62',
  backpack: '#5a4a3a',
  blueprint: '#2f4a72',
  note: '#7a7262',
  quest: '#8a6a1a',
  throwable: '#4a6a3a',
  fuel: '#7a2a20',
  junk: '#4a4640',
};

/** A compact item glyph: category color, short name, rarity border, optional quantity. */
export function ItemIcon({ itemId, qty, size = 40 }: { itemId: string; qty?: number; size?: number }) {
  const store = useStore();
  const def = store.content.items[itemId];
  if (!def) return null;
  const words = def.name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean);
  const abbr =
    words.length > 1
      ? (words[0]![0]! + words[1]![0]!).toUpperCase()
      : (words[0] ?? '?').slice(0, 2).toUpperCase();
  return (
    <span
      class={`item-icon rarity-${def.rarity}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: CAT_COLOR[def.category] ?? '#444',
        fontSize: `${Math.round(size * 0.34)}px`,
      }}
    >
      {abbr}
      {qty !== undefined && qty > 1 ? <span class="item-qty num">{qty}</span> : null}
    </span>
  );
}
