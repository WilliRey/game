import { describe, expect, it } from 'vitest';
import { shadowcast } from '@/sim/fov';

function grid(rows: string[]) {
  const h = rows.length;
  const w = rows[0]!.length;
  const opaque = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || rows[y]![x] === '#';
  return { w, h, opaque };
}

function visibleSet(rows: string[], ox: number, oy: number, r: number): Set<string> {
  const g = grid(rows);
  const seen = new Set<string>();
  shadowcast(ox, oy, r, g.opaque, (x, y) => {
    if (x >= 0 && y >= 0 && x < g.w && y < g.h) seen.add(`${x},${y}`);
  });
  return seen;
}

describe('shadowcasting FOV', () => {
  it('sees every tile of an open room within radius', () => {
    const rows = ['.........', '.........', '.........', '.........', '.........'];
    const seen = visibleSet(rows, 4, 2, 10);
    expect(seen.size).toBe(45);
  });

  it('walls block what is behind them but are themselves visible', () => {
    const rows = ['.....#...', '.....#...', '.....#...', '.....#...', '.....#...'];
    const seen = visibleSet(rows, 2, 2, 10);
    expect(seen.has('5,2')).toBe(true);
    expect(seen.has('7,2')).toBe(false);
    expect(seen.has('8,0')).toBe(false);
  });

  it('a doorway lets a cone through', () => {
    const rows = ['...........', '#####.#####', '...........', '...........', '...........'];
    const seen = visibleSet(rows, 5, 4, 10);
    expect(seen.has('5,0')).toBe(true);
    expect(seen.has('0,0')).toBe(false);
    expect(seen.has('0,1')).toBe(true);
  });

  it('respects the radius', () => {
    const rows = Array.from({ length: 21 }, () => '.'.repeat(21));
    const seen = visibleSet(rows, 10, 10, 3);
    expect(seen.has('10,13')).toBe(true);
    expect(seen.has('10,15')).toBe(false);
  });
});
