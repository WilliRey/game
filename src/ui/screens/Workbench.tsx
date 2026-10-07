import { useState } from 'preact/hooks';
import type { ModSlot } from '@/core/types';
import { buildUpgrade, canAffordUpgrade, upgradeState } from '@/systems/base';
import {
  attachMod,
  available,
  canRepair,
  craftContext,
  detachMod,
  dismantle,
  dismantleYield,
  modPreview,
  repair,
  repairCost,
  repairedMax,
  type CraftContext,
} from '@/systems/crafting';
import { findStack } from '@/systems/inventory';
import { RARITY_COLOR, modFits, type StatRow } from '@/systems/items';
import { CraftPanel } from '../components/CraftPanel';
import { ItemIcon } from '../components/ItemIcon';
import { useStore } from '../context';
import { pushToast } from '../uiState';

type Tab = 'craft' | 'mods' | 'repair' | 'upgrades';

export function Workbench({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const cc = craftContext(store.ctx, 'workbench', entry.props?.tier as number | undefined);
  const home = !!store.state.zone?.safe;
  const [tab, setTab] = useState<Tab>('craft');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'craft', label: 'Craft' },
    { id: 'mods', label: 'Mods' },
    { id: 'repair', label: 'Repair & dismantle' },
    ...(home ? [{ id: 'upgrades' as Tab, label: 'Safehouse' }] : []),
  ];
  return (
    <div class="screen dim" data-screen="workbench">
      <div class="panel craft-panel">
        <div class="panel-header">
          <h2>Workbench</h2>
          <span class="muted">tier {cc.tier}</span>
          <div class="screen-tabs" style={{ flex: 'none' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                class={`tab ${tab === t.id ? 'active' : ''}`}
                data-tab={t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button class="btn btn-small close-x" onClick={() => store.close('workbench')}>
            ✕
          </button>
        </div>
        {tab === 'craft' ? <CraftPanel cc={cc} /> : null}
        {tab === 'mods' ? <ModsTab /> : null}
        {tab === 'repair' ? <RepairTab cc={cc} /> : null}
        {tab === 'upgrades' ? <UpgradesTab /> : null}
      </div>
    </div>
  );
}

function StatCompare({ before, after }: { before: StatRow[]; after: StatRow[] }) {
  return (
    <table class="stat-table">
      <thead>
        <tr>
          <td />
          <td class="muted small num">before</td>
          <td class="muted small num">after</td>
        </tr>
      </thead>
      <tbody>
        {after.map((a) => {
          const b = before.find((x) => x.label === a.label);
          let cls = '';
          if (b && a.better && b.value !== a.value)
            cls = (a.better === 'higher') === a.value > b.value ? 'good' : 'bad';
          return (
            <tr key={a.label}>
              <td class="muted">{a.label}</td>
              <td class="num dim-text">{b ? b.fmt(b.value) : '—'}</td>
              <td class={`num ${cls}`}>{a.fmt(a.value)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ModsTab() {
  const store = useStore();
  const ctx = store.ctx;
  const content = store.content;
  const weapons = store.state.player.inventory.filter(
    (s) => (content.items[s.itemId]?.weapon?.modSlots.length ?? 0) > 0,
  );
  const [wUid, setW] = useState<string | null>(weapons[0]?.uid ?? null);
  const [pick, setPick] = useState<{ slot: ModSlot; modUid: string | null } | null>(null);
  const w = findStack(ctx, wUid);
  const mods = store.state.player.inventory.filter((s) => content.items[s.itemId]?.mod);
  const preview =
    w && pick
      ? modPreview(ctx, w, pick.modUid ? findStack(ctx, pick.modUid)!.itemId : null, pick.slot)
      : null;
  return (
    <div class="craft-body mods-body">
      <div class="craft-list">
        <div class="section-title">Weapons with mod slots</div>
        {weapons.length === 0 ? (
          <div class="dim-text empty-note">No moddable weapons in your pack.</div>
        ) : null}
        {weapons.map((s) => (
          <div
            key={s.uid}
            class={`item-row ${wUid === s.uid ? 'selected' : ''}`}
            onClick={() => {
              setW(s.uid);
              setPick(null);
            }}
          >
            <ItemIcon itemId={s.itemId} size={28} />
            <span class="item-row-name" style={{ color: RARITY_COLOR[content.items[s.itemId]!.rarity] }}>
              {content.items[s.itemId]!.name}
            </span>
          </div>
        ))}
      </div>
      <div class="craft-detail">
        {w ? (
          <>
            {content.items[w.itemId]!.weapon!.modSlots.map((slot) => {
              const cur = w.mods?.[slot];
              const fits = mods.filter((m) => modFits(content, w, m.itemId) === slot);
              return (
                <div key={slot} class="mod-slot">
                  <div class="mod-slot-head">
                    <span class="accent">{slot}</span>
                    <span>{cur ? content.items[cur]?.name : <span class="dim-text">empty</span>}</span>
                    {cur ? (
                      <button class="btn btn-small" onClick={() => setPick({ slot, modUid: null })}>
                        Remove…
                      </button>
                    ) : null}
                  </div>
                  <div class="mod-options">
                    {fits.length === 0 ? (
                      <span class="dim-text small">No fitting mods in your pack.</span>
                    ) : null}
                    {fits.map((m) => (
                      <button
                        key={m.uid}
                        class={`chip-btn ${pick?.modUid === m.uid ? 'active' : ''}`}
                        onClick={() => setPick({ slot, modUid: m.uid })}
                      >
                        {content.items[m.itemId]!.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {preview && pick ? (
              <>
                <StatCompare before={preview.before} after={preview.after} />
                <button
                  class="btn btn-primary craft-btn"
                  data-action="apply-mod"
                  onClick={() => {
                    const r = pick.modUid
                      ? attachMod(ctx, w.uid, pick.modUid)
                      : detachMod(ctx, w.uid, pick.slot);
                    pushToast(store, r.message, r.ok ? 'good' : 'warn');
                    setPick(null);
                    store.notify();
                  }}
                >
                  {pick.modUid ? 'Attach mod' : 'Remove mod'}
                </button>
              </>
            ) : (
              <div class="muted small">Pick a mod to preview its effect.</div>
            )}
          </>
        ) : (
          <div class="dim-text empty-note">Select a weapon.</div>
        )}
      </div>
    </div>
  );
}

function RepairTab({ cc }: { cc: CraftContext }) {
  const store = useStore();
  const ctx = store.ctx;
  const content = store.content;
  const items = store.state.player.inventory.filter(
    (s) => s.maxDurability !== undefined || (content.items[s.itemId]?.dismantle?.length ?? 0) > 0,
  );
  return (
    <div class="repair-list">
      {items.length === 0 ? <div class="dim-text empty-note">Nothing to repair or take apart.</div> : null}
      {items.map((s) => {
        const d = content.items[s.itemId]!;
        const cost = repairCost(ctx, s);
        const parts = dismantleYield(ctx, s);
        const worn = s.maxDurability !== undefined && (s.durability ?? 0) < s.maxDurability;
        return (
          <div key={s.uid} class="repair-row">
            <ItemIcon itemId={s.itemId} size={34} qty={s.qty} />
            <div class="repair-name">
              <div style={{ color: RARITY_COLOR[d.rarity] }}>{d.name}</div>
              {s.maxDurability !== undefined ? (
                <div class="muted small num">
                  {Math.round(s.durability ?? 0)}/{s.maxDurability}
                  {(s.durability ?? 0) <= 0 ? <span class="bad"> broken</span> : null}
                </div>
              ) : null}
            </div>
            <div class="repair-cost small">
              {worn ? (
                <>
                  {cost.map((c) => (
                    <span key={c.itemId} class={available(ctx, cc, c.itemId) >= c.qty ? 'good' : 'bad'}>
                      {c.qty}× {content.items[c.itemId]?.name}{' '}
                    </span>
                  ))}
                  <span class="muted">→ max {repairedMax(ctx, s)}</span>
                </>
              ) : (
                <span class="dim-text">{s.maxDurability !== undefined ? 'In good repair' : ''}</span>
              )}
            </div>
            <button
              class="btn btn-small"
              disabled={!worn || !canRepair(ctx, s, cc)}
              onClick={() => {
                const r = repair(ctx, s.uid, cc);
                pushToast(store, r.message, r.ok ? 'good' : 'warn');
                store.notify();
              }}
            >
              Repair
            </button>
            <button
              class="btn btn-small btn-danger"
              disabled={!parts.length}
              title={parts.map((p) => `${p.qty}× ${content.items[p.itemId]?.name}`).join(', ')}
              onClick={() => {
                const r = dismantle(ctx, s.uid);
                pushToast(store, r.message, r.ok ? 'good' : 'warn');
                store.notify();
              }}
            >
              Dismantle
            </button>
          </div>
        );
      })}
      <div class="muted small repair-note">
        Each repair costs a little maximum durability. Dismantling returns about half the parts, plus any
        mods.
      </div>
    </div>
  );
}

const STATION_TITLE: Record<string, string> = {
  workbench: 'Workbench',
  stove: 'Stove',
  reloading: 'Reloading bench',
  rainCollector: 'Rain collector',
};

function UpgradesTab() {
  const store = useStore();
  const ctx = store.ctx;
  const cc = craftContext(ctx, 'workbench');
  return (
    <div class="repair-list">
      {store.content.stationUpgrades.map((u) => {
        const st = upgradeState(ctx, u);
        return (
          <div key={`${u.station}${u.tier}`} class="repair-row">
            <div class="repair-name">
              <div>
                {STATION_TITLE[u.station]}{' '}
                {u.station === 'workbench' || u.station === 'stove' ? `tier ${u.tier}` : ''}
              </div>
              <div class="muted small">{u.description}</div>
            </div>
            <div class="repair-cost small">
              {u.cost.map((c) => (
                <span key={c.itemId} class={available(ctx, cc, c.itemId) >= c.qty ? 'good' : 'bad'}>
                  {c.qty}× {store.content.items[c.itemId]?.name}{' '}
                </span>
              ))}
            </div>
            {st === 'built' ? (
              <span class="good small">Built</span>
            ) : st === 'locked' ? (
              <span class="dim-text small">Locked</span>
            ) : st === 'needsPrevious' ? (
              <span class="dim-text small">Needs previous tier</span>
            ) : (
              <button
                class="btn btn-small btn-primary"
                disabled={!canAffordUpgrade(ctx, u)}
                onClick={() => {
                  const r = buildUpgrade(ctx, u);
                  pushToast(store, r.message, r.ok ? 'good' : 'warn');
                  store.notify();
                }}
              >
                Build
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
