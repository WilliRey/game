import { useEffect, useState } from 'preact/hooks';
import type { ItemStack } from '@/core/types';
import { isEquipped } from '@/systems/inventory';
import { RARITY_COLOR } from '@/systems/items';
import { showHint } from '@/systems/story';
import { buyPrice, executeTrade, quote, restockIfDue, sellPrice, type Line } from '@/systems/trade';
import { ItemDetails } from '../components/ItemDetails';
import { ItemIcon } from '../components/ItemIcon';
import { useStore } from '../context';
import { pushToast } from '../uiState';

/**
 * Barter: click your items to add them to your offer, click theirs to ask for them. The deal goes through
 * when your offer (plus any credit) covers what you take; overpayment becomes credit with this trader.
 */
export function Trade({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const ctx = store.ctx;
  const traderId = String(entry.props?.traderId ?? '');
  const def = store.content.traders[traderId];
  const t = store.state.traders[traderId];
  const [offer, setOffer] = useState<Record<string, number>>({});
  const [request, setRequest] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<ItemStack | null>(null);
  useEffect(() => {
    restockIfDue(ctx, traderId);
    showHint(ctx, 'trade');
    store.notify();
  }, [traderId]);
  if (!def || !t) return null;
  if (!t.unlocked) {
    return (
      <div class="screen dim" data-screen="trade">
        <div class="panel" style={{ width: '420px', padding: '20px' }}>
          <p>{def.name} isn't trading with you yet.</p>
          <button class="btn" onClick={() => store.close('trade')}>
            Close
          </button>
        </div>
      </div>
    );
  }
  const lines = (m: Record<string, number>): Line[] =>
    Object.entries(m)
      .filter(([, q]) => q > 0)
      .map(([uid, qty]) => ({ uid, qty }));
  const q = quote(ctx, traderId, lines(offer), lines(request));
  const bump = (
    m: Record<string, number>,
    set: (x: Record<string, number>) => void,
    s: ItemStack,
    d: number,
  ) => {
    const cur = m[s.uid] ?? 0;
    set({ ...m, [s.uid]: Math.max(0, Math.min(s.qty, cur + d)) });
  };
  const content = store.content;
  const row = (s: ItemStack, side: 'mine' | 'theirs') => {
    const d = content.items[s.itemId]!;
    const m = side === 'mine' ? offer : request;
    const set = side === 'mine' ? setOffer : setRequest;
    const sel = m[s.uid] ?? 0;
    const price = side === 'mine' ? buyPrice(ctx, traderId, s) : sellPrice(ctx, traderId, s);
    const wanted = side === 'mine' && def.wants.includes(d.category);
    const junk = side === 'mine' && def.junk.includes(d.category);
    return (
      <div
        key={s.uid}
        class={`item-row trade-row ${sel ? 'selected' : ''}`}
        data-trade-row={`${side}:${s.itemId}`}
        onMouseEnter={() => setHover(s)}
        onClick={(e) => bump(m, set, s, e.shiftKey ? s.qty : 1)}
        onContextMenu={(e) => {
          e.preventDefault();
          bump(m, set, s, -1);
        }}
      >
        <ItemIcon itemId={s.itemId} size={26} />
        <span class="item-row-name" style={{ color: RARITY_COLOR[d.rarity] }}>
          {d.name}
          {side === 'mine' && isEquipped(ctx, s.uid) ? <span class="tag">E</span> : null}
          {wanted ? <span class="tag good">wanted</span> : null}
          {junk ? <span class="tag">junk</span> : null}
        </span>
        <span class="num row-qty">
          {sel ? <span class="accent">{sel}/</span> : null}
          {s.qty}
        </span>
        <span class="num trade-price">{price}</span>
      </div>
    );
  };
  return (
    <div class="screen dim" data-screen="trade">
      <div class="panel trade-panel">
        <div class="panel-header">
          <h2>Trade · {def.name}</h2>
          <span class="muted small">
            Barter only. Click to add, right-click to remove, shift-click for the whole stack.
          </span>
          <button class="btn btn-small close-x" onClick={() => store.close('trade')}>
            ✕
          </button>
        </div>
        <div class="trade-body">
          <div class="loot-col">
            <div class="section-title">Your goods — they pay</div>
            <div class="item-rows">{store.state.player.inventory.map((s) => row(s, 'mine'))}</div>
          </div>
          <div class="loot-col">
            <div class="section-title">{def.name}'s goods — they charge</div>
            <div class="item-rows">
              {t.stock.length === 0 ? (
                <div class="dim-text empty-note">Sold out. Stock comes back every few days.</div>
              ) : null}
              {t.stock.map((s) => row(s, 'theirs'))}
            </div>
          </div>
          <div class="loot-detail">
            {hover ? (
              <ItemDetails stack={hover} />
            ) : (
              <div class="dim-text empty-note">Hover an item for details.</div>
            )}
          </div>
        </div>
        <div class="panel-footer trade-footer">
          <div class="trade-totals">
            <span>
              Your offer <b class="num">{q.offerValue}</b>
              {q.credit > 0 ? (
                <span class="muted">
                  {' '}
                  + credit <span class="num">{q.credit}</span>
                </span>
              ) : null}
            </span>
            <span>
              You take <b class="num">{q.requestValue}</b>
            </span>
            <span class={q.ok ? 'good' : 'bad'}>
              {q.ok
                ? q.creditAfter > q.credit || q.creditAfter > 0
                  ? `Credit after: ${q.creditAfter}`
                  : 'Fair deal'
                : `Short by ${q.requestValue - q.offerValue - q.credit}`}
            </span>
            <span class="muted small">Camp reputation {store.state.reputation}</span>
          </div>
          <button
            class="btn"
            onClick={() => {
              setOffer({});
              setRequest({});
            }}
          >
            Clear
          </button>
          <button
            class="btn btn-primary"
            data-action="deal"
            disabled={!q.ok}
            onClick={() => {
              const r = executeTrade(ctx, traderId, lines(offer), lines(request));
              pushToast(store, r.message, r.ok ? 'good' : 'warn');
              setOffer({});
              setRequest({});
              store.notify();
            }}
          >
            Deal
          </button>
        </div>
      </div>
    </div>
  );
}
