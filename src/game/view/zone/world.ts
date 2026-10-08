/**
 * The static zone: textured floors (one merged mesh drawing from the tile atlas, with baked contact
 * shadows near walls), walls extruded to full height (instanced boxes, cut away near the player), windows,
 * door lintels, fences, counters, rubble, bushes and trees. Roofs are never drawn.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import type { TileKind } from '@/content/schemas';
import { TILE_KINDS } from '@/sim/tiles';
import type { ZoneState } from '@/sim/types';
import { bushModel, counterModel, rubbleModel, treeCanopy, treeTrunk } from '../../art/models';
import {
  ATLAS_GUTTER,
  OVERLAY_TILES,
  TILE_PX,
  TILE_VARIANTS,
  atlasCell,
  fenceTexture,
  wallTexture,
  type Atlas,
} from '../../art/textures';
import { patchWorld } from '../worldMaterial';

export const WALL_H = 1.6;
const SILL_H = 0.5;
const LINTEL_Y = 1.32;
const DOOR_LINTEL_Y = 1.42;
const FENCE_H = 1.05;

function tileHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Tall, solid things that wall in a floor (for contact shadows and wall colours). */
function isWallKind(k: TileKind | 'void'): boolean {
  return k === 'wall' || k === 'void' || k === 'window';
}

const INDOOR: ReadonlySet<TileKind> = new Set<TileKind>(['floor', 'tile', 'carpet', 'stairs']);
const SCATTER: ReadonlySet<TileKind> = new Set<TileKind>([
  'road',
  'concrete',
  'dirt',
  'grass',
  'carpet',
  'water',
  'rubble',
  'glass',
]);

export interface WorldMeshes {
  group: Group;
  /** Hide tree canopies between the camera and the player. */
  update(px: number, pz: number): void;
  dispose(): void;
}

/** A wall box with its sides in group 0 and its top in group 1 (no bottom), unit height. */
function wallBoxGeometry(): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const quad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    n: [number, number, number],
  ) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) nor.push(...n);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  const h = 0.5;
  // Sides (+X, -X, +Z, -Z), counter-clockwise seen from outside.
  quad([h, 0, h], [h, 0, -h], [h, 1, -h], [h, 1, h], [1, 0, 0]);
  quad([-h, 0, -h], [-h, 0, h], [-h, 1, h], [-h, 1, -h], [-1, 0, 0]);
  quad([-h, 0, h], [h, 0, h], [h, 1, h], [-h, 1, h], [0, 0, 1]);
  quad([h, 0, -h], [-h, 0, -h], [-h, 1, -h], [h, 1, -h], [0, 0, -1]);
  const sides = pos.length / 3;
  quad([-h, 1, h], [h, 1, h], [h, 1, -h], [-h, 1, -h], [0, 1, 0]);
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
  g.addGroup(0, sides, 0);
  g.addGroup(sides, 6, 1);
  g.computeBoundingSphere();
  return g;
}

export function buildWorld(zone: ZoneState, atlas: Texture, atlasInfo: Atlas): WorldMeshes {
  const group = new Group();
  group.name = 'world';
  const W = zone.w;
  const H = zone.h;
  const kindAt = (x: number, y: number): TileKind | 'void' =>
    x < 0 || y < 0 || x >= W || y >= H ? 'void' : (TILE_KINDS[zone.tiles[y * W + x]!] ?? 'void');
  const disposables: { dispose(): void }[] = [];

  /** Ground under an overlay tile: the most common plain ground among its neighbours. */
  const groundUnder = (x: number, y: number): TileKind => {
    const counts = new Map<TileKind, number>();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ] as const) {
      const k = kindAt(x + dx, y + dy);
      if (k === 'void' || OVERLAY_TILES.has(k) || isWallKind(k) || k === 'water') continue;
      counts.set(k, (counts.get(k) ?? 0) + (dx === 0 || dy === 0 ? 2 : 1));
    }
    let best: TileKind = 'floor';
    let n = 0;
    for (const [k, c] of counts) if (c > n) [best, n] = [k, c];
    return best;
  };

  // ---------------------------------------------------------------- floors
  const cellUv = (cell: number): [number, number, number, number] => {
    const { cols, cell: size } = atlasInfo;
    const cw = atlasInfo.canvas.width;
    const ch = atlasInfo.canvas.height;
    const cx = (cell % cols) * size + ATLAS_GUTTER;
    const cy = Math.floor(cell / cols) * size + ATLAS_GUTTER;
    // Half a texel inset so bilinear filtering never reaches the neighbouring cell.
    const u0 = (cx + 0.5) / cw;
    const u1 = (cx + TILE_PX - 0.5) / cw;
    const v0 = 1 - (cy + 0.5) / ch;
    const v1 = 1 - (cy + TILE_PX - 0.5) / ch;
    return [u0, v0, u1, v1];
  };
  // Contact shadow at a tile corner: darker the more wall tiles touch it.
  const cornerAo = (cx: number, cy: number): number => {
    let n = 0;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [-1, 0],
      [0, 0],
    ] as const)
      if (isWallKind(kindAt(cx + dx, cy + dy))) n++;
    return n === 0 ? 1 : n === 1 ? 0.72 : n === 2 ? 0.58 : 0.5;
  };
  const makeFloor = (overlay: boolean): BufferGeometry | null => {
    const pos: number[] = [];
    const uv: number[] = [];
    const col: number[] = [];
    const y0 = overlay ? 0.004 : 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const k = kindAt(x, y);
        if (k === 'void' || k === 'wall') continue;
        let kind: TileKind;
        if (overlay) {
          if (!OVERLAY_TILES.has(k) || k === 'door' || k === 'lockedDoor' || k === 'window') continue;
          if (k !== 'glass' && k !== 'rubble') continue;
          kind = k;
        } else kind = OVERLAY_TILES.has(k) ? groundUnder(x, y) : k;
        const hash = tileHash(x, y);
        const v = hash % TILE_VARIANTS;
        let [u0, v0, u1, v1] = cellUv(atlasCell(kind, v));
        // Mirror non-directional ground at random so the repeat doesn't show.
        if (SCATTER.has(kind)) {
          if (hash & 16) [u0, u1] = [u1, u0];
          if (hash & 32) [v0, v1] = [v1, v0];
        }
        const a = [x, y0, y];
        const b = [x + 1, y0, y];
        const c = [x + 1, y0, y + 1];
        const d = [x, y0, y + 1];
        pos.push(...a, ...d, ...c, ...a, ...c, ...b);
        uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
        const ao = [cornerAo(x, y), cornerAo(x, y + 1), cornerAo(x + 1, y + 1), cornerAo(x + 1, y)];
        for (const i of [0, 1, 2, 0, 2, 3]) {
          const s = ao[i]!;
          col.push(s, s, s);
        }
      }
    }
    if (!pos.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    const n = new Float32Array(pos.length);
    for (let i = 1; i < n.length; i += 3) n[i] = 1;
    g.setAttribute('normal', new BufferAttribute(n, 3));
    g.computeBoundingSphere();
    return g;
  };
  const floorMat = patchWorld(new MeshLambertMaterial({ map: atlas, vertexColors: true }));
  const floorGeom = makeFloor(false);
  if (floorGeom) {
    const floor = new Mesh(floorGeom, floorMat);
    floor.receiveShadow = true;
    floor.name = 'floor';
    group.add(floor);
    disposables.push(floorGeom);
  }
  const overlayMat = patchWorld(
    new MeshLambertMaterial({
      map: atlas,
      vertexColors: true,
      alphaTest: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const overlayGeom = makeFloor(true);
  if (overlayGeom) {
    const m = new Mesh(overlayGeom, overlayMat);
    m.receiveShadow = true;
    group.add(m);
    disposables.push(overlayGeom);
  }
  disposables.push(floorMat, overlayMat);

  // ---------------------------------------------------------------- walls, windows, lintels
  const wallTex = new CanvasTexture(wallTexture());
  wallTex.colorSpace = SRGBColorSpace;
  wallTex.wrapS = wallTex.wrapT = RepeatWrapping;
  const wallSide = patchWorld(new MeshLambertMaterial({ map: wallTex }), { cutaway: true });
  const wallTop = patchWorld(new MeshLambertMaterial({ color: '#45403a' }), { cutaway: true });
  disposables.push(wallTex, wallSide, wallTop);
  const boxes: { x: number; z: number; y: number; h: number; color: Color }[] = [];
  const panes: { x: number; z: number; alongX: boolean }[] = [];
  const interior = new Color('#9a9086');
  const exterior = new Color('#7d7a76');
  const brick = new Color('#86675a');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = kindAt(x, y);
      if (k !== 'wall' && k !== 'window' && k !== 'door' && k !== 'lockedDoor') continue;
      let inside = 0;
      let outside = 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const n = kindAt(x + dx, y + dy);
        if (n === 'void' || isWallKind(n)) continue;
        if (INDOOR.has(n)) inside++;
        else outside++;
      }
      const h = tileHash(x, y);
      const base = outside > 0 && inside === 0 ? (h % 3 === 0 ? brick : exterior) : interior;
      const color = base.clone().multiplyScalar(0.9 + ((h >>> 8) % 100) / 500);
      const cx = x + 0.5;
      const cz = y + 0.5;
      if (k === 'wall') boxes.push({ x: cx, z: cz, y: 0, h: WALL_H, color });
      else if (k === 'window') {
        boxes.push({ x: cx, z: cz, y: 0, h: SILL_H, color });
        boxes.push({ x: cx, z: cz, y: LINTEL_Y, h: WALL_H - LINTEL_Y, color });
        const alongX = isWallKind(kindAt(x - 1, y)) || isWallKind(kindAt(x + 1, y));
        panes.push({ x: cx, z: cz, alongX });
      } else {
        // Door tiles: the slab is a prop; the wall continues above it.
        boxes.push({ x: cx, z: cz, y: DOOR_LINTEL_Y, h: WALL_H - DOOR_LINTEL_Y, color });
      }
    }
  }
  if (boxes.length) {
    const geom = wallBoxGeometry();
    const walls = new InstancedMesh(geom, [wallSide, wallTop] as Material[], boxes.length);
    const m = new Matrix4();
    boxes.forEach((b, i) => {
      m.makeScale(1, b.h, 1);
      m.setPosition(b.x, b.y, b.z);
      walls.setMatrixAt(i, m);
      walls.setColorAt(i, b.color);
    });
    walls.castShadow = true;
    walls.receiveShadow = true;
    walls.name = 'walls';
    walls.computeBoundingSphere();
    group.add(walls);
    disposables.push(geom);
  }
  if (panes.length) {
    const glass = new MeshLambertMaterial({
      color: '#5d7a8a',
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: DoubleSide,
    });
    const geom = new PlaneGeometry(0.96, LINTEL_Y - SILL_H);
    const mesh = new InstancedMesh(geom, patchWorld(glass, { cutaway: true }), panes.length);
    const o = new Object3D();
    panes.forEach((p, i) => {
      o.position.set(p.x, SILL_H + (LINTEL_Y - SILL_H) / 2, p.z);
      o.rotation.set(0, p.alongX ? 0 : Math.PI / 2, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(geom, glass);
  }

  // ---------------------------------------------------------------- fences, counters, bushes, rubble, trees
  const fences: { x: number; z: number; alongX: boolean }[] = [];
  const counters: { x: number; z: number }[] = [];
  const bushes: { x: number; z: number; r: number }[] = [];
  const rubble: { x: number; z: number; r: number }[] = [];
  const trees: { x: number; z: number; r: number }[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = kindAt(x, y);
      const r = (tileHash(x, y) % 628) / 100;
      if (k === 'fence') {
        const horiz = (q: TileKind | 'void') => q === 'fence' || isWallKind(q);
        const alongX =
          horiz(kindAt(x - 1, y)) ||
          horiz(kindAt(x + 1, y)) ||
          !(horiz(kindAt(x, y - 1)) || horiz(kindAt(x, y + 1)));
        fences.push({ x: x + 0.5, z: y + 0.5, alongX });
      } else if (k === 'counter') counters.push({ x: x + 0.5, z: y + 0.5 });
      else if (k === 'bush') bushes.push({ x: x + 0.5, z: y + 0.5, r });
      else if (k === 'rubble') rubble.push({ x: x + 0.5, z: y + 0.5, r });
      else if (k === 'tree') trees.push({ x: x + 0.5, z: y + 0.5, r });
    }
  }
  const instanced = (
    geom: BufferGeometry,
    mat: Material,
    items: { x: number; z: number; r?: number; alongX?: boolean }[],
    opts: { shadow?: boolean; y?: number; scale?: (i: number) => number } = {},
  ): InstancedMesh | null => {
    if (!items.length) return null;
    const mesh = new InstancedMesh(geom, mat, items.length);
    const o = new Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, opts.y ?? 0, it.z);
      o.rotation.set(0, it.alongX === undefined ? (it.r ?? 0) : it.alongX ? 0 : Math.PI / 2, 0);
      const s = opts.scale?.(i) ?? 1;
      o.scale.set(s, s, s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.castShadow = !!opts.shadow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(geom);
    return mesh;
  };
  const propMat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  disposables.push(propMat);
  if (fences.length) {
    const tex = new CanvasTexture(fenceTexture());
    tex.colorSpace = SRGBColorSpace;
    tex.magFilter = NearestFilter;
    const mat = patchWorld(new MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: DoubleSide }));
    const panel = new PlaneGeometry(1, FENCE_H).translate(0, FENCE_H / 2, 0);
    instanced(panel, mat, fences, { shadow: true });
    instanced(counterModel().scale(0.06, FENCE_H * 1.1, 0.06), propMat, fences, {});
    disposables.push(tex, mat);
  }
  instanced(counterModel(), propMat, counters, { shadow: true });
  instanced(bushModel(), propMat, bushes, { shadow: true, scale: (i) => 0.85 + ((i * 37) % 30) / 100 });
  instanced(rubbleModel(7), propMat, rubble, {});
  instanced(treeTrunk(), propMat, trees, { shadow: true });
  const canopies = instanced(treeCanopy(), propMat, trees, {
    shadow: true,
    scale: (i) => 0.9 + ((i * 53) % 30) / 100,
  });

  // Canopies between the camera and the player shrink away (CPU side; a handful of trees per zone).
  const hidden = new Set<number>();
  const mtx = new Matrix4();
  const update = (px: number, pz: number) => {
    if (!canopies) return;
    let changed = false;
    trees.forEach((t, i) => {
      const dz = t.z - pz;
      const near = dz > -0.8 && dz < 6 && Math.abs(t.x - px) < 2.6 + dz * 0.25;
      if (near === hidden.has(i)) return;
      if (near) hidden.add(i);
      else hidden.delete(i);
      const s = near ? 0.001 : 0.9 + ((i * 53) % 30) / 100;
      mtx.makeRotationY(t.r);
      mtx.scale(new Vector3(s, s, s));
      mtx.setPosition(t.x, 0, t.z);
      canopies.setMatrixAt(i, mtx);
      changed = true;
    });
    if (changed) canopies.instanceMatrix.needsUpdate = true;
  };

  return {
    group,
    update,
    dispose() {
      for (const d of disposables) d.dispose();
      group.traverse((o) => {
        if (o instanceof InstancedMesh) o.dispose();
      });
    },
  };
}
