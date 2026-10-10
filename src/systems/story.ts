/** Flags, reputation, recipes learned, notes, radio broadcasts, hints and world-map unlocks. */
import type { GameContext } from '@/core/store';
import { fillNames } from '@/content';
import { dayOf } from '@/core/time';
import { applyEffects } from './effects';
import { checkAll } from './conditions';

export function setFlag(ctx: GameContext, key: string, value: boolean | number | string = true): void {
  if (ctx.state.flags[key] === value) return;
  ctx.state.flags[key] = value;
  ctx.bus.emit('flag:set', { key, value });
}

export function changeReputation(ctx: GameContext, delta: number): void {
  const before = ctx.state.reputation;
  ctx.state.reputation = Math.max(0, Math.min(100, before + delta));
  const real = ctx.state.reputation - before;
  if (real === 0) return;
  ctx.bus.emit('reputation:changed', { delta: real, total: ctx.state.reputation });
  ctx.bus.emit('ui:toast', {
    text: `Camp reputation ${real > 0 ? '+' : ''}${real}`,
    kind: real > 0 ? 'good' : 'warn',
  });
}

export function learnRecipe(ctx: GameContext, recipeId: string, quiet = false): boolean {
  if (ctx.state.unlockedRecipes.includes(recipeId)) return false;
  ctx.state.unlockedRecipes.push(recipeId);
  ctx.bus.emit('blueprint:learned', { recipeId });
  const out = ctx.content.recipes[recipeId]?.output.itemId;
  if (!quiet)
    ctx.bus.emit('ui:toast', {
      text: `Recipe learned: ${ctx.content.items[out ?? '']?.name ?? recipeId}`,
      kind: 'good',
    });
  return true;
}

export function unlockNode(ctx: GameContext, nodeId: string): boolean {
  const w = ctx.state.world;
  if (w.knownNodes.includes(nodeId) || !ctx.content.worldNodes[nodeId]) return false;
  w.knownNodes.push(nodeId);
  ctx.bus.emit('world:nodeUnlocked', { nodeId });
  ctx.bus.emit('ui:toast', {
    text: `New location on the map: ${ctx.content.worldNodes[nodeId]?.name ?? nodeId}`,
    kind: 'info',
  });
  return true;
}

/** Fill `{tokens}` from names.json, Sam's class (`classes.json` names: {sam_job}, {jo_nickname}...) and the day. */
export function text(ctx: GameContext, s: string): string {
  const cls = ctx.state ? ctx.content.classes[ctx.state.player.classId] : undefined;
  return fillNames(s, {
    ...ctx.content.names,
    ...cls?.names,
    day: ctx.state ? String(dayOf(ctx.state.time.minutes)) : '',
  });
}

/** Read a note: show it as a text card the first time, run its effects once, keep it in the journal. */
export function readNote(ctx: GameContext, noteId: string): void {
  const note = ctx.content.notes[noteId];
  if (!note) return;
  const first = !ctx.state.notesRead.includes(noteId);
  if (first) ctx.state.notesRead.push(noteId);
  ctx.bus.emit('ui:textCard', { title: text(ctx, note.title), body: text(ctx, note.body) });
  ctx.bus.emit('note:read', { noteId });
  if (first) applyEffects(ctx, note.effects, `note:${noteId}`);
}

/** Next radio broadcast whose conditions pass and that hasn't been heard; null if the radio is quiet. */
export function nextBroadcast(ctx: GameContext): string | null {
  for (const b of ctx.content.broadcasts) {
    if (ctx.state.broadcastsHeard.includes(b.id)) continue;
    if (checkAll(ctx, b.if)) return b.id;
  }
  return null;
}

export function playBroadcast(ctx: GameContext, broadcastId?: string): boolean {
  const id = broadcastId ?? nextBroadcast(ctx);
  const b = ctx.content.broadcasts.find((x) => x.id === id);
  if (!b) {
    ctx.bus.emit('ui:toast', { text: 'Only static on the radio.', kind: 'info' });
    return false;
  }
  if (!ctx.state.broadcastsHeard.includes(b.id)) ctx.state.broadcastsHeard.push(b.id);
  ctx.bus.emit('radio:broadcast', { broadcastId: b.id });
  ctx.bus.emit('sfx:play', { key: 'radio' });
  ctx.bus.emit('ui:textCard', { title: text(ctx, b.title), body: text(ctx, b.text) });
  applyEffects(ctx, b.effects, `radio:${b.id}`);
  return true;
}

/** Contextual tutorial hint for a first-time situation. Shown once per save, if hints are on. */
export function showHint(ctx: GameContext, hintId: string): void {
  if (!ctx.settings.hints || ctx.state.hintsSeen.includes(hintId) || !ctx.content.hints[hintId]) return;
  ctx.state.hintsSeen.push(hintId);
  ctx.bus.emit('hint:show', { hintId });
}
