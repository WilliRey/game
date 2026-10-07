/**
 * Applies the shared Effect type (dialogue choices, quest rewards, travel events, notes, radio, zone
 * objects). UI-facing effects are emitted as events; the presentation layer decides how to show them.
 */
import type { EffectT } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { passTime } from './clock';
import { addItem, removeItem } from './inventory';
import { grantXp } from './progression';
import { advanceQuest, completeQuest, failQuest, startQuest } from './quests';
import {
  changeReputation,
  learnRecipe,
  playBroadcast,
  readNote,
  setFlag,
  showHint,
  text,
  unlockNode,
} from './story';
import { cureEffect, damagePlayer, healPlayer, removeEffect } from './survival';

export function applyEffects(
  ctx: GameContext,
  effects: readonly EffectT[] | undefined,
  source = 'effect',
): void {
  if (!effects) return;
  for (const e of effects) applyEffect(ctx, e, source);
}

export function applyEffect(ctx: GameContext, e: EffectT, source = 'effect'): void {
  const s = ctx.state;
  switch (e.type) {
    case 'giveItem': {
      addItem(ctx, e.itemId, e.qty, source);
      const name = ctx.content.items[e.itemId]?.name ?? e.itemId;
      ctx.bus.emit('ui:toast', { text: `+${e.qty > 1 ? `${e.qty} ` : ''}${name}`, kind: 'good' });
      break;
    }
    case 'takeItem':
      if (removeItem(ctx, e.itemId, e.qty, 'given')) {
        const name = ctx.content.items[e.itemId]?.name ?? e.itemId.replace(/^cat:/, '');
        ctx.bus.emit('ui:toast', { text: `−${e.qty > 1 ? `${e.qty} ` : ''}${name}`, kind: 'info' });
      }
      break;
    case 'startQuest':
      startQuest(ctx, e.questId);
      break;
    case 'advanceQuest':
      advanceQuest(ctx, e.questId, e.stage);
      break;
    case 'completeQuest':
      completeQuest(ctx, e.questId, e.outcome);
      break;
    case 'failQuest':
      failQuest(ctx, e.questId);
      break;
    case 'setFlag':
      setFlag(ctx, e.key, e.value);
      break;
    case 'reputation':
      changeReputation(ctx, e.delta);
      break;
    case 'openTrade':
      ctx.bus.emit('ui:open', { screen: 'trade', props: { traderId: e.traderId } });
      break;
    case 'xp':
      grantXp(ctx, e.amount, source);
      break;
    case 'unlockRecipe':
      learnRecipe(ctx, e.recipeId);
      break;
    case 'unlockNode':
      unlockNode(ctx, e.nodeId);
      break;
    case 'unlockTrader': {
      const t = s.traders[e.traderId];
      if (t && !t.unlocked) {
        t.unlocked = true;
        ctx.bus.emit('ui:toast', {
          text: `${ctx.content.traders[e.traderId]?.name ?? e.traderId} will trade with you now`,
          kind: 'good',
        });
      }
      break;
    }
    case 'heal':
      if (e.hp) healPlayer(ctx, e.hp);
      if (e.cureInfection) removeEffect(ctx, 'infection');
      if (e.cureBleeding) cureEffect(ctx, 'bleeding');
      break;
    case 'needs':
      if (e.hunger) s.player.hunger = Math.max(0, Math.min(100, s.player.hunger + e.hunger));
      if (e.thirst) s.player.thirst = Math.max(0, Math.min(100, s.player.thirst + e.thirst));
      break;
    case 'damage':
      damagePlayer(ctx, e.hp, source, { raw: true });
      break;
    case 'fuel':
      s.vehicle.fuel = Math.max(0, Math.min(s.vehicle.maxFuel, s.vehicle.fuel + e.liters));
      break;
    case 'time':
      passTime(ctx, e.minutes, 'active');
      break;
    case 'textCard':
      ctx.bus.emit('ui:textCard', { title: text(ctx, e.title), body: text(ctx, e.body) });
      break;
    case 'toast':
      ctx.bus.emit('ui:toast', { text: text(ctx, e.text), kind: 'info' });
      break;
    case 'baseUpgrade': {
      const b = s.base;
      if (e.station === 'workbench') b.workbenchTier = Math.max(b.workbenchTier, e.tier);
      if (e.station === 'stove') b.stoveTier = Math.max(b.stoveTier, e.tier);
      if (e.station === 'reloading') b.reloadingBench = true;
      if (e.station === 'rainCollector' && !b.rainCollector.built) {
        b.rainCollector = { built: true, stored: 1, lastTickMinutes: s.time.minutes };
      }
      ctx.bus.emit('ui:toast', { text: 'Safehouse upgraded', kind: 'good' });
      ctx.bus.emit('base:changed', {});
      break;
    }
    case 'vehicle':
      s.vehicle.owned = e.owned;
      if (e.owned) showHint(ctx, 'vehicle');
      break;
    case 'hint':
      showHint(ctx, e.hintId);
      break;
    case 'spawn':
      ctx.bus.emit('sim:spawn', { enemyType: e.enemyType, count: e.count, near: e.near });
      break;
    case 'note':
      readNote(ctx, e.noteId);
      break;
    case 'stamp':
      s.flags[e.key] = s.time.minutes;
      break;
    case 'broadcast':
      playBroadcast(ctx, e.broadcastId);
      break;
    case 'dialogue':
      ctx.bus.emit('ui:open', { screen: 'dialogue', props: { dialogueId: e.dialogueId } });
      break;
    case 'end':
      break;
  }
}
