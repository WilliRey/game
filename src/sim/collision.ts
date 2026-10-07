/** Circle-vs-tile-grid movement with sliding. Entities are circles; solid tiles are unit boxes. */
import type { ZoneRuntime } from './runtime';

export interface Body {
  x: number;
  y: number;
}

/** Push a circle out of every solid tile it overlaps. Returns true if it was moved. */
export function resolveTiles(rt: ZoneRuntime, p: Body, r: number, solid: Uint8Array = rt.solid): boolean {
  let movedAny = false;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    const minX = Math.floor(p.x - r);
    const maxX = Math.floor(p.x + r);
    const minY = Math.floor(p.y - r);
    const maxY = Math.floor(p.y + r);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const blocked = tx < 0 || ty < 0 || tx >= rt.w || ty >= rt.h || solid[ty * rt.w + tx] === 1;
        if (!blocked) continue;
        const cx = Math.max(tx, Math.min(p.x, tx + 1));
        const cy = Math.max(ty, Math.min(p.y, ty + 1));
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d + 1e-4;
          p.x += (dx / d) * push;
          p.y += (dy / d) * push;
        } else {
          // Center is inside the box: leave along the shortest axis.
          const left = p.x - tx;
          const right = tx + 1 - p.x;
          const up = p.y - ty;
          const down = ty + 1 - p.y;
          const m = Math.min(left, right, up, down);
          if (m === left) p.x = tx - r - 1e-4;
          else if (m === right) p.x = tx + 1 + r + 1e-4;
          else if (m === up) p.y = ty - r - 1e-4;
          else p.y = ty + 1 + r + 1e-4;
        }
        moved = true;
      }
    }
    if (!moved) break;
    movedAny = true;
  }
  return movedAny;
}

/** Move a circle by (dx, dy), sub-stepping so fast movers can't tunnel through walls. */
export function moveCircle(
  rt: ZoneRuntime,
  p: Body,
  r: number,
  dx: number,
  dy: number,
  solid?: Uint8Array,
): void {
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (r * 0.5)));
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    p.y += dy / steps;
    resolveTiles(rt, p, r, solid);
  }
}
