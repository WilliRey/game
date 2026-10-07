/**
 * Branching dialogue from data (brief §5): the first start entry whose conditions pass picks the opening
 * node; choices are filtered by conditions (item, quest state, flag, skill rank, reputation, time of day,
 * cooldowns) and run effects (items, quests, flags, reputation, trade, XP...). Talking to an NPC emits
 * `npc:talked` first, so quest objectives update before the conversation is chosen.
 */
import type { ConditionT, DialogueChoiceT, DialogueDef } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { checkAll, describeCondition } from './conditions';
import { applyEffects } from './effects';
import { text } from './story';

export interface DialogueSession {
  dialogueId: string;
  npcId?: string;
  nodeId: string;
  /** Set when an `end` effect or a null `next` closed the conversation. */
  ended: boolean;
}

export interface ChoiceView {
  index: number;
  text: string;
  enabled: boolean;
  /** Why a visible choice is disabled ("Needs Antibiotics", "Barter 2"). */
  reason?: string;
}

/** Conditions that are shown as a disabled choice rather than hidden: the player can do something about them. */
const SHOW_DISABLED: ReadonlySet<ConditionT['type']> = new Set(['hasItem', 'skill', 'reputation']);

export function dialogueFor(
  ctx: GameContext,
  opts: { npcId?: string; dialogueId?: string },
): DialogueDef | undefined {
  const id = opts.dialogueId ?? (opts.npcId ? ctx.content.npcs[opts.npcId]?.dialogue : undefined);
  return id ? ctx.content.dialogues[id] : undefined;
}

export function startDialogue(
  ctx: GameContext,
  opts: { npcId?: string; dialogueId?: string },
): DialogueSession | null {
  const def = dialogueFor(ctx, opts);
  if (!def) return null;
  if (opts.npcId) ctx.bus.emit('npc:talked', { npcId: opts.npcId });
  const start = def.start.find((s) => checkAll(ctx, s.if));
  if (!start) return null;
  const session: DialogueSession = {
    dialogueId: def.id,
    npcId: opts.npcId,
    nodeId: start.node,
    ended: false,
  };
  enterNode(ctx, session, start.node);
  return session;
}

function enterNode(ctx: GameContext, session: DialogueSession, nodeId: string): void {
  const def = ctx.content.dialogues[session.dialogueId];
  const node = def?.nodes[nodeId];
  if (!def || !node) {
    session.ended = true;
    return;
  }
  session.nodeId = nodeId;
  ctx.bus.emit('dialogue:node', { npcId: session.npcId ?? session.dialogueId, nodeId });
  if (node.effects.some((e) => e.type === 'end')) session.ended = true;
  applyEffects(ctx, node.effects, `dialogue:${def.id}`);
}

function onceKey(session: DialogueSession, index: number): string {
  return `dlg:${session.dialogueId}:${session.nodeId}:${index}`;
}

export function currentNode(ctx: GameContext, session: DialogueSession) {
  return ctx.content.dialogues[session.dialogueId]?.nodes[session.nodeId];
}

export function nodeText(ctx: GameContext, session: DialogueSession): { speaker: string; text: string } {
  const node = currentNode(ctx, session);
  const npc = session.npcId ? ctx.content.npcs[session.npcId] : undefined;
  return {
    speaker: node?.speaker ? text(ctx, node.speaker) : (npc?.name ?? ''),
    text: node ? text(ctx, node.text) : '',
  };
}

function choiceVisible(
  ctx: GameContext,
  c: DialogueChoiceT,
): { visible: boolean; enabled: boolean; reason?: string } {
  let enabled = true;
  const reasons: string[] = [];
  for (const cond of c.if) {
    if (checkAll(ctx, [cond])) continue;
    if (!SHOW_DISABLED.has(cond.type)) return { visible: false, enabled: false };
    enabled = false;
    reasons.push(describeCondition(ctx, cond));
  }
  return { visible: true, enabled, reason: reasons.filter(Boolean).join(', ') || undefined };
}

export function choices(ctx: GameContext, session: DialogueSession): ChoiceView[] {
  const node = currentNode(ctx, session);
  if (!node || session.ended) return [{ index: -1, text: 'Leave', enabled: true }];
  const out: ChoiceView[] = [];
  node.choices.forEach((c, index) => {
    if (c.once && ctx.state.flags[onceKey(session, index)]) return;
    const v = choiceVisible(ctx, c);
    if (!v.visible) return;
    out.push({ index, text: text(ctx, c.text), enabled: v.enabled, reason: v.reason });
  });
  if (out.length === 0) out.push({ index: -1, text: node.next ? 'Continue' : 'Leave', enabled: true });
  return out;
}

/** Pick a choice (index -1 = continue/leave). Returns false if the conversation is over. */
export function choose(ctx: GameContext, session: DialogueSession, index: number): boolean {
  const node = currentNode(ctx, session);
  if (!node || session.ended) return false;
  if (index < 0) {
    if (node.next) {
      enterNode(ctx, session, node.next);
      return !session.ended;
    }
    session.ended = true;
    return false;
  }
  const c = node.choices[index];
  if (!c || !choiceVisible(ctx, c).enabled) return true;
  if (c.once) ctx.state.flags[onceKey(session, index)] = true;
  const ends = c.effects.some((e) => e.type === 'end');
  applyEffects(ctx, c.effects, `dialogue:${session.dialogueId}`);
  if (ends || !c.next) {
    session.ended = true;
    return false;
  }
  enterNode(ctx, session, c.next);
  return !session.ended;
}
