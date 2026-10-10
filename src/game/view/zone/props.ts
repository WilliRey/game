/**
 * Everything placed in a zone that isn't an actor: containers, stations, the ambulance, chained doors,
 * fuel caps, boards, lamps, exit markers, ground signs, doors and items lying around. Props of the same
 * model are instanced; containers dim once searched; doors swing open and closed.
 */
import type { Vector3 } from 'three';
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  type Material,
} from 'three';
import type { Content } from '@/content';
import type { GameState } from '@/core/types';
import type { ZoneRuntime } from '@/sim/runtime';
import { OUTDOOR_KINDS, TILE_KINDS } from '@/sim/tiles';
import type { ZoneState } from '@/sim/types';
import { geometry, overrideModel, texture } from '../../art/assets';
import { ITEM_COLORS, MODELS, TALL_FOOTPRINT, TEXTURES } from '../../art/manifest';
import { brokenDoorModel, doorModel, itemModel, propModel } from '../../art/models';
import { labelTexture, softDot } from '../../art/textures';
import { patchWorld } from '../worldMaterial';

export interface LightSource {
  x: number;
  y: number;
  z: number;
  color: number;
  radius: number;
  flicker: boolean;
  /** Fire barrels flicker harder and spawn flames. */
  fire?: boolean;
}

interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation override (radians); otherwise from the footprint and the walls around it. */
  rot?: number;
}

interface InstanceRef {
  mesh: InstancedMesh;
  index: number;
}

const tmp = new Object3D();
const DIM_EMPTY = new Color(0.42, 0.42, 0.42);
const DIM_LEFT = new Color(0.72, 0.72, 0.72);
const WHITE = new Color(1, 1, 1);

export class PropsLayer {
  readonly group = new Group();
  readonly lights: LightSource[] = [];
  private containers = new Map<string, InstanceRef>();
  private stations = new Map<string, InstanceRef & { kind: string }>();
  private objects = new Map<string, (InstanceRef | Object3D)[]>();
  private doors = new Map<
    string,
    { root: Group; slab: Mesh; broken: Mesh; angle: number; vertical: boolean }
  >();
  private items = new Map<string, Mesh>();
  private exitArrows: Mesh[] = [];
  private searchedKey = '';
  private t = 0;
  private propMat: Material;
  private doorMat: Material;
  private glowMat: MeshBasicMaterial;
  private disposables: { dispose(): void }[] = [];

  constructor(
    private content: Content,
    zone: ZoneState,
    rt: ZoneRuntime,
  ) {
    this.group.name = 'props';
    this.propMat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.doorMat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }), {
      cutaway: true,
    });
    this.glowMat = new MeshBasicMaterial({
      map: texture(TEXTURES.dot, softDot, false),
      color: 0xffd890,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.disposables.push(this.propMat, this.doorMat, this.glowMat);
    const layout = rt.layout;
    const kindAt = (x: number, y: number) =>
      x < 0 || y < 0 || x >= zone.w || y >= zone.h
        ? 'void'
        : (TILE_KINDS[zone.tiles[y * zone.w + x]!] ?? 'void');
    const blocked = (x: number, y: number) => {
      const k = kindAt(x, y);
      return k === 'wall' || k === 'void' || k === 'window';
    };
    /** Face single-tile props away from the wall they stand against (toward the camera by default). */
    const faceAway = (x: number, y: number): number => {
      if (blocked(x, y - 1)) return -Math.PI / 2;
      if (blocked(x, y + 1)) return Math.PI / 2;
      if (blocked(x - 1, y)) return 0;
      if (blocked(x + 1, y)) return Math.PI;
      return -Math.PI / 2;
    };

    // ---- instanced props by model key
    const batches = new Map<string, { place: Placement; register?: (ref: InstanceRef) => void }[]>();
    const add = (key: string, place: Placement, register?: (ref: InstanceRef) => void) => {
      let list = batches.get(key);
      if (!list) batches.set(key, (list = []));
      list.push({ place, register });
    };
    for (const c of Object.values(zone.containers)) {
      const rot = c.w === 1 && c.h === 1 ? faceAway(c.x, c.y) : undefined;
      add(MODELS.container(c.type), { x: c.x, y: c.y, w: c.w, h: c.h, rot }, (ref) =>
        this.containers.set(c.id, ref),
      );
    }
    for (const s of layout.stations) {
      const rot = s.w === 1 && s.h === 1 ? faceAway(s.x, s.y) : undefined;
      add(MODELS.station(s.kind), { x: s.x, y: s.y, w: s.w, h: s.h, rot }, (ref) =>
        this.stations.set(s.id, { ...ref, kind: s.kind }),
      );
      if (s.kind === 'campfire')
        this.lights.push({
          x: s.x + s.w / 2,
          y: 1.05,
          z: s.y + s.h / 2,
          color: 0xff8a30,
          radius: 6,
          flicker: true,
          fire: true,
        });
    }
    const objRef = (id: string) => (ref: InstanceRef) => {
      const list = this.objects.get(id) ?? [];
      list.push(ref);
      this.objects.set(id, list);
    };
    for (const o of layout.objects) {
      const place = { x: o.x, y: o.y, w: o.w, h: o.h };
      if (o.type === 'vehicle') add(MODELS.vehicle, place, objRef(o.id));
      else if (o.type === 'blocker') add(MODELS.blocker, place, objRef(o.id));
      else if (o.type === 'siphon') add(MODELS.siphon, { ...place, rot: faceAway(o.x, o.y) }, objRef(o.id));
      else if (o.type === 'interact') {
        const label = (o.label ?? '').toLowerCase();
        if (label.includes('ambulance')) add(MODELS.vehicle, place, objRef(o.id));
        else if (label.includes('board'))
          add(MODELS.board, { ...place, rot: faceAway(o.x, o.y) }, objRef(o.id));
        else add(MODELS.interact, place, objRef(o.id));
      } else if (o.type === 'label')
        this.addLabel(o.text ?? o.label ?? '', o.x + o.w / 2, o.y + o.h / 2, o.color);
    }
    for (const l of layout.lights) {
      const tx = Math.floor(l.x);
      const ty = Math.floor(l.y);
      const outdoor = OUTDOOR_KINDS.has(kindAt(tx, ty) as never);
      add(outdoor ? MODELS.lampPost : MODELS.lampHanging, { x: tx, y: ty, w: 1, h: 1, rot: 0 });
      const y = outdoor ? 2.15 : 1.15;
      this.lights.push({ x: l.x, y, z: l.y, color: l.color, radius: l.radius, flicker: l.flicker });
      const glow = new Mesh(new PlaneGeometry(1, 1), this.glowMat.clone());
      (glow.material as MeshBasicMaterial).color.setHex(l.color);
      glow.position.set(outdoor ? l.x + 0.45 : l.x, y - 0.02, l.y);
      glow.scale.setScalar(0.9);
      glow.rotation.x = -Math.PI / 2;
      this.group.add(glow);
      this.disposables.push(glow.geometry, glow.material as Material);
    }
    for (const [key, list] of batches) this.buildBatch(key, list);

    // ---- exits: a pulsing arrow on the ground and the destination written beside it
    const arrowShape = new Shape();
    arrowShape.moveTo(0, 0.45);
    arrowShape.lineTo(0.38, 0);
    arrowShape.lineTo(0.14, 0);
    arrowShape.lineTo(0.14, -0.4);
    arrowShape.lineTo(-0.14, -0.4);
    arrowShape.lineTo(-0.14, 0);
    arrowShape.lineTo(-0.38, 0);
    arrowShape.closePath();
    const arrowGeom = new ShapeGeometry(arrowShape);
    arrowGeom.rotateX(-Math.PI / 2);
    this.disposables.push(arrowGeom);
    for (const e of layout.exits) {
      const cx = e.x + e.w / 2;
      const cz = e.y + e.h / 2;
      const angle =
        e.x + e.w >= zone.w - 1
          ? 0
          : e.x <= 1
            ? Math.PI
            : e.y <= 1
              ? Math.PI / 2
              : e.y + e.h >= zone.h - 1
                ? -Math.PI / 2
                : Math.PI / 2;
      const mat = new MeshBasicMaterial({
        color: 0xe0b040,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        side: DoubleSide,
      });
      const arrow = new Mesh(arrowGeom, patchWorld(mat));
      arrow.position.set(cx, 0.02, cz);
      // Shape points up (+Y before rotateX → −Z after). Turn it to point out of the map.
      arrow.rotation.y = angle - Math.PI / 2;
      arrow.scale.setScalar(Math.min(2.2, 0.8 + Math.min(e.w, e.h) * 0.35));
      this.group.add(arrow);
      this.exitArrows.push(arrow);
      this.disposables.push(mat);
      const text = e.label ?? (e.toZone ? 'STAIRS' : 'EXIT');
      this.addLabel(text, cx - Math.cos(angle) * 1.3, cz - Math.sin(angle) * 1.3, '#e0b040', 0.5);
    }

    // ---- doors
    for (const d of Object.values(zone.doors)) {
      const ld = layout.doors.find((q) => q.id === d.id);
      const vertical = !!ld?.vertical;
      const root = new Group();
      root.position.set(d.x + 0.5, 0, d.y + 0.5);
      if (vertical) root.rotation.y = -Math.PI / 2;
      const slab = new Mesh(
        geometry(d.locked ? MODELS.doorLocked : MODELS.door, () => doorModel(d.locked)),
        this.doorMat,
      );
      slab.position.set(-0.5, 0, 0);
      slab.castShadow = true;
      slab.receiveShadow = true;
      const broken = new Mesh(geometry(MODELS.doorBroken, brokenDoorModel), this.propMat);
      broken.position.set(-0.5, 0, 0);
      root.add(slab, broken);
      this.group.add(root);
      const angle = d.open ? -Math.PI / 2 : 0;
      slab.rotation.y = angle;
      this.doors.set(d.id, { root, slab, broken, angle, vertical });
    }
  }

  private buildBatch(key: string, list: { place: Placement; register?: (ref: InstanceRef) => void }[]): void {
    const real = overrideModel(key);
    if (real) {
      for (const { place } of list) {
        const o = real.clone();
        this.placeObject(o, key, place);
        this.group.add(o);
      }
      return;
    }
    const geom = geometry(key, () => propModel(key));
    const mesh = new InstancedMesh(geom, this.propMat, list.length);
    mesh.name = key;
    list.forEach(({ place, register }, i) => {
      this.placeObject(tmp, key, place);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, WHITE);
      register?.({ mesh, index: i });
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }

  private placeObject(o: Object3D, key: string, p: Placement): void {
    const long = Math.max(p.w, p.h);
    const short = Math.min(p.w, p.h);
    o.position.set(p.x + p.w / 2, 0, p.y + p.h / 2);
    o.rotation.set(0, p.rot ?? (p.h > p.w ? -Math.PI / 2 : 0), 0);
    const ys = TALL_FOOTPRINT[key] ?? 1;
    o.scale.set(long, ys, short);
  }

  private addLabel(text: string, x: number, z: number, color = '#b8ad98', height = 0.62): void {
    if (!text) return;
    const { canvas: c, aspect } = labelTexture(text, color);
    const tex = texture(TEXTURES.label(`${text}|${color}`), () => c);
    const lines = text.split('\n').length;
    const mat = patchWorld(
      new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    const plane = new Mesh(new PlaneGeometry(height * lines * aspect, height * lines), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.015, z);
    this.group.add(plane);
    this.disposables.push(plane.geometry, mat);
  }

  update(zone: ZoneState, state: GameState, dt: number): void {
    this.t += dt;
    // Searched containers dim: empty ones more than ones you left things in.
    let key = '';
    for (const c of Object.values(zone.containers)) key += c.searched ? (c.items.length ? '2' : '1') : '0';
    if (key !== this.searchedKey) {
      this.searchedKey = key;
      const touched = new Set<InstancedMesh>();
      for (const c of Object.values(zone.containers)) {
        const ref = this.containers.get(c.id);
        if (!ref) continue;
        ref.mesh.setColorAt(ref.index, c.searched ? (c.items.length ? DIM_LEFT : DIM_EMPTY) : WHITE);
        touched.add(ref.mesh);
      }
      for (const m of touched) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // Hub stations that only exist once built; blockers that were cut away.
    for (const s of this.stations.values()) {
      const hide =
        zone.safe &&
        ((s.kind === 'rainCollector' && !state.base.rainCollector.built) ||
          (s.kind === 'reloading' && !state.base.reloadingBench));
      this.setHidden(s, hide);
    }
    for (const [id, refs] of this.objects) {
      const hide = !!zone.objects[id]?.removed;
      for (const r of refs) if (!(r instanceof Object3D)) this.setHidden(r, hide);
    }
    // Doors swing toward their state; broken doors lie in pieces.
    for (const d of Object.values(zone.doors)) {
      const v = this.doors.get(d.id);
      if (!v) continue;
      v.slab.visible = !d.broken;
      v.broken.visible = d.broken;
      const target = d.open ? -Math.PI / 2 : 0;
      v.angle += (target - v.angle) * Math.min(1, dt * 10);
      v.slab.rotation.y = v.angle;
    }
    // Items lying around: add new, drop taken, bob gently.
    const seen = new Set<string>();
    for (const it of zone.items) {
      seen.add(it.uid);
      let m = this.items.get(it.uid);
      if (!m) {
        const cat = this.content.items[it.stack.itemId]?.category ?? 'junk';
        const g = geometry(MODELS.item(cat), () => itemModel(ITEM_COLORS[cat] ?? '#6a6a5a'));
        m = new Mesh(g, this.propMat);
        m.castShadow = true;
        const glow = new Mesh(new PlaneGeometry(0.9, 0.9), this.glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.y = -0.05;
        m.add(glow);
        this.group.add(m);
        this.items.set(it.uid, m);
      }
      m.position.set(it.x, 0.06 + Math.sin(this.t * 3 + it.x) * 0.025, it.y);
      m.rotation.y = this.t * 0.6 + it.x;
    }
    for (const [uid, m] of this.items) {
      if (seen.has(uid)) continue;
      this.group.remove(m);
      (m.children[0] as Mesh | undefined)?.geometry.dispose();
      this.items.delete(uid);
    }
    for (const a of this.exitArrows) {
      (a.material as MeshBasicMaterial).opacity = 0.45 + Math.sin(this.t * 3.2) * 0.25;
    }
  }

  private hidden = new Set<string>();
  private setHidden(ref: InstanceRef, hide: boolean): void {
    const k = `${ref.mesh.uuid}:${ref.index}`;
    if (hide === this.hidden.has(k)) return;
    ref.mesh.getMatrixAt(ref.index, tmp.matrix);
    tmp.matrix.decompose(tmp.position, tmp.quaternion, tmp.scale);
    if (hide) {
      this.hidden.add(k);
      this.savedScales.set(k, tmp.scale.clone());
      tmp.scale.setScalar(0.0001);
    } else {
      this.hidden.delete(k);
      const s = this.savedScales.get(k);
      if (s) tmp.scale.copy(s);
    }
    tmp.updateMatrix();
    ref.mesh.setMatrixAt(ref.index, tmp.matrix);
    ref.mesh.instanceMatrix.needsUpdate = true;
  }
  private savedScales = new Map<string, Vector3>();

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.group.traverse((o) => {
      if (o instanceof InstancedMesh) o.dispose();
    });
  }
}
