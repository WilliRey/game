/** Player movement, stance, stamina and footstep noise (brief §5 Player, §7 Speeds). */
import { BALANCE } from '@/config/balance';
import type { GameContext } from '@/core/store';
import type { WeaponSlot } from '@/core/types';
import { SKILL, rank } from '@/systems/progression';
import { armorReduction, maxStamina, updateEncumbrance } from '@/systems/survival';
import { moveCircle } from './collision';
import { emitNoise } from './noise';
import type { ZoneRuntime } from './runtime';
import type { ZoneState } from './types';

/** One frame of player intent, produced by the input layer. Edges (`*Pressed`) are true for one frame. */
export interface PlayerInput {
  moveX: number;
  moveY: number;
  /** Cursor in world tile coordinates. */
  aimX: number;
  aimY: number;
  sprint: boolean;
  aim: boolean;
  attack: boolean;
  attackPressed: boolean;
  interactPressed: boolean;
  interactHeld: boolean;
  /** Shift held while interacting: force locks with a crowbar. */
  force: boolean;
  reloadPressed: boolean;
  shovePressed: boolean;
  throwPressed: boolean;
  crouchToggle: boolean;
  flashlightToggle: boolean;
  slot: WeaponSlot | null;
  wheel: number;
  quick: number | null;
}

export function emptyInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    aimX: 0,
    aimY: 0,
    sprint: false,
    aim: false,
    attack: false,
    attackPressed: false,
    interactPressed: false,
    interactHeld: false,
    force: false,
    reloadPressed: false,
    shovePressed: false,
    throwPressed: false,
    crouchToggle: false,
    flashlightToggle: false,
    slot: null,
    wheel: 0,
    quick: null,
  };
}

export function updatePlayerMovement(
  ctx: GameContext,
  zone: ZoneState,
  rt: ZoneRuntime,
  input: PlayerInput,
  dt: number,
): void {
  const p = zone.player;
  const ps = ctx.state.player;
  const S = BALANCE.speed;
  const H = BALANCE.health;

  p.facing = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  p.aiming = input.aim && !zone.safe;
  if (input.crouchToggle) p.crouched = !p.crouched;

  let mx = input.moveX;
  let my = input.moveY;
  const len = Math.hypot(mx, my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  // Timed actions (searching, lockpicking) root the player; moving cancels them elsewhere.
  const rooted = p.action?.kind === 'timed' && p.action.hold;
  const wantsMove = len > 0.1 && !rooted;
  const encumbered = updateEncumbrance(ctx);
  const canSprint = !encumbered && !p.aiming && ps.stamina > (p.sprinting ? 0.5 : 12);
  p.sprinting = input.sprint && wantsMove && canSprint;
  if (p.sprinting) p.crouched = false;

  let speed: number = p.aiming ? S.aim : p.crouched ? S.crouch : p.sprinting ? S.sprint : S.walk;
  if (encumbered) speed = Math.min(speed, S.encumbered);
  if (p.action?.kind === 'melee') speed *= 0.6;
  if (p.action?.kind === 'reload') speed *= 0.8;

  // Stamina: sprinting drains, regen waits for a short delay and slows when hungry or thirsty.
  const maxSt = maxStamina(ctx);
  if (p.sprinting) {
    ps.stamina = Math.max(0, ps.stamina - H.sprintStaminaPerSecond * dt);
    p.staminaIdle = 0;
  } else {
    p.staminaIdle += dt;
    if (p.staminaIdle >= H.staminaRegenDelay) {
      const low = ps.hunger < BALANCE.needs.lowThreshold || ps.thirst < BALANCE.needs.lowThreshold;
      const regen = H.staminaRegenPerSecond * (low ? 1 - BALANCE.needs.lowStaminaRegenPenalty : 1);
      ps.stamina = Math.min(maxSt, ps.stamina + regen * dt);
    }
  }
  if (ps.stamina > maxSt) ps.stamina = maxSt;

  const tx = wantsMove ? mx * speed : 0;
  const ty = wantsMove ? my * speed : 0;
  const k = Math.min(1, dt * 16);
  p.vx += (tx - p.vx) * k;
  p.vy += (ty - p.vy) * k;
  if (Math.abs(p.vx) < 0.01) p.vx = 0;
  if (Math.abs(p.vy) < 0.01) p.vy = 0;
  p.moving = Math.hypot(p.vx, p.vy) > 0.3;

  if (ps.noclip) {
    p.x = Math.max(0.5, Math.min(zone.w - 0.5, p.x + p.vx * dt));
    p.y = Math.max(0.5, Math.min(zone.h - 0.5, p.y + p.vy * dt));
  } else {
    moveCircle(rt, p, p.radius, p.vx * dt, p.vy * dt);
    pushOutOfNpcs(zone);
  }

  // Bloom from movement decays toward zero (firing adds more in combat).
  const C = BALANCE.combat;
  const moveBloom = p.moving ? C.bloomMovePerSecond * (p.sprinting ? 1.6 : 1) : 0;
  p.bloom = Math.max(0, p.bloom + (moveBloom - C.bloomDecayPerSecond) * dt);
  p.bloom = Math.min(p.bloom, 20);

  // Footsteps.
  if (p.moving) {
    p.footstepIn -= dt;
    if (p.footstepIn <= 0) {
      const N = BALANCE.noise;
      p.footstepIn = p.sprinting ? 0.3 : p.crouched ? 0.55 : N.footstepIntervalSeconds;
      const base = p.sprinting ? N.sprint : p.crouched || p.aiming ? N.crouch : N.walk;
      const tile = rt.noiseMul[Math.floor(p.y) * rt.w + Math.floor(p.x)] ?? 1;
      const radius = base * tile * (1 + armorReduction(ctx).noise) * SKILL.noise(rank(ctx, 'stealth'));
      emitNoise(ctx, zone, p.x, p.y, radius, tile > 1.5 ? 'glass' : 'footstep', true);
      ctx.bus.emit('sfx:play', {
        key: tile > 1.5 ? 'step_glass' : 'step',
        x: p.x,
        y: p.y,
        volume: p.crouched ? 0.3 : p.sprinting ? 0.9 : 0.55,
      });
    }
  } else {
    p.footstepIn = Math.min(p.footstepIn, 0.15);
  }
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
}

function pushOutOfNpcs(zone: ZoneState): void {
  const p = zone.player;
  for (const n of zone.npcs) {
    const dx = p.x - n.x;
    const dy = p.y - n.y;
    const d = Math.hypot(dx, dy);
    const min = p.radius + 0.32;
    if (d < min && d > 1e-6) {
      p.x = n.x + (dx / d) * min;
      p.y = n.y + (dy / d) * min;
    }
  }
}
