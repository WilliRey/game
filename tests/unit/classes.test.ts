/** Classes (BRIEF_V2 §4): kits, skills, perks, the Q ability, class gadgets, class-aware story text, saves. */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/config/balance';
import { validateContent } from '@/content/validate';
import { useAbility } from '@/sim/abilities';
import { updateProjectiles } from '@/sim/combat';
import { emptyInput } from '@/sim/player';
import { canSeePlayer } from '@/sim/zombies';
import { stepZone } from '@/sim/step';
import { classOf, perk } from '@/systems/classes';
import { passTime } from '@/systems/clock';
import { knowsRecipe } from '@/systems/conditions';
import { craftContext, recipesAt, repairCost } from '@/systems/crafting';
import { choices, choose, startDialogue } from '@/systems/dialogue';
import { addItem, carryCapacity, equippedIn, findStack } from '@/systems/inventory';
import { deserializeState, migrate, serializeState, type SaveFile } from '@/systems/save';
import { SAVE_VERSION, setupNewGame } from '@/systems/session';
import { text } from '@/systems/story';
import { addEffect, getEffect, survivalTick, useItem } from '@/systems/survival';
import { addZombie, arena, content, makeCtx } from './helpers';

const CLASSES = ['mechanic', 'paramedic', 'excop', 'scavenger'];

function newGame(classId: string) {
  const { store, ctx } = makeCtx({ seed: `class-${classId}` });
  ctx.state.player.classId = classId;
  setupNewGame(ctx);
  return { store, ctx };
}

const ROOM = [
  '########################',
  '#P.....................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];

describe('class data', () => {
  it('ships the four starting classes and validates', () => {
    expect(Object.keys(content().classes).sort()).toEqual([...CLASSES].sort());
    expect(validateContent(content()).errors).toEqual([]);
  });
});

describe('starting a new game as each class', () => {
  it('mechanic: wrench, toolbox, tape, the pipe-pistol recipe, crafting skill', () => {
    const { ctx } = newGame('mechanic');
    expect(equippedIn(ctx, 'melee')?.itemId).toBe('wrench');
    expect(ctx.state.player.inventory.some((s) => s.itemId === 'toolbox')).toBe(true);
    expect(ctx.state.player.inventory.find((s) => s.itemId === 'duct_tape')?.qty).toBe(3);
    expect(knowsRecipe(ctx, 'pipe_pistol')).toBe(true);
    expect(ctx.state.player.skills.crafting).toBe(2);
    expect(knowsRecipe(ctx, 'noisemaker')).toBe(true);
  });

  it('paramedic: scalpel, first-aid kits, bandages, antibiotics', () => {
    const { ctx } = newGame('paramedic');
    expect(equippedIn(ctx, 'melee')?.itemId).toBe('scalpel');
    const inv = ctx.state.player.inventory;
    expect(inv.find((s) => s.itemId === 'first_aid_kit')?.qty).toBe(2);
    expect(inv.find((s) => s.itemId === 'antibiotics')?.qty).toBe(1);
    expect(ctx.state.player.skills.survival).toBe(2);
  });

  it('ex-cop: a loaded 9mm with spare ammo and a baton', () => {
    const { ctx } = newGame('excop');
    const gun = equippedIn(ctx, 'firearm1')!;
    expect(gun.itemId).toBe('pistol_9mm');
    expect(gun.mag).toBe(12);
    expect(ctx.state.player.inventory.find((s) => s.itemId === 'ammo_9mm')?.qty).toBe(12);
    expect(equippedIn(ctx, 'melee')?.itemId).toBe('police_baton');
    expect(ctx.state.player.skills.firearms).toBe(2);
  });

  it('scavenger: crowbar, lockpicks and the bigger backpack', () => {
    const { ctx } = newGame('scavenger');
    expect(equippedIn(ctx, 'melee')?.itemId).toBe('crowbar');
    expect(equippedIn(ctx, 'backpack')?.itemId).toBe('hiking_pack');
    expect(carryCapacity(ctx)).toBe(BALANCE.carry.base + 15);
    expect(ctx.state.player.inventory.find((s) => s.itemId === 'lockpick')?.qty).toBe(4);
    expect(ctx.state.player.skills.scavenging).toBe(2);
  });

  it('gadget recipes belong to one class each', () => {
    for (const id of CLASSES) {
      const { ctx } = newGame(id);
      const gadgets = ctx.content.lists.recipes.filter((r) => r.class);
      for (const r of gadgets) expect(knowsRecipe(ctx, r.id)).toBe(r.class === id);
      const listed = recipesAt(ctx, craftContext(ctx, 'inventory')).map((s) => s.recipe.id);
      for (const r of gadgets) expect(listed.includes(r.id)).toBe(r.class === id);
    }
  });
});

describe('passive perks', () => {
  it('mechanic repairs cost fewer materials', () => {
    const { ctx } = makeCtx();
    const bat = addItem(ctx, 'bat', 1)[0]!;
    ctx.state.player.classId = 'scavenger';
    const full = repairCost(ctx, bat).reduce((n, c) => n + c.qty, 0);
    ctx.state.player.classId = 'mechanic';
    const cheap = repairCost(ctx, bat).reduce((n, c) => n + c.qty, 0);
    expect(cheap).toBeLessThan(full);
    expect(cheap).toBeGreaterThan(0);
  });

  it('paramedic healing items restore 50% more and infections progress slower', () => {
    const heal = (classId: string) => {
      const { ctx } = makeCtx();
      ctx.state.player.classId = classId;
      ctx.state.player.hp = 20;
      const kit = addItem(ctx, 'first_aid_kit', 1)[0]!;
      useItem(ctx, kit.uid);
      return ctx.state.player.hp - 20;
    };
    expect(heal('paramedic')).toBeCloseTo(heal('excop') * 1.5, 5);
    const infect = (classId: string) => {
      const { ctx } = makeCtx();
      ctx.state.player.classId = classId;
      addEffect(ctx, 'infection', 10);
      survivalTick(ctx, 600, 'active', false);
      return getEffect(ctx, 'infection')!.value - 10;
    };
    expect(infect('paramedic')).toBeCloseTo(infect('mechanic') * 0.6, 5);
  });

  it('ex-cop guns hit harder, reload faster and spread less', () => {
    const { ctx } = makeCtx();
    ctx.state.player.classId = 'excop';
    const p = perk(ctx);
    expect(p.firearmDamage).toBeGreaterThan(1);
    expect(p.reloadSpeed).toBeGreaterThan(1);
    expect(p.firearmSpread).toBeLessThan(1);
  });

  it('scavenger footsteps are quieter', () => {
    const step = (classId: string) => {
      const { ctx } = makeCtx();
      ctx.state.player.classId = classId;
      arena(ctx, `steps_${classId}`, ROOM);
      const radii: number[] = [];
      ctx.bus.on('noise:emitted', ({ radius, source }) => {
        if (source === 'footstep') radii.push(radius);
      });
      for (let i = 0; i < 60; i++) stepZone(ctx, { ...emptyInput(), moveX: 1, aimX: 20, aimY: 1.5 }, 1 / 60);
      return radii[0]!;
    };
    expect(step('scavenger')).toBeCloseTo(step('mechanic') * 0.75, 5);
  });
});

describe('the Q ability', () => {
  it('mechanic: a free noise-maker lures zombies, then the ability recharges in game time', () => {
    const { ctx } = makeCtx();
    ctx.state.player.classId = 'mechanic';
    const { zone, rt } = arena(ctx, 'ability_decoy', ROOM);
    zone.player.x = 2.5;
    zone.player.y = 2.5;
    zone.player.facing = 0;
    const z = addZombie(ctx, zone, 'walker', 20.5, 4.5, Math.PI / 2);
    expect(useAbility(ctx, zone, rt, 12.5, 2.5)).toBe(true);
    expect(zone.thrown[0]?.itemId).toBe('noisemaker');
    expect(ctx.state.player.inventory.some((s) => s.itemId === 'noisemaker')).toBe(false);
    for (let i = 0; i < 40; i++) updateProjectiles(ctx, zone, rt, 0.05);
    expect(zone.hazards.some((h) => h.kind === 'decoy')).toBe(true);
    expect(z.mode).toBe('investigate');
    expect(Math.hypot(z.target!.x - 12.5, z.target!.y - 2.5)).toBeLessThan(1.5);
    // On cooldown: a second press does nothing.
    expect(useAbility(ctx, zone, rt, 12.5, 2.5)).toBe(false);
    passTime(ctx, classOf(ctx).ability.cooldownSec / BALANCE.time.gameMinutesPerRealSecond, 'active');
    expect(ctx.state.player.abilityCooldown).toBe(0);
  });

  it('ex-cop: a flashbang dazes zombies near the blast and they lose track', () => {
    const { ctx } = makeCtx();
    ctx.state.player.classId = 'excop';
    const { zone, rt } = arena(ctx, 'ability_flash', ROOM);
    zone.player.x = 2.5;
    zone.player.y = 2.5;
    zone.player.facing = 0;
    const z = addZombie(ctx, zone, 'walker', 8.5, 2.5, Math.PI);
    z.mode = 'chase';
    const far = addZombie(ctx, zone, 'walker', 21.5, 4.5, Math.PI);
    useAbility(ctx, zone, rt, 8.5, 2.5);
    for (let i = 0; i < 20; i++) updateProjectiles(ctx, zone, rt, 0.05);
    expect(z.stagger).toBeGreaterThan(2);
    expect(z.mode).toBe('search');
    expect(far.stagger).toBe(0);
  });

  it('paramedic: adrenaline heals, refills stamina, and sprinting is free for a while', () => {
    const { ctx } = makeCtx();
    ctx.state.player.classId = 'paramedic';
    const { zone, rt } = arena(ctx, 'ability_adrenaline', ROOM);
    ctx.state.player.hp = 40;
    ctx.state.player.stamina = 5;
    useAbility(ctx, zone, rt, 5, 2);
    expect(ctx.state.player.hp).toBeGreaterThan(65);
    expect(ctx.state.player.stamina).toBe(ctx.state.player.maxStamina);
    for (let i = 0; i < 60; i++)
      stepZone(ctx, { ...emptyInput(), moveX: 1, sprint: true, aimX: 20, aimY: 1.5 }, 1 / 60);
    expect(ctx.state.player.stamina).toBe(ctx.state.player.maxStamina);
  });

  it('scavenger: scouting marks nearby containers on the map for a few seconds', () => {
    const { ctx } = makeCtx();
    ctx.state.player.classId = 'scavenger';
    const { zone, rt } = arena(ctx, 'ability_scout', [
      '##########',
      '#P.#....t#',
      '#..#.....#',
      '##########',
    ]);
    const c = Object.values(zone.containers)[0]!;
    expect(zone.explored[c.y * zone.w + c.x]).toBe(0);
    useAbility(ctx, zone, rt, 5, 1);
    expect(zone.player.scout).toBeGreaterThan(0);
    expect(zone.explored[c.y * zone.w + c.x]).toBe(1);
  });

  it('is refused inside the camp', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'ability_safe', ROOM, { safe: true });
    expect(useAbility(ctx, zone, rt, 5, 2)).toBe(false);
    expect(ctx.state.player.abilityCooldown).toBe(0);
  });
});

describe('class gadgets', () => {
  it('a smoke bomb between you and a zombie breaks its line of sight', () => {
    const { ctx } = makeCtx();
    const { zone, rt } = arena(ctx, 'smoke_a', ROOM);
    zone.player.x = 2.5;
    zone.player.y = 2.5;
    const z = addZombie(ctx, zone, 'walker', 11.5, 2.5, Math.PI);
    z.mode = 'chase';
    expect(canSeePlayer(ctx, zone, rt, z)).toBe(true);
    const bomb = addItem(ctx, 'smoke_bomb', 1)[0]!;
    ctx.state.player.equipment.throwable = bomb.uid;
    const still = { ...emptyInput(), aimX: 6.5, aimY: 2.5 };
    stepZone(ctx, { ...still, throwPressed: true }, 1 / 60);
    for (let t = 0; t < 0.6; t += 1 / 60) stepZone(ctx, still, 1 / 60);
    expect(zone.hazards.some((h) => h.kind === 'smoke')).toBe(true);
    expect(canSeePlayer(ctx, zone, rt, z)).toBe(false);
    for (let t = 0; t < 1.6; t += 1 / 60) stepZone(ctx, still, 1 / 60);
    expect(z.mode).toBe('search');
  });
});

describe('class-aware story', () => {
  it('lines about Sam’s job follow the class', () => {
    const lines = CLASSES.map((id) => {
      const { ctx } = makeCtx();
      ctx.state.player.classId = id;
      return text(ctx, ctx.content.notes.note_phone_log!.body);
    });
    expect(lines[0]).toContain('grease monkey');
    expect(new Set(lines).size).toBe(CLASSES.length);
  });

  it('Ruth offers each class its own line in the deal', () => {
    const seen = new Set<string>();
    for (const id of CLASSES) {
      const { ctx } = makeCtx({ setup: true });
      ctx.state.player.classId = id;
      ctx.state.quests.act1 = {
        id: 'act1',
        status: 'active',
        stage: 1,
        progress: {},
        startedAtMinutes: 0,
        completions: 0,
      };
      const session = startDialogue(ctx, { npcId: 'ruth' })!;
      const opts = choices(ctx, session).map((c) => c.text);
      expect(opts.length).toBe(3);
      seen.add(opts[0]!);
    }
    expect(seen.size).toBe(CLASSES.length);
  });

  it('a paramedic gets the pharmacy key from Doc', () => {
    const { ctx } = makeCtx({ setup: true });
    ctx.state.player.classId = 'paramedic';
    const session = startDialogue(ctx, { npcId: 'doc_ama' })!;
    const offer = choices(ctx, session).find((c) => c.text.startsWith('What do you need most'))!;
    choose(ctx, session, offer.index);
    const key = choices(ctx, session).find((c) => c.text.includes('back-room key'))!;
    choose(ctx, session, key.index);
    expect(ctx.state.player.inventory.some((s) => s.itemId === 'pharmacy_key')).toBe(true);
    expect(ctx.state.quests.medicine_run?.status).toBe('active');
  });
});

describe('saves', () => {
  it('store the class, and v1 saves migrate to the mechanic', () => {
    const { ctx } = newGame('scavenger');
    const raw = serializeState(ctx.state);
    expect(deserializeState(ctx.content, raw).player.classId).toBe('scavenger');

    const v1 = structuredClone(raw);
    const player = v1.player as Record<string, unknown>;
    delete player.classId;
    delete player.abilityCooldown;
    const file: SaveFile = { format: 'holdout-save', version: 1, meta: {} as SaveFile['meta'], state: v1 };
    const migrated = migrate(file);
    expect(migrated.version).toBe(SAVE_VERSION);
    const s = deserializeState(ctx.content, migrated.state);
    expect(s.player.classId).toBe('mechanic');
    expect(s.player.abilityCooldown).toBe(0);
    expect(findStack({ ...ctx, state: s }, s.player.equipment.melee)?.itemId).toBe('crowbar');
  });
});
