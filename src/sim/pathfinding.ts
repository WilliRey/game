/**
 * Grid A* for zombies: 8-directional, no corner cutting, closed doors passable at extra cost (zombies
 * bash through them). Buffers are reused per runtime so repeated searches don't allocate.
 */
import type { ZoneRuntime } from './runtime';
import type { Vec } from './types';

interface Buffers {
  g: Float32Array;
  f: Float32Array;
  parent: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  heap: Int32Array;
  heapF: Float32Array;
  gen: number;
}

const buffers = new WeakMap<ZoneRuntime, Buffers>();

function getBuffers(rt: ZoneRuntime): Buffers {
  let b = buffers.get(rt);
  const n = rt.w * rt.h;
  if (!b || b.g.length !== n) {
    b = {
      g: new Float32Array(n),
      f: new Float32Array(n),
      parent: new Int32Array(n),
      stamp: new Uint32Array(n),
      closed: new Uint32Array(n),
      heap: new Int32Array(n * 4),
      heapF: new Float32Array(n * 4),
      gen: 0,
    };
    buffers.set(rt, b);
  }
  return b;
}

export interface PathOptions {
  /** Give up after expanding this many nodes. */
  maxNodes?: number;
  /** Extra cost for stepping through a closed door. */
  doorCost?: number;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Can a zombie path through this tile (open, or a door it can bash)? */
function passable(rt: ZoneRuntime, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= rt.w || y >= rt.h) return false;
  const i = y * rt.w + x;
  return rt.solid[i] === 0 || rt.doorAt.has(i);
}

/**
 * Tile-center waypoints from (sx,sy) to (tx,ty), excluding the start tile, or null if unreachable within
 * the node budget. If the goal itself is blocked, paths to the nearest reachable neighbor of it.
 */
export function findPath(
  rt: ZoneRuntime,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  opts: PathOptions = {},
): Vec[] | null {
  const W = rt.w;
  const startX = Math.floor(sx);
  const startY = Math.floor(sy);
  let goalX = Math.floor(tx);
  let goalY = Math.floor(ty);
  if (!passable(rt, startX, startY)) return null;
  if (!passable(rt, goalX, goalY)) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const [dx, dy] of DIRS) {
      const nx = goalX + dx;
      const ny = goalY + dy;
      if (!passable(rt, nx, ny)) continue;
      const d = Math.hypot(nx - startX, ny - startY);
      if (d < bestD) {
        bestD = d;
        best = [nx, ny];
      }
    }
    if (!best) return null;
    [goalX, goalY] = best;
  }
  const start = startY * W + startX;
  const goal = goalY * W + goalX;
  if (start === goal) return [];

  const b = getBuffers(rt);
  b.gen = (b.gen + 1) >>> 0 || 1;
  const gen = b.gen;
  const maxNodes = opts.maxNodes ?? 2500;
  const doorCost = opts.doorCost ?? 4;
  const h = (i: number) => {
    const dx = Math.abs((i % W) - goalX);
    const dy = Math.abs(Math.floor(i / W) - goalY);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  // Binary min-heap of (node, f) pairs with lazy deletion: stale entries are skipped when popped.
  let heapSize = 0;
  const heap = b.heap;
  const hf = b.heapF;
  const push = (i: number, f: number) => {
    if (heapSize >= heap.length) return;
    let k = heapSize++;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[p]! <= f) break;
      heap[k] = heap[p]!;
      hf[k] = hf[p]!;
      k = p;
    }
    heap[k] = i;
    hf[k] = f;
  };
  const pop = (): number => {
    const top = heap[0]!;
    const last = heap[--heapSize]!;
    const lastF = hf[heapSize]!;
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      if (l >= heapSize) break;
      const r = l + 1;
      const c = r < heapSize && hf[r]! < hf[l]! ? r : l;
      if (hf[c]! >= lastF) break;
      heap[k] = heap[c]!;
      hf[k] = hf[c]!;
      k = c;
    }
    heap[k] = last;
    hf[k] = lastF;
    return top;
  };

  b.stamp[start] = gen;
  b.g[start] = 0;
  b.f[start] = h(start);
  b.parent[start] = -1;
  push(start, b.f[start]!);
  let expanded = 0;
  while (heapSize > 0) {
    const cur = pop();
    if (b.closed[cur] === gen) continue;
    b.closed[cur] = gen;
    if (cur === goal) break;
    if (++expanded > maxNodes) return null;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!passable(rt, nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!passable(rt, cx + dx, cy) || !passable(rt, cx, cy + dy))) continue;
      const ni = ny * W + nx;
      if (b.closed[ni] === gen) continue;
      const extra = rt.solid[ni] === 1 ? doorCost : 0;
      const ng = b.g[cur]! + cost + extra;
      if (b.stamp[ni] === gen && ng >= b.g[ni]!) continue;
      b.stamp[ni] = gen;
      b.g[ni] = ng;
      b.f[ni] = ng + h(ni);
      b.parent[ni] = cur;
      push(ni, b.f[ni]!);
    }
  }
  if (b.closed[goal] !== gen) return null;
  const out: Vec[] = [];
  for (let i = goal; i !== start && i >= 0; i = b.parent[i]!)
    out.push({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 });
  out.reverse();
  return out;
}
