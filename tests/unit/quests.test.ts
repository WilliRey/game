/**
 * Scripted playthrough of the quest content: the prologue and Act 1 main chain, every side quest (both
 * outcomes of The Missing Scout) and the repeatable Kitchen Duty, driven through the same events,
 * dialogue and interactions the game uses.
 */
import { describe, expect, it } from 'vitest';
import type { GameContext } from '@/core/store';
import { updateInteraction } from '@/sim/interact';
import { emptyInput } from '@/sim/player';
import { getRuntime } from '@/sim/runtime';
import { passTime } from '@/systems/clock';
import { choices, choose, startDialogue } from '@/systems/dialogue';
import { addItem, countItem } from '@/systems/inventory';
import { knowsRecipe } from '@/systems/conditions';
import { useItem } from '@/systems/survival';
import { enterZone } from '@/systems/zones';
import { makeCtx } from './helpers';

/** Talk to someone and pick choices whose text starts with each prefix in turn. */
function talk(ctx: GameContext, who: { npcId?: string; dialogueId?: string }, ...picks: string[]): string[] {
  const s = startDialogue(ctx, who);
  expect(s, `dialogue with ${who.npcId ?? who.dialogueId}`).not.toBeNull();
  const seen: string[] = [s!.nodeId];
  for (const p of picks) {
    const c = choices(ctx, s!).find((x) => x.text.startsWith(p) && x.enabled);
    expect(
      c,
      `choice "${p}" in node ${s!.nodeId} (${choices(ctx, s!)
        .map((x) => x.text)
        .join(' | ')})`,
    ).toBeDefined();
    if (!choose(ctx, s!, c!.index)) break;
    seen.push(s!.nodeId);
  }
  return seen;
}

const stage = (ctx: GameContext, id: string) => ctx.state.quests[id]?.stage;
const status = (ctx: GameContext, id: string) => ctx.state.quests[id]?.status;

function finishPrologue(ctx: GameContext): void {
  ctx.bus.emit('interact', { targetId: 'mc_sam_cabinet', kind: 'container', zoneId: 'maple_court' });
  const beans = addItem(ctx, 'canned_beans', 1)[0]!;
  useItem(ctx, beans.uid);
  ctx.bus.emit('enemy:killed', { enemyType: 'walker', enemyId: 'z', zoneId: 'maple_court', sneak: true });
  ctx.bus.emit('zone:reached', { zoneId: 'maple_court', areaId: 'mc_street' });
  ctx.bus.emit('zone:reached', { zoneId: 'maple_court', areaId: 'mc_depot' });
  addItem(ctx, 'nail_bat', 1);
  enterZone(ctx, 'firehouse9');
}

describe('main quest chain', () => {
  it('prologue: kitchen → eat → stairwell → depot → nail bat → Firehouse 9', () => {
    const { ctx } = makeCtx({ setup: true });
    expect(status(ctx, 'prologue')).toBe('active');
    ctx.bus.emit('interact', { targetId: 'mc_sam_cabinet', kind: 'container', zoneId: 'maple_court' });
    expect(stage(ctx, 'prologue')).toBe(1);
    const beans = addItem(ctx, 'canned_beans', 1)[0]!;
    useItem(ctx, beans.uid);
    expect(stage(ctx, 'prologue')).toBe(2);
    ctx.bus.emit('enemy:killed', { enemyType: 'walker', enemyId: 'z', zoneId: 'maple_court', sneak: false });
    expect(stage(ctx, 'prologue')).toBe(2);
    ctx.bus.emit('zone:reached', { zoneId: 'maple_court', areaId: 'mc_street' });
    expect(stage(ctx, 'prologue')).toBe(3);
    ctx.bus.emit('zone:reached', { zoneId: 'maple_court', areaId: 'mc_depot' });
    expect(stage(ctx, 'prologue')).toBe(4);
    addItem(ctx, 'nail_bat', 1);
    expect(stage(ctx, 'prologue')).toBe(5);
    expect(ctx.state.world.knownNodes).toContain('firehouse9');
    enterZone(ctx, 'firehouse9');
    expect(status(ctx, 'prologue')).toBe('completed');
    expect(status(ctx, 'act1')).toBe('active');
  });

  it('act 1: Ruth → battery + fuel → ambulance → St. Agnes → basement boss → Jo → Ruth', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { npcId: 'ruth' }, 'My sister', "I'll get it done");
    expect(stage(ctx, 'act1')).toBe(2);
    expect(ctx.state.world.knownNodes).toEqual(expect.arrayContaining(['kessler_auto', 'route17']));
    expect(knowsRecipe(ctx, 'siphon_hose')).toBe(true);
    addItem(ctx, 'car_battery', 1);
    addItem(ctx, 'fuel_can', 2);
    expect(stage(ctx, 'act1')).toBe(3);

    // Repair the ambulance through the real interaction in the hub.
    const zone = ctx.state.zone!;
    const rt = getRuntime(ctx.content, zone);
    zone.player.x = 20.5;
    zone.player.y = 10.5;
    zone.player.facing = 0;
    updateInteraction(ctx, zone, rt, { ...emptyInput(), interactPressed: true, aimX: 22, aimY: 10.5 }, 0.016);
    expect(ctx.state.vehicle.owned).toBe(true);
    expect(ctx.state.vehicle.fuel).toBeGreaterThan(0);
    expect(countItem(ctx, 'car_battery')).toBe(0);
    expect(stage(ctx, 'act1')).toBe(4);

    enterZone(ctx, 'st_agnes');
    expect(stage(ctx, 'act1')).toBe(5);
    enterZone(ctx, 'st_agnes_basement', 'from_lobby');
    expect(stage(ctx, 'act1')).toBe(6);
    expect(ctx.state.zone!.zombies.some((z) => z.type === 'bloater_boss')).toBe(true);
    ctx.bus.emit('enemy:killed', {
      enemyType: 'bloater_boss',
      enemyId: 'b',
      zoneId: 'st_agnes_basement',
      sneak: false,
    });
    expect(stage(ctx, 'act1')).toBe(7);
    addItem(ctx, 'jo_recorder', 1);
    expect(stage(ctx, 'act1')).toBe(8);
    enterZone(ctx, 'firehouse9');
    talk(ctx, { npcId: 'ruth' }, "We'll plan it");
    expect(status(ctx, 'act1')).toBe('completed');
    expect(ctx.state.flags.act1_done).toBe(true);
    expect(ctx.state.world.knownNodes).toContain('northgate_bridge');
  });
});

describe('side quests', () => {
  it('Medicine Run: Doc unlocks as a trader and teaches the first-aid kit', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { npcId: 'doc_ama' }, 'What do you need most', "I'll get them");
    expect(status(ctx, 'medicine_run')).toBe('active');
    expect(ctx.state.world.knownNodes).toContain('westside_mall');
    addItem(ctx, 'antibiotics', 1);
    expect(stage(ctx, 'medicine_run')).toBe(1);
    talk(ctx, { npcId: 'doc_ama' });
    expect(status(ctx, 'medicine_run')).toBe('completed');
    expect(countItem(ctx, 'antibiotics')).toBe(0);
    expect(ctx.state.traders.doc!.unlocked).toBe(true);
    expect(knowsRecipe(ctx, 'first_aid_kit')).toBe(true);
  });

  it('Rain Check: build the kit, deliver it, get a rain collector at the bunk', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { npcId: 'gus' }, 'You look like a man', 'Show me the plans');
    expect(knowsRecipe(ctx, 'rain_collector_kit')).toBe(true);
    addItem(ctx, 'rain_collector_kit', 1);
    expect(stage(ctx, 'rain_check')).toBe(1);
    talk(ctx, { npcId: 'gus' });
    expect(status(ctx, 'rain_check')).toBe('completed');
    expect(ctx.state.base.rainCollector.built).toBe(true);
  });

  it('The Missing Scout, saved: Pike lives and trades; Vera trusts you', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { npcId: 'ruth' }, 'What do you need', "I'll get it done");
    talk(ctx, { npcId: 'vera' }, 'You look worried', "I'll look for him");
    expect(status(ctx, 'missing_scout')).toBe('active');
    addItem(ctx, 'antibiotics', 1);
    talk(ctx, { npcId: 'pike' }, 'I have antibiotics');
    expect(ctx.state.flags.pike_fate).toBe('saved');
    expect(stage(ctx, 'missing_scout')).toBe(1);
    talk(ctx, { npcId: 'vera' }, "He'd have done the same");
    expect(ctx.state.quests.missing_scout!.outcome).toBe('saved');
    expect(ctx.state.traders.pike!.unlocked).toBe(true);
    expect(ctx.state.flags.vera_trusts).toBe(true);
    // finishPrologue left us at the camp: Pike shows up there without re-entering the zone.
    expect(ctx.state.zone?.zoneId).toBe('firehouse9');
    expect(ctx.state.zone!.npcs.some((n) => n.npcId === 'pike')).toBe(true);
  });

  it('The Missing Scout, abandoned: you get the rifle, the camp thinks less of you', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { npcId: 'ruth' }, 'What do you need', "I'll get it done");
    talk(ctx, { npcId: 'vera' }, 'You look worried', "I'll look for him");
    const rep = ctx.state.reputation;
    talk(ctx, { npcId: 'pike' }, "I don't have anything", '...Alright');
    expect(countItem(ctx, 'hunting_rifle')).toBe(1);
    talk(ctx, { npcId: 'vera' }, "I'm sorry");
    expect(ctx.state.quests.missing_scout!.outcome).toBe('abandoned');
    expect(ctx.state.reputation).toBeLessThan(rep);
    expect(ctx.state.traders.pike!.unlocked).toBe(false);
  });

  it('Kitchen Duty repeats once a day', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { dialogueId: 'board' }, 'Sign up');
    expect(status(ctx, 'kitchen_duty')).toBe('active');
    addItem(ctx, 'canned_beans', 3);
    talk(ctx, { dialogueId: 'board' }, 'Leave 3 food');
    expect(status(ctx, 'kitchen_duty')).toBe('completed');
    const s = startDialogue(ctx, { dialogueId: 'board' })!;
    expect(choices(ctx, s).some((c) => c.text.startsWith('Sign up'))).toBe(false);
    passTime(ctx, 1441);
    talk(ctx, { dialogueId: 'board' }, 'Sign up');
    addItem(ctx, 'water_bottle', 3);
    talk(ctx, { dialogueId: 'board' }, 'Leave 3 drinks');
    expect(ctx.state.quests.kitchen_duty!.completions).toBe(2);
  });
});

describe('never soft-locked on food and water', () => {
  it('Ruth hands out a ration once a day', () => {
    const { ctx } = makeCtx({ setup: true });
    finishPrologue(ctx);
    talk(ctx, { npcId: 'ruth' }, 'What do you need', 'One more thing', "I'm out of food");
    expect(countItem(ctx, 'water_bottle')).toBeGreaterThanOrEqual(1);
    const s = startDialogue(ctx, { npcId: 'ruth' })!;
    expect(choices(ctx, s).some((c) => c.text.startsWith("I'm out of food"))).toBe(false);
    passTime(ctx, 1440);
    const s2 = startDialogue(ctx, { npcId: 'ruth' })!;
    expect(choices(ctx, s2).some((c) => c.text.startsWith("I'm out of food"))).toBe(true);
  });
});
