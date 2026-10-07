/**
 * Noise: every action emits a noise with a radius. Zombies hear noises in range (attenuated through
 * walls) and investigate; loud noises the player can't see show a directional ping.
 */
import type { GameContext } from '@/core/store';
import type { ZoneState } from './types';

export const NOISE_PING_MIN_RADIUS = 10;

export function emitNoise(
  ctx: GameContext,
  zone: ZoneState,
  x: number,
  y: number,
  radius: number,
  source: string,
  byPlayer: boolean,
): void {
  if (radius <= 0) return;
  zone.noises.push({ x, y, radius, source, byPlayer, ttl: 0.6 });
  if (zone.noises.length > 64) zone.noises.shift();
  if (byPlayer) zone.player.noise = Math.max(zone.player.noise, radius);
  ctx.bus.emit('noise:emitted', { x, y, radius, source, byPlayer });
  hearNoise(ctx, zone, x, y, radius, byPlayer);
}

/** Zombie hearing hook; filled in by the zombie AI module. */
let hearHook:
  | ((ctx: GameContext, zone: ZoneState, x: number, y: number, radius: number, byPlayer: boolean) => void)
  | null = null;
export function setHearingHook(fn: typeof hearHook): void {
  hearHook = fn;
}
function hearNoise(
  ctx: GameContext,
  zone: ZoneState,
  x: number,
  y: number,
  radius: number,
  byPlayer: boolean,
): void {
  hearHook?.(ctx, zone, x, y, radius, byPlayer);
}

export function decayNoises(zone: ZoneState, dt: number): void {
  for (const n of zone.noises) n.ttl -= dt;
  if (zone.noises.length && zone.noises[0]!.ttl <= 0) zone.noises = zone.noises.filter((n) => n.ttl > 0);
  zone.player.noise = Math.max(0, zone.player.noise - dt * 12);
}
