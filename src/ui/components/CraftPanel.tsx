import { useState } from 'preact/hooks';
import { craft, craftQuality, recipesAt, type CraftContext } from '@/systems/crafting';
import { createStack, RARITY_COLOR } from '@/systems/items';
import { useStore } from '../context';
import { pushToast } from '../uiState';
import { ItemDetails } from './ItemDetails';
import { ItemIcon } from './ItemIcon';

const STATION_NAME: Record<string, string> = {
  inventory: 'By hand',
  workbench: 'Workbench',
  stove: 'Stove',
  reloading: 'Reloading bench',
};

/** Recipe list + details + craft button for one station context. */
export function CraftPanel({ cc }: { cc: CraftContext }) {
  const store = useStore();
  const ctx = store.ctx;
  const list = recipesAt(ctx, cc);
  const [sel, setSel] = useState<string | null>(
    list.find((r) => r.canCraft)?.recipe.id ?? list[0]?.recipe.id ?? null,
  );
  const cur = list.find((r) => r.recipe.id === sel) ?? null;
  const content = store.content;
  const out = cur ? content.items[cur.recipe.output.itemId] : undefined;
  const isGear = !!out && ((!!out.weapon && out.weapon.kind !== 'throwable') || !!out.armor || !!out.mod);
  const preview =
    cur && out
      ? createStack(
          { ...store.state, nextUid: 0 },
          content,
          out.id,
          cur.recipe.output.qty,
          isGear ? { quality: craftQuality(ctx, Math.max(1, cc.tier)) } : {},
        )
      : null;
  let reason = '';
  if (cur && !cur.canCraft) {
    if (!cur.known) reason = 'Blueprint needed';
    else if (!cur.stationOk) reason = `Needs a ${STATION_NAME[cur.recipe.station]}`;
    else if (!cur.tierOk)
      reason = `Needs a tier ${cur.recipe.tier} ${STATION_NAME[cur.recipe.station]?.toLowerCase()}`;
    else if (!cur.toolOk) reason = `Needs a ${content.items[cur.recipe.tool!]?.name}`;
    else reason = 'Missing materials';
  }
  return (
    <div class="craft-body">
      <div class="craft-list" data-recipe-list>
        {list.map((r) => {
          const o = content.items[r.recipe.output.itemId]!;
          const badge = !r.known
            ? 'locked'
            : r.canCraft
              ? 'ready'
              : !r.tierOk || !r.stationOk
                ? 'tier'
                : 'missing';
          return (
            <div
              key={r.recipe.id}
              class={`item-row ${sel === r.recipe.id ? 'selected' : ''} ${badge}`}
              data-recipe={r.recipe.id}
              onClick={() => setSel(r.recipe.id)}
            >
              <ItemIcon itemId={o.id} size={28} />
              <span class="item-row-name" style={{ color: r.known ? RARITY_COLOR[o.rarity] : undefined }}>
                {r.known ? o.name : `${o.name} (blueprint)`}
                {r.recipe.output.qty > 1 ? ` ×${r.recipe.output.qty}` : ''}
              </span>
              <span class={`badge badge-${badge}`}>
                {badge === 'ready'
                  ? 'craft'
                  : badge === 'tier'
                    ? `T${r.recipe.tier} ${STATION_NAME[r.recipe.station]?.split(' ')[0]}`
                    : badge}
              </span>
            </div>
          );
        })}
      </div>
      <div class="craft-detail">
        {cur && preview ? (
          <>
            <ItemDetails stack={preview} />
            <div class="section-title">Needs</div>
            <div class="inputs">
              {cur.inputs.map((i) => (
                <div key={i.itemId} class={`input-row ${i.have >= i.need ? 'good' : 'bad'}`}>
                  <ItemIcon itemId={i.itemId} size={24} />
                  <span class="item-row-name">{content.items[i.itemId]?.name}</span>
                  <span class="num">
                    {i.have}/{i.need}
                  </span>
                </div>
              ))}
              {cur.recipe.tool ? (
                <div class={`input-row ${cur.toolOk ? 'good' : 'bad'}`}>
                  <ItemIcon itemId={cur.recipe.tool} size={24} />
                  <span class="item-row-name">Tool: {content.items[cur.recipe.tool]?.name}</span>
                </div>
              ) : null}
            </div>
            <div class="muted small craft-meta">
              {STATION_NAME[cur.recipe.station]}
              {cur.recipe.station !== 'inventory' ? ` tier ${cur.recipe.tier}` : ''} ·{' '}
              {cur.recipe.timeMinutes} min · +{cur.recipe.xp} XP
              {cc.useStash ? ' · uses your stash too' : ''}
            </div>
            <button
              class="btn btn-primary craft-btn"
              data-action="craft"
              disabled={!cur.canCraft}
              onClick={() => {
                const r = craft(ctx, cur.recipe.id, cc);
                pushToast(store, r.message, r.ok ? 'good' : 'warn');
                store.notify();
              }}
            >
              {cur.canCraft ? 'Craft' : reason}
            </button>
          </>
        ) : (
          <div class="dim-text empty-note">No recipes here yet. Blueprints unlock more.</div>
        )}
      </div>
    </div>
  );
}

export { STATION_NAME };
