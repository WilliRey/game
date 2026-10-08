import { useState } from 'preact/hooks';
import { DIFFICULTY_PRESETS, type Difficulty } from '@/config/balance';
import type { ClassDef } from '@/content/schemas';
import { fillNames } from '@/content';
import { DEFAULT_CLASS } from '@/systems/classes';
import { startNewGame } from '@/systems/session';
import { Modal } from '../components/Modal';
import { ItemIcon } from '../components/ItemIcon';
import { useStore } from '../context';

/** New game: pick a difficulty, then Sam's background (BRIEF_V2 §4), then begin. */
export function NewGame() {
  const store = useStore();
  const [step, setStep] = useState<'difficulty' | 'class'>('difficulty');
  const [pick, setPick] = useState<Difficulty>('survivor');
  const [cls, setCls] = useState<string>(DEFAULT_CLASS);
  const pct = (v: number) => `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  const names = store.content.names;
  const classes = store.content.lists.classes;
  const chosen = store.content.classes[cls] ?? classes[0]!;

  if (step === 'difficulty')
    return (
      <Modal
        id="newGame"
        title="New game"
        width={760}
        footer={
          <>
            <button class="btn" onClick={() => store.close('newGame')}>
              Back
            </button>
            <button class="btn btn-primary" data-action="next" onClick={() => setStep('class')}>
              Next: who was Sam?
            </button>
          </>
        }
      >
        <p class="muted">
          {names.city ?? 'Harrow City'}, day 23 of the outbreak. You are {names.sam ?? 'Sam Keller'}. The food
          ran out this morning, and your sister Jo hasn't called since the city fell.
        </p>
        <div class="difficulty-cards">
          {(Object.keys(DIFFICULTY_PRESETS) as Difficulty[]).map((d) => {
            const p = DIFFICULTY_PRESETS[d];
            return (
              <button
                key={d}
                class={`diff-card ${pick === d ? 'selected' : ''}`}
                data-difficulty={d}
                onClick={() => setPick(d)}
              >
                <div class="diff-name">{p.label}</div>
                <div class="diff-desc">{p.description}</div>
                <ul class="diff-stats muted">
                  <li>Damage taken {pct(p.playerDamageTaken)}</li>
                  <li>Zombie health {pct(p.zombieHp)}</li>
                  <li>Needs drain {pct(p.needsDrain)}</li>
                  <li>Loot {pct(p.lootQuantity)}</li>
                </ul>
              </button>
            );
          })}
        </div>
      </Modal>
    );

  return (
    <Modal
      id="newGame"
      title="Who was Sam before?"
      width={1060}
      footer={
        <>
          <button class="btn" data-action="back" onClick={() => setStep('difficulty')}>
            Back
          </button>
          <button
            class="btn btn-primary"
            data-action="start"
            onClick={() => startNewGame(store, pick, undefined, chosen.id)}
          >
            Begin as the {chosen.name}
          </button>
        </>
      }
    >
      <div class="class-picker">
        <div class="class-cards">
          {classes.map((c) => (
            <button
              key={c.id}
              class={`diff-card class-card ${cls === c.id ? 'selected' : ''}`}
              data-class={c.id}
              onClick={() => setCls(c.id)}
            >
              <div class="diff-name">{c.name}</div>
              <div class="diff-desc muted">{c.tagline}</div>
              <div class="class-card-ability">
                <kbd class="kbd">Q</kbd> {c.ability.name}
              </div>
            </button>
          ))}
        </div>
        <ClassDetails c={chosen} names={{ ...names, ...chosen.names }} />
      </div>
    </Modal>
  );
}

function ClassDetails({ c, names }: { c: ClassDef; names: Record<string, string> }) {
  const store = useStore();
  const content = store.content;
  const skills = Object.entries(c.skills).filter(([, r]) => (r ?? 0) > 0);
  const gadgets = content.lists.recipes.filter((r) => r.class === c.id);
  return (
    <div class="class-details" data-class-details={c.id}>
      <p class="class-blurb">
        <strong>{fillNames(`You are {sam}, {sam_job}.`, names)}</strong> {c.description}
      </p>
      <div class="class-cols">
        <section>
          <h4>Starting kit</h4>
          <ul class="class-kit">
            {c.kit.map((k) => {
              const def = content.items[k.itemId];
              return (
                <li key={k.itemId}>
                  <ItemIcon itemId={k.itemId} size={24} />
                  <span>
                    {def?.name ?? k.itemId}
                    {k.qty > 1 ? ` ×${k.qty}` : ''}
                    {k.mag ? ` (${k.mag} loaded)` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
          <div class="muted small">Plus a flashlight, two bottles, a bandage and some dirty water.</div>
          <h4>Skills</h4>
          <div class="class-skills">
            {skills.map(([id, r]) => (
              <span key={id} class="flag-chip">
                {content.skills[id]?.name ?? id} {r}
              </span>
            ))}
          </div>
        </section>
        <section>
          <h4>
            Perk · <span class="accent">{c.perk.name}</span>
          </h4>
          <p>{c.perk.description}</p>
          <h4>
            Ability · <kbd class="kbd">Q</kbd> <span class="accent">{c.ability.name}</span>
          </h4>
          <p>
            {c.ability.description} <span class="muted">Recharges in {c.ability.cooldownSec} s.</span>
          </p>
          <h4>Class gadget</h4>
          {gadgets.map((r) => {
            const out = content.items[r.output.itemId];
            return (
              <p key={r.id}>
                <span class="accent">{out?.name ?? r.output.itemId}</span> — {out?.description}{' '}
                <span class="muted">
                  ({r.inputs.map((i) => `${content.items[i.itemId]?.name ?? i.itemId} ×${i.qty}`).join(', ')}
                  {r.tool ? `; needs a ${content.items[r.tool]?.name ?? r.tool}` : ''})
                </span>
              </p>
            );
          })}
        </section>
      </div>
    </div>
  );
}
