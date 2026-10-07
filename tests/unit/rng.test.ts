import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '@/core/rng';

describe('Rng', () => {
  it('is deterministic for a seed', () => {
    const a = Rng.fromSeed('holdout');
    const b = Rng.fromSeed('holdout');
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('round-trips through its serializable state', () => {
    const a = Rng.fromSeed(42);
    for (let i = 0; i < 10; i++) a.next();
    const copy = new Rng(JSON.parse(JSON.stringify(a.state)));
    for (let i = 0; i < 20; i++) expect(copy.next()).toBe(a.next());
  });

  it('derived streams are independent of the parent position', () => {
    const a = Rng.fromSeed('s');
    const d1 = a.derive('zone', 'c1').next();
    const d2 = a.derive('zone', 'c1').next();
    expect(d1).toBe(d2);
    expect(a.derive('zone', 'c2').next()).not.toBe(d1);
  });

  it('int stays in range and covers it', () => {
    const r = Rng.fromSeed(7);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.size).toBe(4);
  });

  it('weighted respects weights', () => {
    const r = Rng.fromSeed(9);
    let heavy = 0;
    for (let i = 0; i < 2000; i++)
      if (
        r.weighted([
          { weight: 9, value: 'a' },
          { weight: 1, value: 'b' },
        ]) === 'a'
      )
        heavy++;
    expect(heavy / 2000).toBeGreaterThan(0.85);
  });

  it('hashString is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});
