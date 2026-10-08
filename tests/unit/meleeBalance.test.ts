/**
 * Melee balance (BRIEF_V2 §3), checked with scripted fights in the real zone sim (`fightSim.ts`).
 *
 * In v1, trading hits with three walkers cost 25–54 HP on average and bled the player in over half the
 * fights; even careful play cost 5–17 HP, and a lone walker cost more than 10 HP in up to a third of fights.
 * The fix (DESIGN decisions 53–56): zombies telegraph a 0.45 s wind-up that every melee hit interrupts
 * (with a short stun), weapon reach clearly beats zombie reach, a 0.5 s invulnerability window after each
 * hit, walkers hit for 5–8, and bleeding is rarer and shorter.
 */
import { describe, expect, it } from 'vitest';
import { series } from './fightSim';

const RUNS = 30;

describe('melee balance (scripted fights)', () => {
  it.each(['bat', 'crowbar'])('killing a lone walker with a %s usually costs 0–10 HP', (weapon) => {
    for (const policy of ['turret', 'trader', 'brawler', 'skilled'] as const) {
      const s = series(weapon, 1, policy, RUNS);
      expect(s.wins, `${policy} wins`).toBe(RUNS);
      expect(s.within10, `${policy} fights costing ≤ 10 HP`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('three walkers at once hurt if you just stand and trade hits', () => {
    for (const weapon of ['bat', 'crowbar']) {
      const s = series(weapon, 3, 'turret', RUNS);
      expect(s.mean, `${weapon}: mean HP lost`).toBeGreaterThanOrEqual(10);
    }
  });

  it('three walkers at once are survivable with shove and footwork', () => {
    for (const weapon of ['bat', 'crowbar']) {
      const careful = series(weapon, 3, 'skilled', RUNS);
      const naive = series(weapon, 3, 'turret', RUNS);
      expect(careful.deaths).toBe(0);
      expect(careful.wins).toBe(RUNS);
      expect(careful.mean, `${weapon}: mean HP lost`).toBeLessThanOrEqual(8);
      expect(careful.mean).toBeLessThan(naive.mean / 2);
    }
  });
});
