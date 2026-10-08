import type { SettingsState } from '@/core/types';
import { Modal } from '../components/Modal';
import { useStore } from '../context';

export function Settings() {
  const store = useStore();
  const s = store.settings;
  const set = <K extends keyof SettingsState>(k: K, v: SettingsState[K]) => {
    s[k] = v;
    store.saveSettings();
  };
  const slider = (k: 'masterVolume' | 'sfxVolume', label: string) => (
    <label class="setting">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={s[k]}
        onInput={(e) => set(k, Number((e.target as HTMLInputElement).value))}
      />
      <span class="num">{Math.round(s[k] * 100)}%</span>
    </label>
  );
  const toggle = (
    k: 'screenShake' | 'damageNumbers' | 'hints' | 'inventoryPausesClock',
    label: string,
    help?: string,
  ) => (
    <label class="setting">
      <span>
        {label}
        {help ? <span class="setting-help muted">{help}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={s[k]}
        onChange={(e) => set(k, (e.target as HTMLInputElement).checked)}
      />
      <span />
    </label>
  );
  return (
    <Modal id="settings" title="Settings" width={560}>
      {slider('masterVolume', 'Master volume')}
      {slider('sfxVolume', 'Sound effects')}
      {toggle('screenShake', 'Screen shake')}
      {toggle('damageNumbers', 'Damage numbers')}
      {toggle('hints', 'Tutorial hints')}
      {toggle(
        'inventoryPausesClock',
        'Inventory pauses the clock',
        'Inventory, loot and journal stop time in the field',
      )}
      <label class="setting">
        <span>UI scale</span>
        <input
          type="range"
          min={0.8}
          max={1.3}
          step={0.05}
          value={s.uiScale}
          onInput={(e) => set('uiScale', Number((e.target as HTMLInputElement).value))}
        />
        <span class="num">{Math.round(s.uiScale * 100)}%</span>
      </label>
    </Modal>
  );
}
