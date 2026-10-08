/**
 * Noise: every action emits a noise with a radius. Zombies hear noises in range (attenuated through
 * walls) and investigate; loud noises the player can't see show a directional ping.
 */
import type { GameContext } from '@/core/store';
import type { ZoneState } from './types';
import { hearNoise } from './zombies';

/**
 * `byPlayer` marks noises the player is responsible for (footsteps, shots, a thrown bottle); only noises
 * made at the player's own position count toward the HUD noise meter.
 */
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
  const p = zone.player;
  if (byPlayer && Math.hypot(x - p.x, y - p.y) < 1.5) p.noise = Math.max(p.noise, radius);
  ctx.bus.emit('noise:emitted', { x, y, radius, source, byPlayer });
  hearNoise(ctx, zone, x, y, radius);
}

export function decayNoises(zone: ZoneState, dt: number): void {
  for (const n of zone.noises) n.ttl -= dt;
  if (zone.noises.length && zone.noises[0]!.ttl <= 0) zone.noises = zone.noises.filter((n) => n.ttl > 0);
  zone.player.noise = Math.max(0, zone.player.noise - dt * 12);
}
