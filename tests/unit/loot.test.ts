import { describe, expect, it } from 'vitest';
import { finishSearch } from '@/sim/interact';
import { rollContainer } from '@/systems/loot';
import { arena, makeCtx } from './helpers';

const sig = (items: { itemId: string; qty: number }[]) =>
  items
    .map((i) => `${i.itemId}x${i.qty}`)
    .sort()
    .join(',');

describe('seeded loot', () => {
  it('the same container in the same save always rolls the same', () => {
    const a = makeCtx({ seed: 'loot-seed' }).ctx;
    const b = makeCtx({ seed: 'loot-seed' }).ctx;
    const ra = rollContainer(a, 'maple_court', 'c_10_10', 'cabinet', undefined, 2);
    // Roll other containers first in b: order must not matter.
    rollContainer(b, 'maple_court', 'c_1_1', 'toolbox', undefined, 2);
    const rb = rollContainer(b, 'maple_court', 'c_10_10', 'cabinet', undefined, 2);
    expect(sig(ra)).toBe(sig(rb));
  });

  it('different saves roll differently', () => {
    const results = new Set<string>();
    for (let i = 0; i < 8; i++)
      results.add(sig(rollContainer(makeCtx({ seed: `s${i}` }).ctx, 'z', 'c', 'toolbox', undefined, 3)));
    expect(results.size).toBeGreaterThan(1);
  });

  it('higher danger tiers roll more on average', () => {
    const avg = (tier: number) => {
      let n = 0;
      for (let i = 0; i < 60; i++)
        n += rollContainer(makeCtx({ seed: `t${i}` }).ctx, 'z', 'c', 'crate', undefined, tier).reduce(
          (s, x) => s + x.qty,
          0,
        );
      return n / 60;
    };
    expect(avg(4)).toBeGreaterThan(avg(1));
  });

  it('a searched container is rolled once and saved', () => {
    const { ctx } = makeCtx();
    const { zone } = arena(ctx, 'loot_a', ['#####', '#Pt.#', '#####']);
    const c = Object.values(zone.containers)[0]!;
    finishSearch(ctx, zone, c);
    const first = sig(c.items);
    finishSearch(ctx, zone, c);
    expect(sig(c.items)).toBe(first);
    expect(c.searched).toBe(true);
  });
});
