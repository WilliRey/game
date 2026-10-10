/**
 * Scripted melee fights in the real zone sim (BRIEF_V2 §3), used by `meleeBalance.test.ts`. A player with a
 * melee weapon fights walkers that start alert: one walker a few tiles in front, or several closing in from
 * all sides at once. The scripted player reacts ~0.18 s late and aims with a wandering ±12° error, like a
 * person with a mouse, and plays one of four styles:
 *  - `turret`: plants their feet and swings at one zombie until it drops (no footwork, no shove);
 *  - `trader`: walks up to one zombie and holds the button until it drops (trading hits);
 *  - `brawler`: walks into the zombie while holding the button;
 *  - `skilled`: keeps zombies at the edge of reach, backs off while recovering, hits whoever is winding up
 *    first, and shoves when two or more crowd in.
 */
import { stepZone } from '@/sim/step';
import { emptyInput, type PlayerInput } from '@/sim/player';
import type { Zombie } from '@/sim/types';
import { addItem, equip } from '@/systems/inventory';
import { weaponStats } from '@/systems/items';
import { Rng } from '@/core/rng';
import { addZombie, arena, makeCtx } from './helpers';

const ROOM = [
  '##########################',
  '#........................#',
  '#........................#',
  '#........................#',
  '#........................#',
  '#........................#',
  '#...........P............#',
  '#........................#',
  '#........................#',
  '#........................#',
  '#........................#',
  '#........................#',
  '##########################',
];

export type Policy = 'turret' | 'trader' | 'brawler' | 'skilled';

export interface FightResult {
  won: boolean;
  died: boolean;
  /** Health lost to zombie hits (bleeding afterwards is reported separately). */
  hpLost: number;
  hitsTaken: number;
  bled: boolean;
  seconds: number;
}

const DT = 1 / 60;

/** What the scripted player perceived about a zombie (positions lag like human reaction time). */
interface Seen {
  z: Zombie;
  x: number;
  y: number;
  windup: number;
}

/** Human-ish reaction time: the scripted player acts on what the zombies were doing this long ago. */
const REACTION_FRAMES = 11; // ≈ 0.18 s

/**
 * One scripted fight. Zombies start alert, a few tiles away, spread across the player's front. The player
 * reacts with a delay and aims with a small wandering error, like a person with a mouse.
 */
export function fight(
  seed: string,
  weaponId: string,
  walkers: number,
  policy: Policy,
  trace?: (line: string) => void,
): FightResult {
  const { ctx } = makeCtx({ seed });
  const bot = Rng.fromSeed(`${seed}:bot`);
  const { zone } = arena(ctx, `melee_balance_${walkers}`, ROOM);
  const weapon = addItem(ctx, weaponId, 1)[0]!;
  equip(ctx, weapon.uid, 'melee');
  ctx.state.player.activeSlot = 'melee';
  const st = weaponStats(ctx.content, weapon);
  if (st?.kind !== 'melee') throw new Error(`${weaponId} is not a melee weapon`);
  const p = zone.player;
  for (let i = 0; i < walkers; i++) {
    // One in front; more walkers close in from the flanks and behind (120° apart for three), all at once.
    const a = -Math.PI / 2 + (i * Math.PI * 2) / walkers + bot.range(-0.15, 0.15);
    const r = walkers > 1 ? 2.1 + bot.range(0, 0.4) : 3.6 + bot.range(0, 0.6);
    const z = addZombie(ctx, zone, 'walker', p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, a + Math.PI);
    z.mode = 'chase';
    z.target = { x: p.x, y: p.y };
  }
  let hpLost = 0;
  let hitsTaken = 0;
  ctx.bus.on('player:damaged', ({ amount, source }) => {
    if (source !== 'walker') return;
    hpLost += amount;
    hitsTaken++;
  });
  let bled = false;
  ctx.bus.on('effect:added', ({ effect }) => {
    if (effect === 'bleeding') bled = true;
  });

  let now = 0;
  if (trace) {
    const zs = () =>
      zone.zombies
        .map(
          (z) =>
            `${z.id}:${z.mode[0]} d=${Math.hypot(z.x - p.x, z.y - p.y).toFixed(2)} w=${z.windup.toFixed(2)} s=${z.stagger.toFixed(2)} hp=${Math.round(z.hp)}`,
        )
        .join(' | ');
    ctx.bus.on('enemy:damaged', (e) =>
      trace(`${now.toFixed(2)} HIT ${e.enemyId} ${e.amount.toFixed(1)} :: ${zs()}`),
    );
    ctx.bus.on('player:damaged', (e) => trace(`${now.toFixed(2)} OUCH ${e.amount} :: ${zs()}`));
    ctx.bus.on('sfx:play', (e) => {
      if (e.key === 'zombie_attack') trace(`${now.toFixed(2)} windup :: ${zs()}`);
      if (e.key === 'shove_hit') trace(`${now.toFixed(2)} SHOVE :: ${zs()}`);
    });
  }
  const history: Seen[][] = [];
  let focus: Zombie | null = null;
  let aimError = 0;
  let aimErrorIn = 0;
  let lmbWas = false;
  let t = 0;
  for (; t < 40 && zone.zombies.length > 0 && !ctx.state.player.dead; t += DT) {
    history.push(zone.zombies.map((z) => ({ z, x: z.x, y: z.y, windup: z.windup })));
    if (history.length > REACTION_FRAMES) history.shift();
    const seen = history[0]!.filter((s) => s.z.hp > 0 && zone.zombies.includes(s.z));
    aimErrorIn -= DT;
    if (aimErrorIn <= 0) {
      aimErrorIn = 0.35;
      aimError = bot.range(-12, 12) * (Math.PI / 180);
    }
    const dist = (s: Seen) => Math.hypot(s.x - p.x, s.y - p.y);
    seen.sort((a, b) => dist(a) - dist(b));
    const inp: PlayerInput = { ...emptyInput(), aimX: p.x + 1, aimY: p.y };
    // A naive player locks onto one zombie and hits it until it drops; the skilled player hits whoever
    // is winding up first.
    if (!focus || !zone.zombies.includes(focus) || focus.hp <= 0) focus = seen[0]?.z ?? null;
    const target =
      policy === 'skilled'
        ? (seen.find((s) => s.windup > 0 && dist(s) < 2.4) ?? seen[0])
        : (seen.find((s) => s.z === focus) ?? seen[0]);
    if (target) {
      const r = ctx.content.enemies[target.z.type]!.radius;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const reach = st.range + r;
      const a = Math.atan2(dy, dx) + aimError;
      inp.aimX = p.x + Math.cos(a) * d;
      inp.aimY = p.y + Math.sin(a) * d;
      if (policy === 'turret') {
        // Plants their feet and swings at one zombie until it drops: no footwork, no shove.
        inp.attack = d < reach + 0.4;
      } else if (policy === 'brawler') {
        // Walks into the zombie while holding the button (what a frantic player does).
        if (d > 0.75) {
          inp.moveX = dx / d;
          inp.moveY = dy / d;
        }
        inp.attack = d < reach + 0.6;
      } else if (policy === 'trader') {
        // Walks up to it and holds the button: trading hits.
        if (d > reach - 0.15) {
          inp.moveX = dx / d;
          inp.moveY = dy / d;
        }
        inp.attack = d < reach + 0.4;
      } else {
        const close = seen.filter((s) => dist(s) < 1.6 + r);
        const swinging = p.action?.kind === 'melee';
        const recovering = p.action?.kind === 'melee' && p.action.phase === 'recovery';
        if (close.length >= 2 && !swinging && p.shoveCooldown <= 0 && ctx.state.player.stamina > 20) {
          // Crowded: shove them all back, then step away.
          inp.shovePressed = true;
        } else if (d < reach - 0.5 || recovering || close.length >= 2) {
          // Too close, still recovering, or flanked: back off so they line up in front.
          let ax = 0;
          let ay = 0;
          for (const s of close.length ? close : [target]) {
            const sd = dist(s) || 1;
            ax -= (s.x - p.x) / sd;
            ay -= (s.y - p.y) / sd;
          }
          const al = Math.hypot(ax, ay) || 1;
          inp.moveX = ax / al;
          inp.moveY = ay / al;
        } else if (d > reach - 0.1) {
          inp.moveX = dx / d;
          inp.moveY = dy / d;
        }
        inp.attack = d < reach + 0.1;
      }
    }
    inp.attackPressed = inp.attack && !lmbWas;
    lmbWas = inp.attack;
    stepZone(ctx, inp, DT);
    now += DT;
  }
  return {
    won: zone.zombies.length === 0,
    died: !!ctx.state.player.dead,
    hpLost,
    hitsTaken,
    bled,
    seconds: t,
  };
}

export function series(
  weaponId: string,
  walkers: number,
  policy: Policy,
  runs = 40,
): { results: FightResult[]; median: number; mean: number; within10: number; deaths: number; wins: number } {
  const results: FightResult[] = [];
  for (let i = 0; i < runs; i++)
    results.push(fight(`balance-${weaponId}-${walkers}-${policy}-${i}`, weaponId, walkers, policy));
  const lost = results.map((r) => r.hpLost).sort((a, b) => a - b);
  return {
    results,
    median: lost[Math.floor(lost.length / 2)]!,
    mean: lost.reduce((a, b) => a + b, 0) / lost.length,
    within10: results.filter((r) => r.hpLost <= 10).length / runs,
    deaths: results.filter((r) => r.died).length,
    wins: results.filter((r) => r.won).length,
  };
}
