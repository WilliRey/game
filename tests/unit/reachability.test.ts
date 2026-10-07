/**
 * Map sanity for every shipped zone: from the default start, every exit, start, container, station,
 * NPC, trigger, pickup and usable object can be reached on foot (doors count as passable — they can be
 * opened, picked, forced or bashed — and so do blockers, which quests remove).
 */
import { describe, expect, it } from 'vitest';
import { buildZone } from '@/sim/build';
import { getLayout } from '@/sim/layout';
import { getRuntime } from '@/sim/runtime';
import { content, makeCtx } from './helpers';

const shipped = content()
  .lists.zones.map((z) => z.id)
  .filter((id) => !id.startsWith('test'));

describe('zone reachability', () => {
  for (const zoneId of shipped) {
    it(`${zoneId}: everything is reachable from the start`, () => {
      const { ctx } = makeCtx();
      const zone = buildZone(ctx, zoneId);
      const rt = getRuntime(ctx.content, zone);
      const layout = getLayout(ctx.content, zoneId);
      const { w, h } = zone;
      const passable = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) passable[i] = rt.solid[i] ? 0 : 1;
      for (const d of layout.doors) passable[d.y * w + d.x] = 1;
      for (const o of layout.objects)
        if (o.type === 'blocker')
          for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) passable[y * w + x] = 1;

      const seen = new Uint8Array(w * h);
      const sx = Math.floor(zone.player.x);
      const sy = Math.floor(zone.player.y);
      expect(passable[sy * w + sx], 'start tile is passable').toBe(1);
      const queue = [sy * w + sx];
      seen[sy * w + sx] = 1;
      while (queue.length) {
        const i = queue.pop()!;
        const x = i % w;
        const y = (i / w) | 0;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (seen[j] || !passable[j]) continue;
          seen[j] = 1;
          queue.push(j);
        }
      }
      /** A rect is usable if one of its tiles, or a tile touching it, was reached. */
      const reachable = (r: { x: number; y: number; w?: number; h?: number }) => {
        const rw = r.w ?? 1;
        const rh = r.h ?? 1;
        for (let y = r.y - 1; y <= r.y + rh; y++)
          for (let x = r.x - 1; x <= r.x + rw; x++)
            if (x >= 0 && y >= 0 && x < w && y < h && seen[y * w + x]) return true;
        return false;
      };
      const unreachable: string[] = [];
      for (const e of layout.exits) if (!reachable(e)) unreachable.push(`exit ${e.id}`);
      for (const c of layout.containers)
        if (!reachable(c)) unreachable.push(`container ${c.id} (${c.x},${c.y})`);
      for (const s of layout.stations) if (!reachable(s)) unreachable.push(`station ${s.id}`);
      for (const [id, p] of Object.entries(layout.starts))
        if (!reachable({ x: Math.floor(p.x), y: Math.floor(p.y) })) unreachable.push(`start ${id}`);
      for (const o of layout.objects) {
        if (!['npc', 'trigger', 'pickup', 'interact', 'siphon', 'vehicle', 'blocker'].includes(o.type))
          continue;
        if (!reachable(o)) unreachable.push(`${o.type} ${o.id} (${o.x},${o.y})`);
      }
      expect(unreachable).toEqual([]);
    });
  }
});
