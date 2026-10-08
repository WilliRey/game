import { describe, expect, it } from 'vitest';
import { buildZone, decodeRle, encodeRle, rememberZone } from '@/sim/build';
import { moveCircle } from '@/sim/collision';
import { getLayout } from '@/sim/layout';
import { getRuntime, isSolid, rebuildGrids } from '@/sim/runtime';
import { toggleDoor } from '@/sim/interact';
import { enterZone } from '@/systems/zones';
import { content, makeCtx } from './helpers';

describe('zone layout', () => {
  it('parses the ASCII map, legend and objects', () => {
    const layout = getLayout(content(), 'maple_court');
    expect(layout.w).toBe(78);
    expect(layout.h).toBe(46);
    expect(layout.starts.default).toBeDefined();
    // Adjacent identical container chars merge: each 3×2 car wreck is one container.
    const cars = layout.containers.filter((c) => c.type === 'car_trunk');
    expect(cars.length).toBe(5);
    expect(cars.every((c) => c.w === 3 && c.h === 2)).toBe(true);
    // Objects override legend-derived containers at their position.
    expect(layout.containers.find((c) => c.id === 'mc_sam_toolbox')?.items?.[0]?.itemId).toBe('lockpick');
    expect(layout.doors.some((d) => d.locked)).toBe(true);
    expect(layout.exits.length).toBe(1);
  });
});

describe('run-length explored bitmap', () => {
  it('round-trips', () => {
    const bits = [0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 1];
    expect(decodeRle(encodeRle(bits), bits.length)).toEqual(bits);
    expect(decodeRle(encodeRle([1, 1, 1]), 3)).toEqual([1, 1, 1]);
    expect(decodeRle('', 4)).toEqual([0, 0, 0, 0]);
  });
});

describe('zone build and memory', () => {
  it('builds the start zone with the player at the start and fixed container contents', () => {
    const { ctx } = makeCtx();
    const zone = buildZone(ctx, 'maple_court');
    expect(Math.floor(zone.player.x)).toBe(9);
    expect(zone.containers['mc_3b_cabinet']!.items.map((s) => s.itemId)).toContain('canned_beans');
    expect(zone.containers['mc_3b_cabinet']!.rolled).toBe(true);
  });

  it('remembers doors, containers and explored tiles across visits', () => {
    const { ctx } = makeCtx();
    enterZone(ctx, 'maple_court');
    const zone = ctx.state.zone!;
    const rt = getRuntime(ctx.content, zone);
    const door = Object.values(zone.doors).find((d) => !d.locked && !d.open)!;
    expect(toggleDoor(ctx, zone, rt, door)).toBe(true);
    zone.containers['mc_3b_cabinet']!.items = [];
    zone.containers['mc_3b_cabinet']!.searched = true;
    zone.explored[5] = 1;
    const mem = rememberZone(ctx, zone);
    ctx.state.zones['maple_court'] = mem;
    const again = buildZone(ctx, 'maple_court');
    expect(again.doors[door.id]!.open).toBe(true);
    expect(again.containers['mc_3b_cabinet']!.items).toEqual([]);
    expect(again.containers['mc_3b_cabinet']!.searched).toBe(true);
    expect(again.explored[5]).toBe(1);
  });
});

describe('collision', () => {
  it('slides along walls and never enters solid tiles', () => {
    const { ctx } = makeCtx();
    enterZone(ctx, 'maple_court');
    const zone = ctx.state.zone!;
    const rt = getRuntime(ctx.content, zone);
    rebuildGrids(rt, ctx.content);
    const p = { x: 3.5, y: 2.5 };
    // Walk hard into the north wall (y = 1).
    for (let i = 0; i < 60; i++) moveCircle(rt, p, 0.32, 0.05, -0.2);
    expect(p.y).toBeGreaterThanOrEqual(2 + 0.32 - 1e-3);
    expect(p.x).toBeGreaterThan(3.5);
    expect(isSolid(rt, Math.floor(p.x), Math.floor(p.y))).toBe(false);
  });
});
