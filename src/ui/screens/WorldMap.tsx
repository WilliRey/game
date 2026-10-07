import { useState } from 'preact/hooks';
import type { WorldNodeDef } from '@/content/schemas';
import { formatClock, dayOf, isNight } from '@/core/time';
import { questZones } from '@/systems/markers';
import { currentObjectives, questDef } from '@/systems/quests';
import {
  fuelAvailable,
  nodeSearched,
  refuelVehicle,
  startTravel,
  travelPlan,
  type TravelOption,
} from '@/systems/travel';
import { countItem } from '@/systems/inventory';
import { useStore } from '../context';
import { pushToast } from '../uiState';
import { WorldMapArt } from './WorldMapArt';

export const DANGER = [
  { label: 'Safe', color: '#6fbf73' },
  { label: 'Low', color: '#c9c36a' },
  { label: 'Moderate', color: '#e0a040' },
  { label: 'High', color: '#e06a40' },
  { label: 'Extreme', color: '#d0403a' },
];

const LOOT_LABEL: Record<string, string> = {
  food: 'Food',
  materials: 'Materials',
  tools: 'Tools',
  fuel: 'Fuel',
  medical: 'Medicine',
  ammo: 'Ammo',
  junk: 'Junk',
  weapons: 'Weapons',
};

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

/**
 * The city map (brief §5): known locations with danger, loot types, % searched and quest markers.
 * Opened at a zone exit it's a travel planner (walk or drive); opened from the zone map it's view-only.
 */
export function WorldMap({ entry }: { entry: { props?: Record<string, unknown> } }) {
  const store = useStore();
  const ctx = store.ctx;
  const s = store.state;
  const content = store.content;
  const canTravel = entry.props?.atExit === true;
  const here = s.world.currentNode;
  const questZ = questZones(ctx);
  const nodes = s.world.knownNodes.map((id) => content.worldNodes[id]).filter((n): n is WorldNodeDef => !!n);
  const hasQuest = (n: WorldNodeDef) =>
    questZ.has(n.zoneId) || content.lists.zones.some((z) => z.exitNode === n.id && questZ.has(z.id));
  const initial = (canTravel && nodes.find((n) => n.id !== here && !n.lockedText && hasQuest(n))?.id) || here;
  const [sel, setSel] = useState<string>(initial);
  const selected = content.worldNodes[sel];
  const from = content.worldNodes[here];
  const zoneDef = selected ? content.zones[selected.zoneId] : undefined;
  const plan = selected ? travelPlan(ctx, here, selected.id) : null;
  const v = s.vehicle;
  const cans = countItem(ctx, 'fuel_can');
  const night = isNight(s.time.minutes);
  const searched = selected ? nodeSearched(ctx, selected.id) : { searched: 0, total: 0 };
  const visited = selected ? s.world.visitedNodes.includes(selected.id) : false;
  const tracked = s.trackedQuest ? questDef(ctx, s.trackedQuest) : undefined;
  const objective = s.trackedQuest ? currentObjectives(ctx, s.trackedQuest).find((o) => !o.done) : undefined;

  const go = (mode: 'foot' | 'vehicle') => {
    if (!selected) return;
    const err = startTravel(ctx, selected.id, mode);
    if (err) {
      pushToast(store, err, 'warn');
      return;
    }
    store.close('worldMap');
    if (s.travel?.eventId) store.open('travelEvent');
    store.notify();
  };

  const option = (o: TravelOption) => {
    const label = o.mode === 'foot' ? (o.forced ? 'Walk anyway' : 'Walk') : 'Drive';
    return (
      <div class={`travel-option ${o.available ? '' : 'off'}`} key={o.mode}>
        <button
          class={`btn ${o.available && canTravel ? 'btn-primary' : ''}`}
          data-action={o.mode === 'foot' ? 'walk' : 'drive'}
          disabled={!o.available || !canTravel}
          onClick={() => go(o.mode)}
        >
          {label} · {duration(o.minutes)}
        </button>
        <div class="muted small">
          {o.available || o.forced ? (
            <>
              {o.mode === 'vehicle' ? (
                <span>
                  Fuel <b class="num">{o.fuel} L</b> ·{' '}
                </span>
              ) : null}
              Hunger <span class="num">−{Math.round(o.hunger)}</span> · Thirst{' '}
              <span class="num">−{Math.round(o.thirst)}</span> · Encounter{' '}
              <span class="num">{Math.round(o.eventChance * 100)}%</span>
            </>
          ) : null}
          {o.reason ? <div class={o.forced ? 'warn-text' : 'bad'}>{o.reason}</div> : null}
        </div>
      </div>
    );
  };

  return (
    <div class="screen dim" data-screen="worldMap">
      <div class="panel world-panel">
        <div class="panel-header">
          <h2>{content.names.city ?? 'Harrow City'}</h2>
          <span class="muted small">
            Day {dayOf(s.time.minutes)} · {formatClock(s.time.minutes)}
            {night ? ' · night' : ''}
          </span>
          <button class="btn btn-small close-x" title="Close (Esc)" onClick={() => store.close('worldMap')}>
            ✕
          </button>
        </div>
        <div class="world-body">
          <svg class="world-map" viewBox="0 0 14 9" role="img" aria-label="World map">
            <WorldMapArt />
            {from && selected && selected.id !== here && !selected.lockedText ? (
              <line
                class="route-line"
                x1={from.x}
                y1={from.y}
                x2={selected.x}
                y2={selected.y}
                stroke={plan?.foot.available || plan?.vehicle.available ? '#f0c060' : '#a05040'}
              />
            ) : null}
            {nodes.map((n) => {
              const z = content.zones[n.zoneId];
              const danger = DANGER[Math.min(DANGER.length - 1, z?.danger ?? 0)]!;
              const isHere = n.id === here;
              const isSel = n.id === sel;
              const locked = !!n.lockedText;
              const been = s.world.visitedNodes.includes(n.id);
              return (
                <g
                  key={n.id}
                  class={`map-node ${isSel ? 'selected' : ''}`}
                  data-node={n.id}
                  onClick={() => setSel(n.id)}
                  transform={`translate(${n.x} ${n.y})`}
                >
                  <circle r="0.42" fill="transparent" />
                  {isHere ? (
                    <circle class="here-ring" r="0.32" fill="none" stroke="#ffffff" stroke-width="0.04" />
                  ) : null}
                  {locked ? (
                    <g fill="#8a8a8a">
                      <rect x="-0.14" y="-0.06" width="0.28" height="0.22" rx="0.03" />
                      <path
                        d="M-0.09,-0.06 v-0.07 a0.09,0.09 0 0 1 0.18,0 v0.07"
                        fill="none"
                        stroke="#8a8a8a"
                        stroke-width="0.045"
                      />
                    </g>
                  ) : (
                    <circle
                      r="0.17"
                      fill={been ? danger.color : '#1c1e20'}
                      stroke={danger.color}
                      stroke-width={been ? 0.03 : 0.06}
                    />
                  )}
                  {isSel ? <circle r="0.25" fill="none" stroke="#f1e6cc" stroke-width="0.035" /> : null}
                  {hasQuest(n) && !locked ? (
                    <path
                      d="M0,-0.62 l0.13,0.15 l-0.13,0.15 l-0.13,-0.15 z"
                      fill="#f0c060"
                      stroke="#000"
                      stroke-width="0.02"
                    />
                  ) : null}
                  <text class="node-label" y="0.5" text-anchor="middle">
                    {n.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <div class="world-side">
            {selected ? (
              <>
                <h3 class="node-title">{selected.name}</h3>
                <div class="muted small">{selected.description || zoneDef?.description}</div>
                {selected.lockedText ? (
                  <div class="locked-note">{selected.lockedText}</div>
                ) : (
                  <>
                    <div class="node-facts">
                      <div>
                        <span class="muted">Danger</span>
                        <span class="danger-chip" style={{ color: DANGER[zoneDef?.danger ?? 0]?.color }}>
                          ● {DANGER[Math.min(4, zoneDef?.danger ?? 0)]?.label}
                        </span>
                      </div>
                      <div>
                        <span class="muted">Loot</span>
                        <span>
                          {(zoneDef?.lootTypes ?? []).length === 0
                            ? '—'
                            : zoneDef!.lootTypes.map((l) => (
                                <span key={l} class="tag">
                                  {LOOT_LABEL[l] ?? l}
                                </span>
                              ))}
                        </span>
                      </div>
                      <div>
                        <span class="muted">Searched</span>
                        <span class="num">
                          {visited && searched.total > 0
                            ? `${Math.round((searched.searched / searched.total) * 100)}% (${searched.searched}/${searched.total})`
                            : visited
                              ? '—'
                              : 'Not visited'}
                        </span>
                      </div>
                      {plan && selected.id !== here ? (
                        <div>
                          <span class="muted">Distance</span>
                          <span class="num">{plan.km} km</span>
                        </div>
                      ) : null}
                    </div>
                    {hasQuest(selected) && tracked ? (
                      <div class="quest-note">
                        ◆ {tracked.name}
                        {objective ? <span class="muted"> — {objective.ob.text}</span> : null}
                      </div>
                    ) : null}
                    {selected.id === here ? (
                      <div class="here-note">
                        You are here.
                        {canTravel ? (
                          <button class="btn btn-small" onClick={() => store.close('worldMap')}>
                            Stay
                          </button>
                        ) : null}
                      </div>
                    ) : plan ? (
                      <div class="travel-options">
                        {option(plan.foot)}
                        {option(plan.vehicle)}
                        {!canTravel ? (
                          <div class="muted small">Go to an exit of the area to travel.</div>
                        ) : null}
                        {night && canTravel ? (
                          <div class="warn-text small">
                            It's night: encounters on the way are more likely.
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
            {v.owned ? (
              <div class="vehicle-box">
                <div class="vehicle-head">
                  <span>Ambulance</span>
                  <span class="num">
                    {Math.floor(v.fuel * 10) / 10} / {v.maxFuel} L
                  </span>
                </div>
                <div class="bar">
                  <div
                    class="bar-fill"
                    style={{ width: `${(v.fuel / v.maxFuel) * 100}%`, background: '#d9a441' }}
                  />
                </div>
                {cans > 0 ? (
                  <button
                    class="btn btn-small"
                    data-action="refuel"
                    disabled={v.fuel >= v.maxFuel - 0.01}
                    onClick={() => {
                      const added = refuelVehicle(ctx);
                      pushToast(
                        store,
                        added > 0 ? `Poured in ${added} L of fuel.` : 'The tank is full.',
                        added > 0 ? 'good' : 'info',
                      );
                      store.notify();
                    }}
                  >
                    Pour in fuel cans ({cans})
                  </button>
                ) : (
                  <div class="muted small">
                    {fuelAvailable(ctx) < 1
                      ? 'Empty. Siphon wrecks with a hose, or trade for fuel cans.'
                      : 'No spare fuel cans.'}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div class="map-legend muted small world-legend">
          {DANGER.map((d) => (
            <span key={d.label}>
              <i style={{ background: d.color, borderRadius: '50%' }} /> {d.label}
            </span>
          ))}
          <span>
            <i style={{ background: '#f0c060', transform: 'rotate(45deg)' }} /> quest
          </span>
          <span>hollow = not visited yet</span>
        </div>
      </div>
    </div>
  );
}
