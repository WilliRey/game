import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/config/balance';
import { isSneakAttack, updateCombat } from '@/sim/combat';
import { emptyInput } from '@/sim/player';
import { addItem, ammoReserve, equip, findStack } from '@/systems/inventory';
import { addZombie, arena, makeCtx } from './helpers';

const ROOM = [
  '####################',
  '#P.................#',
  '#..................#',
  '#..................#',
  '####################',
];

function tick(
  ctx: Parameters<typeof updateCombat>[0],
  zone: Parameters<typeof updateCombat>[1],
  rt: Parameters<typeof updateCombat>[2],
  over: Partial<ReturnType<typeof emptyInput>>,
  n = 1,
  dt = 0.05,
) {
  for (let i = 0; i < n; i++) updateCombat(ctx, zone, rt, { ...emptyInput(), ...over }, dt);
}

describe('melee', () => {
  it('does triple damage to an unaware zombie hit from behind', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'melee_a', ROOM);
    const wrench = addItem(ctx, 'wrench', 1)[0]!;
    equip(ctx, wrench.uid, 'melee');
    ctx.state.player.activeSlot = 'melee';
    zone.player.x = 3.5;
    zone.player.y = 2.5;
    zone.player.facing = 0;
    // Zombie faces away from the player (+x), player is behind it.
    const z = addZombie(ctx, zone, 'walker', 4.5, 2.5, 0);
    expect(isSneakAttack(z, zone.player.x, zone.player.y)).toBe(true);
    const before = z.hp;
    tick(ctx, zone, rt, { attackPressed: true, attack: true, aimX: 5, aimY: 2.5 });
    tick(ctx, zone, rt, {}, 10);
    const dealt = before - Math.max(0, z.hp);
    expect(dealt).toBeGreaterThan(14 * 0.9 * BALANCE.combat.sneakMultiplier - 1);
    expect(findStack(ctx, wrench.uid)!.durability).toBeLessThan(findStack(ctx, wrench.uid)!.maxDurability!);
  });

  it('a normal hit on an alert zombie does base damage and knocks it back', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'melee_b', ROOM);
    const bat = addItem(ctx, 'bat', 1)[0]!;
    equip(ctx, bat.uid, 'melee');
    zone.player.x = 3.5;
    zone.player.y = 2.5;
    zone.player.facing = 0;
    const z = addZombie(ctx, zone, 'walker', 4.6, 2.5, Math.PI);
    z.mode = 'chase';
    tick(ctx, zone, rt, { attackPressed: true, attack: true, aimX: 6, aimY: 2.5 });
    tick(ctx, zone, rt, {}, 10);
    expect(z.hp).toBeLessThan(z.maxHp);
    expect(z.hp).toBeGreaterThan(z.maxHp - 18 * 1.2);
    expect(z.kx).toBeGreaterThan(0);
  });
});

describe('firearms', () => {
  it('fires from the magazine, and reload moves reserve ammo into it', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'gun_a', ROOM);
    const pistol = addItem(ctx, 'pistol_9mm', 1, 'test', { mag: 3 })[0]!;
    addItem(ctx, 'ammo_9mm', 20);
    ctx.state.player.activeSlot = 'firearm1';
    expect(ctx.state.player.equipment.firearm1).toBe(pistol.uid);
    zone.player.facing = 0;
    tick(ctx, zone, rt, { attackPressed: true, aimX: 10, aimY: 1.5 });
    expect(pistol.mag).toBe(2);
    tick(ctx, zone, rt, { reloadPressed: true });
    tick(ctx, zone, rt, {}, 60);
    expect(pistol.mag).toBe(12);
    expect(ammoReserve(ctx, '9mm')).toBe(10);
  });

  it('walls stop bullets', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'gun_b', ['############', '#P...#....#', '############']);
    addItem(ctx, 'pistol_9mm', 1, 'test', { mag: 5 });
    ctx.state.player.activeSlot = 'firearm1';
    zone.player.x = 1.5;
    zone.player.y = 1.5;
    zone.player.facing = 0;
    const z = addZombie(ctx, zone, 'walker', 8.5, 1.5, Math.PI);
    tick(ctx, zone, rt, { attackPressed: true, aimX: 9, aimY: 1.5 });
    expect(z.hp).toBe(z.maxHp);
    expect(zone.tracers[0]!.x2).toBeLessThanOrEqual(5.01);
  });

  it('the shotgun loads one shell at a time', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'gun_c', ROOM);
    const sg = addItem(ctx, 'pump_shotgun', 1, 'test', { mag: 0 })[0]!;
    addItem(ctx, 'ammo_shell', 10);
    ctx.state.player.activeSlot = 'firearm1';
    tick(ctx, zone, rt, { reloadPressed: true });
    tick(ctx, zone, rt, {}, 12, 0.05); // ~0.6 s: one shell
    expect(sg.mag).toBe(1);
    tick(ctx, zone, rt, {}, 80, 0.05);
    expect(sg.mag).toBe(5);
  });
});

describe('shove and throwables', () => {
  it('shove pushes and staggers without damage', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'shove_a', ROOM);
    zone.player.x = 3.5;
    zone.player.y = 2.5;
    zone.player.facing = 0;
    const z = addZombie(ctx, zone, 'walker', 4.5, 2.5, Math.PI);
    tick(ctx, zone, rt, { shovePressed: true });
    expect(z.hp).toBe(z.maxHp);
    expect(z.stagger).toBeGreaterThan(0);
    expect(z.kx).toBeGreaterThan(0);
  });

  it('a thrown bottle lands, smashes and makes zombies investigate', async () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'throw_a', [
      '########################',
      '#P.....................#',
      '########################',
    ]);
    addItem(ctx, 'glass_bottle', 2);
    zone.player.facing = 0;
    const z = addZombie(ctx, zone, 'walker', 20.5, 1.5, Math.PI / 2);
    const { updateProjectiles } = await import('@/sim/combat');
    tick(ctx, zone, rt, { throwPressed: true, aimX: 9.5, aimY: 1.5 });
    expect(zone.thrown.length).toBe(1);
    for (let i = 0; i < 40; i++) updateProjectiles(ctx, zone, rt, 0.05);
    expect(zone.thrown.length).toBe(0);
    expect(z.mode).toBe('investigate');
  });
});
