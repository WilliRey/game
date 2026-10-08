import { describe, expect, it } from 'vitest';
import { checkCondition } from '@/systems/conditions';
import { choices, choose, startDialogue } from '@/systems/dialogue';
import { addItem } from '@/systems/inventory';
import { startQuest } from '@/systems/quests';
import { makeCtx } from './helpers';

describe('conditions', () => {
  it('items, quests, flags, skills, reputation, time of day, cooldowns', () => {
    const { ctx } = makeCtx();
    expect(checkCondition(ctx, { type: 'hasItem', itemId: 'bandage', qty: 1 })).toBe(false);
    addItem(ctx, 'bandage', 2);
    expect(checkCondition(ctx, { type: 'hasItem', itemId: 'bandage', qty: 2 })).toBe(true);
    expect(checkCondition(ctx, { type: 'hasItem', itemId: 'cat:medical', qty: 2 })).toBe(true);
    expect(checkCondition(ctx, { type: 'quest', questId: 'rain_check', status: 'notStarted' })).toBe(true);
    startQuest(ctx, 'rain_check');
    expect(checkCondition(ctx, { type: 'quest', questId: 'rain_check', status: 'active', stage: 0 })).toBe(
      true,
    );
    expect(checkCondition(ctx, { type: 'flag', key: 'x' })).toBe(false);
    ctx.state.flags.x = 'saved';
    expect(checkCondition(ctx, { type: 'flag', key: 'x', value: 'saved' })).toBe(true);
    expect(checkCondition(ctx, { type: 'skill', skill: 'barter', rank: 1 })).toBe(false);
    ctx.state.player.skills.barter = 2;
    expect(checkCondition(ctx, { type: 'skill', skill: 'barter', rank: 1 })).toBe(true);
    ctx.state.reputation = 30;
    expect(checkCondition(ctx, { type: 'reputation', min: 20 })).toBe(true);
    expect(checkCondition(ctx, { type: 'time', night: false })).toBe(true);
    expect(checkCondition(ctx, { type: 'cooldown', key: 'k', minutes: 60 })).toBe(true);
    ctx.state.flags.k = ctx.state.time.minutes;
    expect(checkCondition(ctx, { type: 'cooldown', key: 'k', minutes: 60 })).toBe(false);
    expect(checkCondition(ctx, { type: 'not', cond: { type: 'flag', key: 'nope' } })).toBe(true);
  });
});

describe('dialogue', () => {
  it('hides choices whose story conditions fail, shows item-gated ones disabled with a reason', () => {
    const { ctx } = makeCtx();
    startQuest(ctx, 'missing_scout');
    const s = startDialogue(ctx, { npcId: 'pike' })!;
    const view = choices(ctx, s);
    const meds = view.find((c) => c.text.startsWith('I have antibiotics'))!;
    expect(meds.enabled).toBe(false);
    expect(meds.reason).toContain('Antibiotics');
    addItem(ctx, 'antibiotics', 1);
    expect(choices(ctx, s).find((c) => c.text.startsWith('I have antibiotics'))!.enabled).toBe(true);
    const doc = startDialogue(ctx, { npcId: 'doc_ama' })!;
    expect(choices(ctx, doc).some((c) => c.text.startsWith('I need supplies'))).toBe(false);
  });

  it('talking to an NPC emits npc:talked before choosing the start node', () => {
    const { ctx } = makeCtx();
    const heard: string[] = [];
    ctx.bus.on('npc:talked', ({ npcId }) => heard.push(npcId));
    startDialogue(ctx, { npcId: 'gus' });
    expect(heard).toEqual(['gus']);
  });

  it('choices run effects and follow next links; openTrade asks the UI to open the trade screen', () => {
    const { ctx } = makeCtx();
    const opened: string[] = [];
    ctx.bus.on('ui:open', ({ screen }) => opened.push(screen));
    const s = startDialogue(ctx, { npcId: 'gus' })!;
    const trade = choices(ctx, s).find((c) => c.text.startsWith("Let's trade"))!;
    expect(choose(ctx, s, trade.index)).toBe(false);
    expect(opened).toEqual(['trade']);
  });
});
