/**
 * Needs and status effects (brief §5 Survival): hunger and thirst drain over game time, low values
 * debuff, zero values hurt; bleeding, infection, food poisoning, encumbered and well-fed. Also item use
 * (eat, drink, medicine, blueprints, notes) and damage/healing with armor and difficulty applied.
 */
import { BALANCE, difficultyOf } from '@/config/balance';
import type { GameContext } from '@/core/store';
import type { EffectId, StatusEffect, Uid } from '@/core/types';
import { perk } from './classes';
import { equippedIn, findStack, isEncumbered, removeStack } from './inventory';
import { SKILL, rank } from './progression';
import { learnRecipe, readNote, showHint } from './story';

export function getEffect(ctx: GameContext, id: EffectId): StatusEffect | undefined {
  return ctx.state.player.effects.find((e) => e.id === id);
}
export function hasEffect(ctx: GameContext, id: EffectId): boolean {
  return !!getEffect(ctx, id);
}

export function addEffect(ctx: GameContext, id: EffectId, value = 0): StatusEffect {
  let e = getEffect(ctx, id);
  if (!e) {
    e = { id, value };
    ctx.state.player.effects.push(e);
    ctx.bus.emit('effect:added', { effect: id });
    const hint: Partial<Record<EffectId, string>> = {
      bleeding: 'bleeding',
      infection: 'infection',
      food_poisoning: 'food_poisoning',
      encumbered: 'encumbered',
    };
    if (hint[id]) showHint(ctx, hint[id]!);
  } else if (id === 'food_poisoning' || id === 'bleeding') {
    e.value = Math.max(e.value, value);
  }
  return e;
}

export function removeEffect(ctx: GameContext, id: EffectId): void {
  const list = ctx.state.player.effects;
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  list.splice(i, 1);
  ctx.bus.emit('effect:removed', { effect: id });
}
export const cureEffect = removeEffect;

export function healPlayer(ctx: GameContext, hp: number): void {
  const p = ctx.state.player;
  p.hp = Math.min(p.maxHp, p.hp + hp * SKILL.healing(rank(ctx, 'survival')));
}

export function armorReduction(ctx: GameContext): { damage: number; infection: number; noise: number } {
  let damage = 0;
  let infection = 0;
  let noise = 0;
  for (const slot of ['head', 'torso'] as const) {
    const s = equippedIn(ctx, slot);
    const a = s ? ctx.content.items[s.itemId]?.armor : undefined;
    if (!a || (s?.durability !== undefined && s.durability <= 0)) continue;
    damage += a.damageReduction;
    infection += a.infectionReduction;
    noise += a.noisePenalty;
  }
  return { damage: Math.min(0.5, damage), infection: Math.min(0.7, infection), noise };
}

export interface DamageOptions {
  /** Skip armor and difficulty (scripted damage, needs, effects). */
  raw?: boolean;
  infectionChance?: number;
  bleedChance?: number;
}

/** Hurt the player. Returns the damage actually taken. */
export function damagePlayer(
  ctx: GameContext,
  amount: number,
  source: string,
  opts: DamageOptions = {},
): number {
  const p = ctx.state.player;
  if (p.godMode || p.dead || amount <= 0) return 0;
  let dmg = amount;
  const armor = armorReduction(ctx);
  if (!opts.raw) dmg *= (1 - armor.damage) * difficultyOf(ctx.state.difficulty).playerDamageTaken;
  p.hp = Math.max(0, p.hp - dmg);
  p.lastCombatAt = ctx.state.time.minutes;
  ctx.bus.emit('player:damaged', { amount: dmg, source });
  if (opts.infectionChance && !hasEffect(ctx, 'infection')) {
    const chance =
      opts.infectionChance * (1 - armor.infection) * difficultyOf(ctx.state.difficulty).infectionChance;
    if (ctx.rng.chance(chance)) addEffect(ctx, 'infection', 5);
  }
  if (opts.bleedChance && ctx.rng.chance(opts.bleedChance * (1 - armor.damage)))
    addEffect(ctx, 'bleeding', BALANCE.health.bleedMinutes);
  if (p.hp <= 0) killPlayer(ctx, source);
  return dmg;
}

export function killPlayer(ctx: GameContext, cause: string): void {
  const p = ctx.state.player;
  if (p.dead || p.godMode) return;
  p.hp = 0;
  p.dead = true;
  ctx.bus.emit('player:died', { cause });
}

export type TimeMode = 'active' | 'sleep' | 'travel';

/** Advance needs and effects by `minutes` of game time. */
export function survivalTick(ctx: GameContext, minutes: number, mode: TimeMode, exertion: boolean): void {
  const p = ctx.state.player;
  if (p.dead) return;
  const n = BALANCE.needs;
  const h = BALANCE.health;
  const mult =
    difficultyOf(ctx.state.difficulty).needsDrain *
    SKILL.needsDrain(rank(ctx, 'survival')) *
    (mode === 'sleep' ? n.sleepMultiplier : exertion ? n.exertionMultiplier : 1);
  const hungerBefore = p.hunger;
  const thirstBefore = p.thirst;
  const poison = getEffect(ctx, 'food_poisoning');
  p.hunger = Math.max(0, p.hunger - (minutes * 100 * mult) / (n.hungerHoursToEmpty * 60));
  p.thirst = Math.max(
    0,
    p.thirst - (minutes * 100 * mult * (poison ? 1.6 : 1)) / (n.thirstHoursToEmpty * 60),
  );
  if (hungerBefore >= n.lowThreshold && p.hunger < n.lowThreshold) {
    ctx.bus.emit('need:low', { need: 'hunger' });
    showHint(ctx, 'hungry');
  }
  if (thirstBefore >= n.lowThreshold && p.thirst < n.lowThreshold) {
    ctx.bus.emit('need:low', { need: 'thirst' });
    showHint(ctx, 'thirsty');
  }

  let hpDelta = 0;
  if (p.hunger <= 0) hpDelta -= (n.starvingHpPerHour / 60) * minutes;
  if (p.thirst <= 0) hpDelta -= (n.dehydratedHpPerHour / 60) * minutes;
  const bleed = getEffect(ctx, 'bleeding');
  if (bleed) {
    hpDelta -= h.bleedHpPerMinute * Math.min(minutes, Math.max(0, bleed.value));
    bleed.value -= minutes;
    if (bleed.value <= 0) {
      removeEffect(ctx, 'bleeding');
      ctx.bus.emit('ui:toast', { text: 'The bleeding has stopped on its own.', kind: 'info' });
    }
  }
  if (poison) {
    hpDelta -= h.foodPoisoningHpPerMinute * minutes;
    poison.value -= minutes;
    if (poison.value <= 0) removeEffect(ctx, 'food_poisoning');
  }
  const inf = getEffect(ctx, 'infection');
  if (inf) {
    inf.value += (100 / (h.infectionHoursToDeath * 60)) * minutes * perk(ctx).infectionRate;
    if (inf.value >= 75) hpDelta -= 0.05 * minutes;
    if (inf.value >= 100) {
      killPlayer(ctx, 'infection');
      return;
    }
  }
  const wellFed = p.hunger >= n.wellFedThreshold && p.thirst >= n.wellFedThreshold;
  if (wellFed && !hasEffect(ctx, 'well_fed')) addEffect(ctx, 'well_fed');
  if (!wellFed && hasEffect(ctx, 'well_fed')) removeEffect(ctx, 'well_fed');
  if (wellFed) hpDelta += n.wellFedRegenPerMinute * minutes;
  if (mode === 'sleep') hpDelta += (h.sleepHealPerHour / 60) * minutes;
  if (hpDelta > 0) healPlayer(ctx, hpDelta);
  else if (hpDelta < 0 && !p.godMode) {
    p.hp = Math.max(0, p.hp + hpDelta);
    if (p.hp <= 0)
      killPlayer(ctx, p.thirst <= 0 ? 'dehydration' : p.hunger <= 0 ? 'starvation' : 'blood loss');
  }
  if (p.hp < 30 && p.hp > 0) showHint(ctx, 'low_hp');
}

/** Keep the encumbered effect in sync with carried weight (called each frame and after inventory changes). */
export function updateEncumbrance(ctx: GameContext): boolean {
  const enc = isEncumbered(ctx);
  if (enc && !hasEffect(ctx, 'encumbered')) addEffect(ctx, 'encumbered');
  if (!enc && hasEffect(ctx, 'encumbered')) removeEffect(ctx, 'encumbered');
  return enc;
}

/** Max stamina after infection debuff. */
export function maxStamina(ctx: GameContext): number {
  const inf = getEffect(ctx, 'infection');
  return ctx.state.player.maxStamina * (inf && inf.value > 50 ? 0.75 : 1);
}

/** Use an item from the inventory. Returns a short message for the UI, or null if it can't be used. */
export function useItem(ctx: GameContext, uid: Uid): string | null {
  const s = findStack(ctx, uid);
  if (!s) return null;
  const def = ctx.content.items[s.itemId];
  if (!def) return null;
  const p = ctx.state.player;
  if (def.note) {
    readNote(ctx, def.note.noteId);
    ctx.bus.emit('item:used', { itemId: s.itemId });
    return null;
  }
  if (def.blueprint) {
    const learned = learnRecipe(ctx, def.blueprint.recipeId);
    if (!learned) return 'You already know that recipe.';
    removeStack(ctx, uid, 1, 'read');
    ctx.bus.emit('item:used', { itemId: s.itemId });
    return `Learned: ${ctx.content.items[ctx.content.recipes[def.blueprint.recipeId]?.output.itemId ?? '']?.name ?? ''}`;
  }
  if (def.fuel) {
    const v = ctx.state.vehicle;
    if (!v.owned) return 'Nothing to put it in yet.';
    if (v.fuel + def.fuel.liters > v.maxFuel + 0.01) return 'The tank is full.';
    v.fuel = Math.min(v.maxFuel, v.fuel + def.fuel.liters);
    removeStack(ctx, uid, 1, 'refuel');
    ctx.bus.emit('item:used', { itemId: s.itemId });
    ctx.bus.emit('sfx:play', { key: 'siphon' });
    return `Poured ${def.fuel.liters} L into the tank (${Math.round(v.fuel)}/${v.maxFuel} L).`;
  }
  const u = def.use;
  if (!u) return null;
  const msgs: string[] = [];
  if (u.hunger) p.hunger = Math.max(0, Math.min(100, p.hunger + u.hunger));
  if (u.thirst) p.thirst = Math.max(0, Math.min(100, p.thirst + u.thirst));
  if (u.hp) healPlayer(ctx, u.hp * perk(ctx).healing);
  if (u.stamina) p.stamina = Math.min(maxStamina(ctx), p.stamina + u.stamina);
  if (u.cureBleeding && hasEffect(ctx, 'bleeding')) {
    removeEffect(ctx, 'bleeding');
    msgs.push('Bleeding stopped.');
  }
  if (u.cureFoodPoisoning && hasEffect(ctx, 'food_poisoning')) {
    removeEffect(ctx, 'food_poisoning');
    msgs.push('Your stomach settles.');
  }
  if (u.antibiotic) {
    const inf = getEffect(ctx, 'infection');
    if (inf) {
      inf.value -= BALANCE.health.antibioticsReduction;
      if (inf.value <= 0) {
        removeEffect(ctx, 'infection');
        msgs.push('The infection is gone.');
      } else msgs.push(`Infection knocked back to ${Math.round(inf.value)}%.`);
    } else msgs.push('You take the antibiotics. Nothing to fight.');
  }
  if (u.foodPoisonChance && ctx.rng.chance(u.foodPoisonChance * (1 - 0.1 * rank(ctx, 'survival')))) {
    addEffect(ctx, 'food_poisoning', BALANCE.health.foodPoisoningMinutes);
    msgs.push('That did not sit well...');
  }
  removeStack(ctx, uid, 1, 'used');
  ctx.bus.emit('item:used', { itemId: s.itemId });
  ctx.bus.emit('sfx:play', {
    key: def.category === 'drink' ? 'drink' : def.category === 'medical' ? 'bandage' : 'eat',
  });
  return msgs.join(' ') || `Used ${def.name}.`;
}
