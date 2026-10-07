import { useStore } from '../context';
import { IconBio, IconBlood, IconPlus, IconStomach, IconWeight } from '../icons';

/** Status effect icons with labels and values (brief: icon plus text, not color alone). */
export function EffectChips() {
  const store = useStore();
  const effects = store.state.player.effects;
  if (!effects.length) return null;
  return (
    <div class="effects">
      {effects.map((e) => {
        switch (e.id) {
          case 'bleeding':
            return (
              <span key={e.id} class="effect bad" title="Bleeding: use a bandage">
                <IconBlood size={13} /> Bleeding
              </span>
            );
          case 'infection':
            return (
              <span key={e.id} class="effect bad" title="Infected: antibiotics knock it back">
                <IconBio size={13} /> Infected {Math.round(e.value)}%
              </span>
            );
          case 'food_poisoning':
            return (
              <span key={e.id} class="effect warn" title="Food poisoning: passes with time">
                <IconStomach size={13} /> Sick {Math.ceil(e.value)}m
              </span>
            );
          case 'encumbered':
            return (
              <span key={e.id} class="effect warn" title="Encumbered: slower, no sprinting">
                <IconWeight size={13} /> Encumbered
              </span>
            );
          case 'well_fed':
            return (
              <span key={e.id} class="effect good" title="Well-fed: slow health regeneration">
                <IconPlus size={13} /> Well-fed
              </span>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
