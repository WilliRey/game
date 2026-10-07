/**
 * Quest state machine. Quests advance by listening to bus events (talk, collect, deliver, kill, reach,
 * interact, craft, flag, use); stages run onEnter/onComplete effects; quests finish with an outcome whose
 * rewards are applied. Repeatable quests can be restarted after their cooldown.
 */
import type { ObjectiveT, QuestDef } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import type { QuestState } from '@/core/types';
import { applyEffects } from './effects';
import { countItem, removeItem } from './inventory';
import { matchesItem } from './items';

export function questDef(ctx: GameContext, id: string): QuestDef | undefined {
  return ctx.content.quests[id];
}

export function activeQuests(ctx: GameContext): QuestState[] {
  return Object.values(ctx.state.quests).filter((q) => q.status === 'active');
}

export function canStart(ctx: GameContext, id: string): boolean {
  const def = questDef(ctx, id);
  if (!def) return false;
  const q = ctx.state.quests[id];
  if (!q) return true;
  if (q.status === 'active') return false;
  if (def.type !== 'repeatable') return false;
  return ctx.state.time.minutes >= (q.completedAtMinutes ?? 0) + def.cooldownMinutes;
}

export function startQuest(ctx: GameContext, id: string): boolean {
  const def = questDef(ctx, id);
  if (!def || !canStart(ctx, id)) return false;
  const prev = ctx.state.quests[id];
  const q: QuestState = {
    id,
    status: 'active',
    stage: 0,
    progress: {},
    startedAtMinutes: ctx.state.time.minutes,
    completions: prev?.completions ?? 0,
  };
  ctx.state.quests[id] = q;
  const tracked = ctx.state.trackedQuest ? ctx.state.quests[ctx.state.trackedQuest] : undefined;
  if (!tracked || tracked.status !== 'active' || def.type === 'main') ctx.state.trackedQuest = id;
  ctx.bus.emit('quest:started', { questId: id });
  ctx.bus.emit('ui:toast', {
    text: `New ${def.type === 'main' ? 'main quest' : 'quest'}: ${def.name}`,
    kind: 'info',
  });
  enterStage(ctx, q, 0);
  return true;
}

function enterStage(ctx: GameContext, q: QuestState, index: number): void {
  const def = questDef(ctx, q.id)!;
  q.stage = index;
  q.progress = {};
  const stage = def.stages[index]!;
  if (index > 0) ctx.bus.emit('quest:advanced', { questId: q.id, stage: index });
  applyEffects(ctx, stage.onEnter, `quest:${q.id}`);
  if (q.status !== 'active' || q.stage !== index) return;
  // Some objectives may already be satisfied (items carried, flags set).
  for (const ob of stage.objectives) refreshPassive(ctx, q, ob);
  checkStage(ctx, q);
}

/** Recount objectives that reflect current state rather than one-off events. */
function refreshPassive(ctx: GameContext, q: QuestState, ob: ObjectiveT): void {
  if (ob.type === 'collect') setProgress(ctx, q, ob, Math.min(ob.count, countItem(ctx, ob.target)), false);
  if (ob.type === 'flag' && ctx.state.flags[ob.target]) setProgress(ctx, q, ob, ob.count, false);
  // Already standing in the zone a reach objective asks for.
  if (ob.type === 'reach' && !ob.target.includes(':') && ctx.state.zone?.zoneId === ob.target)
    setProgress(ctx, q, ob, ob.count, false);
}

function setProgress(ctx: GameContext, q: QuestState, ob: ObjectiveT, value: number, check = true): void {
  const v = Math.max(0, Math.min(ob.count, value));
  if (q.progress[ob.id] === v) return;
  q.progress[ob.id] = v;
  ctx.bus.emit('objective:progress', { questId: q.id, objectiveId: ob.id, current: v, target: ob.count });
  if (check) checkStage(ctx, q);
}

export function objectiveDone(q: QuestState, ob: ObjectiveT): boolean {
  return (q.progress[ob.id] ?? 0) >= ob.count;
}

function checkStage(ctx: GameContext, q: QuestState): void {
  if (q.status !== 'active') return;
  const def = questDef(ctx, q.id)!;
  const stage = def.stages[q.stage];
  if (!stage) return;
  if (!stage.objectives.every((ob) => ob.optional || objectiveDone(q, ob))) return;
  if (stage.manualAdvance) return;
  advanceQuest(ctx, q.id);
}

/** Finish the current stage (running onComplete) and move to `stage` or the next one; completes at the end. */
export function advanceQuest(ctx: GameContext, id: string, stage?: number): void {
  const q = ctx.state.quests[id];
  const def = questDef(ctx, id);
  if (!q || !def || q.status !== 'active') return;
  const current = def.stages[q.stage];
  const from = q.stage;
  if (current) applyEffects(ctx, current.onComplete, `quest:${id}`);
  if (q.status !== 'active' || q.stage !== from) return; // an effect already moved the quest on
  const next = stage ?? q.stage + 1;
  if (next >= def.stages.length) {
    if (def.completeOnLastStage) completeQuest(ctx, id, 'default');
    return;
  }
  enterStage(ctx, q, next);
}

export function completeQuest(ctx: GameContext, id: string, outcome = 'default'): void {
  const q = ctx.state.quests[id];
  const def = questDef(ctx, id);
  if (!q || !def || q.status !== 'active') return;
  q.status = 'completed';
  q.outcome = outcome;
  q.completedAtMinutes = ctx.state.time.minutes;
  q.completions += 1;
  ctx.bus.emit('quest:completed', { questId: id, outcome });
  ctx.bus.emit('ui:toast', { text: `Quest complete: ${def.name}`, kind: 'good' });
  applyEffects(ctx, def.rewards, `quest:${id}`);
  const o = def.outcomes[outcome];
  if (o) {
    applyEffects(ctx, o.rewards, `quest:${id}`);
    if (o.text) ctx.bus.emit('ui:toast', { text: o.text, kind: 'info' });
  }
  if (ctx.state.trackedQuest === id) retrack(ctx);
}

export function failQuest(ctx: GameContext, id: string): void {
  const q = ctx.state.quests[id];
  if (!q || q.status !== 'active') return;
  q.status = 'failed';
  ctx.bus.emit('quest:failed', { questId: id });
  if (ctx.state.trackedQuest === id) retrack(ctx);
}

function retrack(ctx: GameContext): void {
  const active = activeQuests(ctx);
  const main = active.find((q) => questDef(ctx, q.id)?.type === 'main');
  ctx.state.trackedQuest = (main ?? active[0])?.id ?? null;
}

/** Debug / console: jump a quest to a stage (starting it if needed). */
export function setQuestStage(ctx: GameContext, id: string, stage: number): boolean {
  const def = questDef(ctx, id);
  if (!def || stage < 0 || stage >= def.stages.length) return false;
  let q = ctx.state.quests[id];
  if (!q || q.status !== 'active') {
    delete ctx.state.quests[id];
    startQuest(ctx, id);
    q = ctx.state.quests[id]!;
  }
  if (q.stage !== stage) enterStage(ctx, q, stage);
  return true;
}

/** The objectives of a quest's current stage, with progress, for the journal and HUD. */
export function currentObjectives(
  ctx: GameContext,
  id: string,
): { ob: ObjectiveT; current: number; done: boolean }[] {
  const q = ctx.state.quests[id];
  const def = questDef(ctx, id);
  if (!q || !def || q.status !== 'active') return [];
  return (def.stages[q.stage]?.objectives ?? []).map((ob) => ({
    ob,
    current: q.progress[ob.id] ?? 0,
    done: objectiveDone(q, ob),
  }));
}

// ---------------------------------------------------------------- event wiring

type Match = (ob: ObjectiveT, q: QuestState) => number | null;

/** Visit each active quest's current objectives of a type; `match` returns the new progress or null. */
function forObjectives(ctx: GameContext, type: ObjectiveT['type'], match: Match): void {
  for (const q of activeQuests(ctx)) {
    const def = questDef(ctx, q.id);
    const stage = def?.stages[q.stage];
    if (!stage) continue;
    for (const ob of stage.objectives) {
      if (ob.type !== type || objectiveDone(q, ob)) continue;
      const v = match(ob, q);
      if (v !== null) setProgress(ctx, q, ob, v);
      if (q.status !== 'active' || def!.stages[q.stage] !== stage) break;
    }
  }
}

/** Subscribe the quest system to the bus. Returns an unsubscribe function. */
export function installQuestListeners(ctx: GameContext): () => void {
  const bus = ctx.bus;
  const offs = [
    bus.on('npc:talked', ({ npcId }) => {
      forObjectives(ctx, 'talk', (ob) => (ob.target === npcId ? ob.count : null));
      forObjectives(ctx, 'deliver', (ob) => {
        if (ob.npcId !== npcId) return null;
        const have = countItem(ctx, ob.target);
        if (have < ob.count) return null;
        if (ob.consume) {
          removeItem(ctx, ob.target, ob.count, 'delivered');
          ctx.bus.emit('ui:toast', { text: `Delivered: ${ob.text}`, kind: 'good' });
        }
        return ob.count;
      });
    }),
    bus.on('item:acquired', () => recountCollect(ctx)),
    bus.on('item:removed', () => recountCollect(ctx)),
    bus.on('enemy:killed', ({ enemyType, zoneId }) =>
      forObjectives(ctx, 'kill', (ob, q) =>
        (ob.target === 'any' || ob.target === enemyType) && (!ob.zoneId || ob.zoneId === zoneId)
          ? (q.progress[ob.id] ?? 0) + 1
          : null,
      ),
    ),
    bus.on('zone:entered', ({ zoneId }) =>
      forObjectives(ctx, 'reach', (ob) => (ob.target === zoneId ? ob.count : null)),
    ),
    bus.on('zone:reached', ({ zoneId, areaId }) =>
      forObjectives(ctx, 'reach', (ob) => (ob.target === `${zoneId}:${areaId}` ? ob.count : null)),
    ),
    bus.on('interact', ({ targetId }) =>
      forObjectives(ctx, 'interact', (ob) => (ob.target === targetId ? ob.count : null)),
    ),
    bus.on('container:searched', ({ containerId }) =>
      forObjectives(ctx, 'interact', (ob) => (ob.target === containerId ? ob.count : null)),
    ),
    bus.on('item:crafted', ({ itemId, qty }) =>
      forObjectives(ctx, 'craft', (ob, q) =>
        matchesItem(ctx.content, itemId, ob.target) ? (q.progress[ob.id] ?? 0) + qty : null,
      ),
    ),
    bus.on('item:used', ({ itemId }) =>
      forObjectives(ctx, 'use', (ob, q) =>
        matchesItem(ctx.content, itemId, ob.target) ? (q.progress[ob.id] ?? 0) + 1 : null,
      ),
    ),
    bus.on('flag:set', ({ key, value }) =>
      forObjectives(ctx, 'flag', (ob) => (ob.target === key && value ? ob.count : null)),
    ),
  ];
  return () => offs.forEach((o) => o());
}

function recountCollect(ctx: GameContext): void {
  for (const q of activeQuests(ctx)) {
    const stage = questDef(ctx, q.id)?.stages[q.stage];
    if (!stage) continue;
    for (const ob of stage.objectives)
      if (ob.type === 'collect') setProgress(ctx, q, ob, Math.min(ob.count, countItem(ctx, ob.target)));
  }
}
