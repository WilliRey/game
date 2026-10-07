/**
 * Quest markers (brief §5 Journal): where the tracked objective is, inside the current zone and on the
 * world map. In-zone markers for items and enemies only appear once that spot has been explored.
 */
import type { ObjectiveT } from '@/content/schemas';
import type { GameContext } from '@/core/store';
import { getLayout } from '@/sim/layout';
import { currentObjectives, questDef } from './quests';

interface Pos {
  x: number;
  y: number;
}

function trackedObjectives(ctx: GameContext): { questId: string; ob: ObjectiveT }[] {
  const id = ctx.state.trackedQuest;
  if (!id) return [];
  return currentObjectives(ctx, id)
    .filter((o) => !o.done)
    .map((o) => ({ questId: id, ob: o.ob }));
}

/** Where in the current zone the tracked objective points, if anywhere. */
export function objectiveMarker(ctx: GameContext): Pos | null {
  const zone = ctx.state.zone;
  const id = ctx.state.trackedQuest;
  if (!zone || !id) return null;
  const q = ctx.state.quests[id];
  const stage = q ? questDef(ctx, id)?.stages[q.stage] : undefined;
  const layout = getLayout(ctx.content, zone.zoneId);
  const explored = (p: Pos) => zone.explored[Math.floor(p.y) * zone.w + Math.floor(p.x)] === 1;
  const objectPos = (oid: string): Pos | null => {
    const o = layout.objects.find((x) => x.id === oid);
    if (o) return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    const c = zone.containers[oid];
    if (c) return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    const s = layout.stations.find((x) => x.id === oid);
    if (s) return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
    const e = layout.exits.find((x) => x.id === oid);
    if (e) return { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    return null;
  };
  if (stage?.marker?.objectId && (!stage.marker.zoneId || stage.marker.zoneId === zone.zoneId)) {
    const p = objectPos(stage.marker.objectId);
    if (p) return p;
  }
  for (const { ob } of trackedObjectives(ctx)) {
    switch (ob.type) {
      case 'talk':
      case 'deliver': {
        const npcId = ob.type === 'talk' ? ob.target : ob.npcId;
        const n = zone.npcs.find((x) => x.npcId === npcId);
        if (n) return { x: n.x, y: n.y };
        break;
      }
      case 'interact': {
        const p = objectPos(ob.target);
        if (p) return p;
        break;
      }
      case 'reach': {
        const [zid, area] = ob.target.split(':');
        if (zid === zone.zoneId && area) {
          const p = objectPos(area);
          if (p) return p;
        }
        if (zid !== zone.zoneId && !area) {
          // Point at the way out: an exit straight into that zone, or the world-map exit.
          const direct = layout.exits.find((e) => e.toZone === zid) ?? layout.exits.find((e) => !e.toZone);
          if (direct) return { x: direct.x + direct.w / 2, y: direct.y + direct.h / 2 };
        }
        break;
      }
      case 'collect': {
        const c = layout.containers.find((x) => x.items?.some((i) => i.itemId === ob.target));
        if (c && explored(c) && !zone.containers[c.id]?.searched)
          return { x: c.x + c.w / 2, y: c.y + c.h / 2 };
        const pick = zone.items.find((w) => w.stack.itemId === ob.target);
        if (pick && explored(pick)) return { x: pick.x, y: pick.y };
        break;
      }
      case 'kill': {
        const z = zone.zombies.find((x) => x.type === ob.target && x.hp > 0);
        if (z && explored(z)) return { x: z.x, y: z.y };
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/** Zones (by id) that the tracked quest currently points to, for world-map markers. */
export function questZones(ctx: GameContext): Set<string> {
  const out = new Set<string>();
  const id = ctx.state.trackedQuest;
  const q = id ? ctx.state.quests[id] : undefined;
  const marker = q && id ? questDef(ctx, id)?.stages[q.stage]?.marker : undefined;
  if (marker?.zoneId) out.add(marker.zoneId);
  for (const { ob } of trackedObjectives(ctx)) {
    for (const z of ctx.content.lists.zones) {
      const has = (pred: (o: (typeof z.objects)[number]) => boolean) => z.objects.some(pred);
      switch (ob.type) {
        case 'reach':
          if (ob.target.split(':')[0] === z.id) out.add(z.id);
          break;
        case 'talk':
          if (has((o) => o.type === 'npc' && o.npcId === ob.target)) out.add(z.id);
          break;
        case 'deliver':
          if (has((o) => o.type === 'npc' && o.npcId === ob.npcId)) out.add(z.id);
          break;
        case 'interact':
          if (has((o) => o.id === ob.target)) out.add(z.id);
          break;
        case 'collect':
          if (has((o) => o.itemId === ob.target || !!o.items?.some((i) => i.itemId === ob.target)))
            out.add(z.id);
          break;
        case 'kill':
          if (ob.target !== 'any' && has((o) => o.enemyType === ob.target)) out.add(z.id);
          break;
        default:
          break;
      }
    }
  }
  return out;
}
