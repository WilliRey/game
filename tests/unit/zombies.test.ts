import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/config/balance';
import { findPath } from '@/sim/pathfinding';
import { canSeePlayer, hearNoise, updateZombies } from '@/sim/zombies';
import { addZombie, arena, makeCtx } from './helpers';

const ROOM = [
  '####################',
  '#P.................#',
  '#..................#',
  '#........#.........#',
  '#........#.........#',
  '#........#.........#',
  '#..................#',
  '####################',
];

describe('pathfinding', () => {
  it('routes around walls', () => {
    const { ctx } = makeCtx();
    const { rt } = arena(ctx, 'path_a', ROOM);
    const path = findPath(rt, 7.5, 4.5, 11.5, 4.5)!;
    expect(path).not.toBeNull();
    expect(path[path.length - 1]).toEqual({ x: 11.5, y: 4.5 });
    expect(path.every((p) => rt.solid[Math.floor(p.y) * rt.w + Math.floor(p.x)] === 0)).toBe(true);
  });

  it('goes through closed doors (zombies bash them) but not walls', () => {
    const { ctx } = makeCtx();
    const { rt } = arena(ctx, 'path_b', ['#######', '#P.#..#', '#..+..#', '#..#..#', '#######']);
    expect(findPath(rt, 1.5, 1.5, 5.5, 1.5)).not.toBeNull();
    const { rt: rt2 } = arena(ctx, 'path_c', ['#######', '#P.#..#', '#..#..#', '#..#..#', '#######']);
    expect(findPath(rt2, 1.5, 1.5, 5.5, 1.5)).toBeNull();
  });
});

describe('zombie senses', () => {
  it('sees the player inside its cone, not behind it, not through walls', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'sense_a', ROOM);
    zone.player.x = 6.5;
    zone.player.y = 1.5;
    const facing = addZombie(ctx, zone, 'walker', 2.5, 1.5, 0);
    const away = addZombie(ctx, zone, 'walker', 2.5, 2.5, Math.PI);
    expect(canSeePlayer(ctx, zone, rt, facing)).toBe(true);
    expect(canSeePlayer(ctx, zone, rt, away)).toBe(false);
    zone.player.x = 12.5;
    zone.player.y = 4.5;
    const walled = addZombie(ctx, zone, 'walker', 6.5, 4.5, 0);
    expect(canSeePlayer(ctx, zone, rt, walled)).toBe(false);
  });

  it('crouching shortens how far zombies see you', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'sense_b', [
      '#' + '.'.repeat(30) + '#',
      '#' + 'P' + '.'.repeat(29) + '#',
      '#' + '.'.repeat(30) + '#',
    ]);
    const dayRange = BALANCE.vision.zombieSightDay;
    zone.player.x = 1.5 + dayRange - 1;
    zone.player.y = 1.5;
    const z = addZombie(ctx, zone, 'walker', 1.5, 1.5, 0);
    expect(canSeePlayer(ctx, zone, rt, z)).toBe(true);
    zone.player.crouched = true;
    expect(canSeePlayer(ctx, zone, rt, z)).toBe(false);
  });

  it('hears noise in range and goes to investigate', () => {
    const { ctx } = makeCtx();
    const { zone } = arena(ctx, 'sense_c', ROOM);
    const near = addZombie(ctx, zone, 'walker', 15.5, 2.5, Math.PI);
    const far = addZombie(ctx, zone, 'walker', 18.5, 6.5, 0);
    hearNoise(ctx, zone, 13.5, 1.5, 4);
    expect(near.mode).toBe('investigate');
    expect(far.mode).toBe('idle');
  });
});

describe('zombie behaviour', () => {
  it('chases and attacks a visible player', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'chase_a', ROOM);
    zone.player.x = 6.5;
    zone.player.y = 1.5;
    const z = addZombie(ctx, zone, 'runner', 15.5, 1.5, Math.PI);
    const hp = ctx.state.player.hp;
    for (let i = 0; i < 200; i++) updateZombies(ctx, zone, rt, 0.05);
    expect(['chase', 'attack']).toContain(z.mode);
    expect(ctx.state.player.hp).toBeLessThan(hp);
  });

  it('bashes through a closed door to reach the player', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'bash_a', [
      '#########',
      '#P..#...#',
      '#...+...#',
      '#...#...#',
      '#########',
    ]);
    zone.player.x = 1.5;
    zone.player.y = 2.5;
    const door = Object.values(zone.doors)[0]!;
    const z = addZombie(ctx, zone, 'walker', 6.5, 2.5, Math.PI);
    z.mode = 'chase';
    z.target = { x: 1.5, y: 2.5 };
    for (let i = 0; i < 400 && !door.broken; i++) updateZombies(ctx, zone, rt, 0.05);
    expect(door.broken).toBe(true);
    expect(rt.solid[door.y * rt.w + door.x]).toBe(0);
  });
});
