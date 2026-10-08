import { SKILL_IDS } from '@/core/types';
import { canRaise, raiseSkill, xpForLevel } from '@/systems/progression';
import { ScreenTabs } from '../components/Tabs';
import { useStore } from '../context';

export function Skills() {
  const store = useStore();
  const p = store.state.player;
  const cur = xpForLevel(p.level);
  const next = xpForLevel(p.level + 1);
  return (
    <div class="screen dim" data-screen="skills">
      <div class="panel" style={{ width: '820px' }}>
        <div class="panel-header">
          <ScreenTabs current="skills" />
          <button class="btn btn-small close-x" onClick={() => store.close('skills')}>
            ✕
          </button>
        </div>
        <div class="panel-body">
          <div class="level-row">
            <span class="level-num">Level {p.level}</span>
            <div class="bar xp-bar">
              <div
                class="bar-fill"
                style={{
                  width: `${((p.xp - cur) / Math.max(1, next - cur)) * 100}%`,
                  background: 'var(--accent)',
                }}
              />
            </div>
            <span class="num muted">
              {p.xp - cur}/{next - cur} XP
            </span>
            <span class={p.skillPoints ? 'accent' : 'muted'}>
              {p.skillPoints} skill point{p.skillPoints === 1 ? '' : 's'}
            </span>
          </div>
          <p class="muted small">
            XP comes from kills, quests, discoveries and crafting. Each level gives one skill point.
          </p>
          {SKILL_IDS.map((id) => {
            const def = store.content.skills[id];
            const r = p.skills[id];
            return (
              <div key={id} class="skill-row" data-skill={id}>
                <div class="skill-name">
                  <div>{def?.name ?? id}</div>
                  <div class="muted small">{def?.description}</div>
                </div>
                <div class="pips">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} class={`pip ${i <= r ? 'on' : ''}`} />
                  ))}
                </div>
                <div class="skill-desc small">
                  <div>{r > 0 ? def?.ranks[r - 1] : <span class="dim-text">No bonus yet</span>}</div>
                  {r < 5 ? <div class="muted">Next: {def?.ranks[r]}</div> : null}
                </div>
                <button
                  class="btn btn-small btn-primary"
                  disabled={!canRaise(store.ctx, id)}
                  onClick={() => {
                    raiseSkill(store.ctx, id);
                    store.notify();
                  }}
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
