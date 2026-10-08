import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/config/balance';
import { updateInteraction } from '@/sim/interact';
import { emptyInput, type PlayerInput } from '@/sim/player';
import { addItem } from '@/systems/inventory';
import { arena, makeCtx } from './helpers';

const DT = 1 / 60;

/** A player next to one container of the given legend char, facing it. */
function setup(ch: string, seed = 'search-seed') {
  const { ctx } = makeCtx({ seed });
  const { zone, rt } = arena(ctx, `search_${ch}`, ['######', `#P${ch}..#`, '#....#', '######']);
  zone.player.facing = 0;
  const opened: string[] = [];
  ctx.bus.on('ui:open', ({ screen }) => opened.push(screen));
  const noises: string[] = [];
  ctx.bus.on('noise:emitted', ({ source }) => noises.push(source));
  const c = Object.values(zone.containers)[0]!;
  const run = (seconds: number, over: Partial<PlayerInput> = {}) => {
    for (let t = 0; t < seconds; t += DT) updateInteraction(ctx, zone, rt, { ...emptyInput(), ...over }, DT);
  };
  const tap = () => updateInteraction(ctx, zone, rt, { ...emptyInput(), interactPressed: true }, DT);
  return { ctx, zone, rt, c, opened, noises, run, tap };
}

describe('searching (BRIEF_V2 §5)', () => {
  it('a tap on E searches a small container in about 0.4 s and opens the loot window right away', () => {
    const { c, opened, noises, run, tap } = setup('t');
    expect(c.locked).toBe(false);
    tap();
    expect(noises).toContain('search'); // searching still makes a little noise, from the first moment
    run(BALANCE.search.small - 0.1); // E released: the search carries on by itself
    expect(opened).not.toContain('loot');
    run(0.15);
    expect(c.searched).toBe(true);
    expect(opened).toEqual(['loot']);
  });

  it('medium and large containers take about 0.7 s and 1 s, and Scavenging shortens it', () => {
    expect(BALANCE.search.small).toBeCloseTo(0.4);
    expect(BALANCE.search.medium).toBeCloseTo(0.7);
    expect(BALANCE.search.large).toBeCloseTo(1);
    const medium = setup('f');
    medium.tap();
    medium.run(0.6);
    expect(medium.c.searched).toBe(false);
    medium.run(0.15);
    expect(medium.c.searched).toBe(true);

    const skilled = setup('f');
    skilled.ctx.state.player.skills.scavenging = 5;
    skilled.tap();
    skilled.run(0.7 * (1 - 5 * BALANCE.search.scavengingRankReduction) + 0.05);
    expect(skilled.c.searched).toBe(true);
  });

  it('moving stops a search', () => {
    const { c, opened, run, tap } = setup('t');
    tap();
    run(0.1);
    run(0.1, { moveX: 1 });
    run(1);
    expect(c.searched).toBe(false);
    expect(opened).toEqual([]);
  });

  it('locked containers keep their lock actions', () => {
    const { ctx, c, run, tap } = setup('t');
    c.locked = true;
    addItem(ctx, 'lockpick', 2);
    tap();
    run(BALANCE.interact.lockpickSeconds + 0.2); // released E: picking a lock still needs E held
    expect(c.locked).toBe(true);
    tap();
    run(BALANCE.interact.lockpickSeconds + 0.2, { interactHeld: true });
    expect(c.locked).toBe(false);
    expect(c.searched).toBe(false);
  });
});
