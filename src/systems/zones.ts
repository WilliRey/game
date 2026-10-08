/** Entering and leaving zones: building the live zone, remembering it afterwards, and zone-entry effects. */
import type { GameContext } from '@/core/store';
import { buildZone, rememberZone } from '@/sim/build';
import { populateZone } from '@/sim/spawn';
import { applyEffects } from './effects';

/** Store the current zone's state in `state.zones` and clear it. */
export function leaveZone(ctx: GameContext): void {
  const z = ctx.state.zone;
  if (!z) return;
  ctx.state.zones[z.zoneId] = rememberZone(ctx, z);
  ctx.state.zone = null;
  ctx.bus.emit('zone:exited', { zoneId: z.zoneId });
}

/** Build and enter a zone. `entry` is a start object id inside that zone. */
export function enterZone(ctx: GameContext, zoneId: string, entry?: string): void {
  leaveZone(ctx);
  const firstVisit = !ctx.state.zones[zoneId];
  const zone = buildZone(ctx, zoneId, entry);
  populateZone(ctx, zone, ctx.state.zones[zoneId]);
  ctx.state.zone = zone;
  const node = ctx.content.lists.worldNodes.find((n) => n.zoneId === zoneId && !n.lockedText);
  if (node) {
    ctx.state.world.currentNode = node.id;
    if (!ctx.state.world.knownNodes.includes(node.id)) ctx.state.world.knownNodes.push(node.id);
    if (!ctx.state.world.visitedNodes.includes(node.id)) ctx.state.world.visitedNodes.push(node.id);
  }
  // Remember immediately so the world map can show the zone (and % searched) even mid-visit.
  ctx.state.zones[zoneId] = rememberZone(ctx, zone);
  ctx.bus.emit('zone:loaded', { zoneId });
  ctx.bus.emit('zone:entered', { zoneId });
  const def = ctx.content.zones[zoneId]!;
  if (firstVisit) applyEffects(ctx, def.onFirstEnter, `zone:${zoneId}`);
  applyEffects(ctx, def.onEnter, `zone:${zoneId}`);
}
