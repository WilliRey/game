import { BALANCE } from '@/config/balance';
import { dayOf, formatClock, isNight } from '@/core/time';
import { QUICK_SLOT_COUNT, WEAPON_SLOTS, type WeaponSlot } from '@/core/types';
import {
  activeWeaponSummary,
  carriedWeight,
  carryCapacity,
  equippedIn,
  findStack,
} from '@/systems/inventory';
import { currentObjectives, questDef } from '@/systems/quests';
import { useHeartbeat, useStore } from '../context';
import {
  IconBolt,
  IconCrouch,
  IconDrop,
  IconEar,
  IconFlashlight,
  IconFood,
  IconHeart,
  IconMoon,
  IconSun,
  IconWeight,
} from '../icons';
import { ItemIcon } from '../components/ItemIcon';
import { EffectChips } from './EffectChips';
import { HintPanel } from './HintPanel';
import { SaveIndicator } from './SaveIndicator';
import { Toasts } from './Toasts';

const SLOT_LABEL: Record<WeaponSlot, string> = { firearm1: '1', firearm2: '2', melee: '3', throwable: '4' };

function Bar({ value, max, color, low }: { value: number; max: number; color: string; low?: boolean }) {
  const pct = Math.max(0, Math.min(1, value / max)) * 100;
  return (
    <div class={`bar ${low ? 'bar-low' : ''}`}>
      <div class="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Vital({
  icon,
  label,
  value,
  max,
  color,
}: {
  icon: preact.JSX.Element;
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const low = value / max < BALANCE.needs.lowThreshold / 100;
  return (
    <div class={`vital ${low ? 'vital-low' : ''}`} title={label}>
      <span class="vital-icon" style={{ color }}>
        {icon}
      </span>
      <Bar value={value} max={max} color={color} low={low} />
      <span class="vital-num num">{Math.ceil(value)}</span>
    </div>
  );
}

export function Hud() {
  const store = useStore();
  useHeartbeat(10);
  const s = store.state;
  const zone = s?.zone;
  if (!s || !zone) return null;
  const ctx = store.ctx;
  const p = s.player;
  const night = isNight(s.time.minutes);
  const zoneName = store.content.zones[zone.zoneId]?.name ?? zone.zoneId;
  const weapon = activeWeaponSummary(ctx);
  const tracked = s.trackedQuest ? questDef(ctx, s.trackedQuest) : undefined;
  const objectives = s.trackedQuest ? currentObjectives(ctx, s.trackedQuest) : [];
  const weight = carriedWeight(ctx);
  const cap = carryCapacity(ctx);
  const noise = zone.player.noise;

  return (
    <div class="hud" data-hud>
      <div class="hud-clock panel-lite">
        <span class={night ? 'moon' : 'sun'}>
          {night ? <IconMoon size={18} title="Night" /> : <IconSun size={18} title="Day" />}
        </span>
        <span class="clock-day">Day {dayOf(s.time.minutes)}</span>
        <span class="clock-time num">{formatClock(s.time.minutes)}</span>
        {night ? <span class="clock-night">Night</span> : null}
        <div class="clock-zone">{zoneName}</div>
      </div>

      {tracked && objectives.length ? (
        <div class="hud-objective panel-lite" data-objective>
          <div class="obj-quest">{tracked.name}</div>
          {objectives
            .filter((o) => !o.ob.optional || !o.done)
            .map((o) => (
              <div key={o.ob.id} class={`obj-line ${o.done ? 'done' : ''}`}>
                <span class="obj-box">{o.done ? '✓' : '•'}</span>
                {o.ob.text}
                {o.ob.count > 1 ? (
                  <span class="num muted">
                    {' '}
                    {Math.min(o.current, o.ob.count)}/{o.ob.count}
                  </span>
                ) : null}
              </div>
            ))}
        </div>
      ) : null}

      <Toasts />

      <div class="hud-vitals panel-lite">
        <Vital icon={<IconHeart />} label="Health" value={p.hp} max={p.maxHp} color="#d0503f" />
        <Vital icon={<IconBolt />} label="Stamina" value={p.stamina} max={p.maxStamina} color="#d9c34a" />
        <Vital icon={<IconFood />} label="Hunger" value={p.hunger} max={100} color="#c08a4a" />
        <Vital icon={<IconDrop />} label="Thirst" value={p.thirst} max={100} color="#5a9ad0" />
        <div class="vital" title="Noise you are making">
          <span class="vital-icon" style={{ color: '#b0a890' }}>
            <IconEar />
          </span>
          <div class="bar noise-bar">
            <div
              class="bar-fill"
              style={{
                width: `${Math.min(100, (noise / 20) * 100)}%`,
                background: noise > 10 ? '#d0503f' : noise > 5 ? '#d8913a' : '#8a9a7a',
              }}
            />
          </div>
          <span class="vital-num num">{noise.toFixed(0)}</span>
        </div>
        <div class="hud-flags">
          <span class={`flag-chip ${weight > cap ? 'bad' : ''}`} title="Carried weight / capacity">
            <IconWeight size={13} /> <span class="num">{weight.toFixed(1)}</span>/
            <span class="num">{cap}</span> kg
          </span>
          {p.flashlightOn ? (
            <span class="flag-chip accent" title="Flashlight on (F)">
              <IconFlashlight size={13} /> Light
            </span>
          ) : null}
          {zone.player.crouched ? (
            <span class="flag-chip" title="Crouching (C)">
              <IconCrouch size={13} /> Sneak
            </span>
          ) : null}
        </div>
        <EffectChips />
      </div>

      <div class="hud-quick">
        {Array.from({ length: QUICK_SLOT_COUNT }, (_, i) => {
          const st = findStack(ctx, p.quickSlots[i]);
          return (
            <div class="qslot" key={i} title={st ? store.content.items[st.itemId]?.name : 'Empty quick slot'}>
              <span class="qkey">{i + 5}</span>
              {st ? <ItemIcon itemId={st.itemId} qty={st.qty} size={34} /> : null}
            </div>
          );
        })}
      </div>

      <div class="hud-weapon panel-lite">
        <div class="weapon-name">
          {weapon.name}
          {weapon.broken ? <span class="bad"> (broken)</span> : null}
        </div>
        <div class="weapon-row">
          {weapon.ammo ? (
            <span class="weapon-ammo num">{weapon.ammo}</span>
          ) : (
            <span class="muted">{zone.safe ? 'Holstered' : '—'}</span>
          )}
          {weapon.condition !== undefined ? (
            <span class="weapon-cond" title="Durability">
              <Bar value={weapon.condition} max={1} color={weapon.condition < 0.25 ? '#d0503f' : '#9aa48a'} />
              <span class="num">{Math.round(weapon.condition * 100)}%</span>
            </span>
          ) : null}
        </div>
        <div class="weapon-slots">
          {WEAPON_SLOTS.map((slot) => {
            const st = equippedIn(ctx, slot);
            return (
              <div
                key={slot}
                class={`wslot ${p.activeSlot === slot ? 'active' : ''}`}
                title={st ? store.content.items[st.itemId]?.name : slot === 'melee' ? 'Fists' : 'Empty'}
              >
                <span class="qkey">{SLOT_LABEL[slot]}</span>
                {st ? <ItemIcon itemId={st.itemId} qty={st.qty > 1 ? st.qty : undefined} size={30} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      <HintPanel />
      <SaveIndicator />
    </div>
  );
}
