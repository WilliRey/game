/**
 * Combat feel and world effects in 3D: blood, glass and scorch decals (capped by the sim), bullet tracers,
 * muzzle flashes, melee impacts (blood spray, sparks, a hit star), explosions, flashbangs, thrown objects
 * in flight, molotov fires, gas and smoke clouds, fused pipe bombs and beeping decoys. Effects that light
 * things up hand transient lights to the light pool.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  type Material,
} from 'three';
import type { Content } from '@/content';
import { isVisible } from '@/sim/fov';
import type { ZoneRuntime } from '@/sim/runtime';
import type { Decal, Hazard, ZoneState } from '@/sim/types';
import { geometry, texture } from '../../art/assets';
import { MODELS, TEXTURES } from '../../art/manifest';
import { weaponModel } from '../../art/models';
import { decalTexture, muzzleTexture, softDot, type DecalKind } from '../../art/textures';
import { patchWorld } from '../worldMaterial';
import { Particles } from './particles';

export interface FlashLight {
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  radius: number;
  ttl: number;
  life: number;
}

const DECAL_KINDS: DecalKind[] = ['blood0', 'blood1', 'blood2', 'blood3', 'glass', 'scorch', 'pool'];
const DECAL_CAP = 160;
const tmp = new Object3D();
const GUN_Y = 0.78;

function decalKindOf(d: Decal): DecalKind {
  if (d.kind === 'glass') return 'glass';
  if (d.kind === 'scorch') return 'scorch';
  if (d.kind === 'gore') return 'pool';
  return `blood${Math.floor(d.rot * 10) % 4}` as DecalKind;
}

interface HazardView {
  root: Group;
  ring?: Mesh;
  blink?: Mesh;
  ringT: number;
}

export class FxLayer {
  readonly group = new Group();
  readonly glow: Particles;
  readonly soft: Particles;
  readonly lights: FlashLight[] = [];
  private decals = new Map<DecalKind, InstancedMesh>();
  private decalKey = '';
  private tracerGeom = new BufferGeometry();
  private tracerPos = new Float32Array(64 * 6 * 3);
  private tracerCol = new Float32Array(64 * 6 * 3);
  private muzzles: { mesh: Mesh; ttl: number }[] = [];
  private stars: { mesh: Mesh; ttl: number; life: number }[] = [];
  private thrown = new Map<string, Mesh>();
  private hazards = new Map<string, HazardView>();
  private scoutRings: Mesh[] = [];
  private ping: Mesh | null = null;
  private pingT = 1;
  private scoutWas = 0;
  private t = 0;
  private mats: Material[] = [];
  private muzzleMat: MeshBasicMaterial;
  private starMat: MeshBasicMaterial;
  private itemMat: Material;

  constructor(
    private content: Content,
    zone: ZoneState,
  ) {
    this.group.name = 'fx';
    const dot = texture(TEXTURES.dot, softDot, false);
    this.glow = new Particles(dot, true);
    this.soft = new Particles(dot, false);
    this.group.add(this.glow.points, this.soft.points);

    for (const k of DECAL_KINDS) {
      const mat = patchWorld(
        new MeshLambertMaterial({
          map: texture(TEXTURES.decal(k), () => decalTexture(k)),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      const g = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const m = new InstancedMesh(g, mat, DECAL_CAP);
      m.count = 0;
      m.receiveShadow = true;
      m.renderOrder = 1;
      m.frustumCulled = false;
      this.decals.set(k, m);
      this.group.add(m);
      this.mats.push(mat);
    }

    this.tracerGeom.setAttribute('position', new BufferAttribute(this.tracerPos, 3));
    this.tracerGeom.setAttribute('color', new BufferAttribute(this.tracerCol, 3));
    const tracerMat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    const tracers = new Mesh(this.tracerGeom, tracerMat);
    tracers.frustumCulled = false;
    tracers.renderOrder = 5;
    this.group.add(tracers);
    this.mats.push(tracerMat);

    this.muzzleMat = new MeshBasicMaterial({
      map: texture(TEXTURES.muzzle, muzzleTexture, false),
      color: 0xffd6a0,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.starMat = new MeshBasicMaterial({
      map: dot,
      color: 0xfff2d0,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.itemMat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mats.push(this.muzzleMat, this.starMat, this.itemMat);
    this.syncDecals(zone);
  }

  // ---------------------------------------------------------------- events

  muzzle(x: number, y: number, angle: number, small: boolean): void {
    const m = new Mesh(
      new PlaneGeometry(0.7, 0.35).translate(0.3, 0, 0).rotateX(-Math.PI / 2),
      this.muzzleMat,
    );
    m.position.set(x, GUN_Y, y);
    m.rotation.y = -angle;
    m.scale.setScalar(small ? 0.5 : 1);
    this.group.add(m);
    this.muzzles.push({ mesh: m, ttl: 0.06 });
    this.addLight(
      x + Math.cos(angle) * 0.3,
      GUN_Y,
      y + Math.sin(angle) * 0.3,
      0xffc070,
      small ? 2.5 : 6,
      5,
      0.07,
    );
    for (let i = 0; i < (small ? 2 : 5); i++)
      this.glow.emit({
        x: x + Math.cos(angle) * 0.3,
        y: GUN_Y,
        z: y + Math.sin(angle) * 0.3,
        vx: Math.cos(angle + (Math.random() - 0.5) * 0.6) * (3 + Math.random() * 3),
        vy: Math.random() * 1.5,
        vz: Math.sin(angle + (Math.random() - 0.5) * 0.6) * (3 + Math.random() * 3),
        life: 0.12 + Math.random() * 0.08,
        size: 0.09,
        size1: 0.02,
        r: 1,
        g: 0.8,
        b: 0.45,
        drag: 4,
      });
  }

  /** A bullet hitting a wall. */
  spark(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.emit({
        x,
        y: GUN_Y,
        z: y,
        vx: Math.cos(a) * (1.5 + Math.random() * 3),
        vy: 1 + Math.random() * 2.5,
        vz: Math.sin(a) * (1.5 + Math.random() * 3),
        life: 0.25 + Math.random() * 0.2,
        size: 0.07,
        size1: 0.02,
        r: 1,
        g: 0.85,
        b: 0.5,
        gravity: 9,
        drag: 1.5,
      });
    }
    this.soft.emit({
      x,
      y: GUN_Y,
      z: y,
      vy: 0.4,
      life: 0.6,
      size: 0.25,
      size1: 0.6,
      r: 0.5,
      g: 0.48,
      b: 0.45,
      alpha: 0.35,
    });
  }

  /** A melee swing connected: blood spray along the swing, sparks off metal, a white hit star. */
  meleeHit(x: number, y: number, angle: number, heavy: boolean, metal: boolean): void {
    const n = heavy ? 26 : 16;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * 1.3;
      const sp = 1.5 + Math.random() * (heavy ? 4.5 : 3);
      this.soft.emit({
        x,
        y: 0.75 + Math.random() * 0.25,
        z: y,
        vx: Math.cos(a) * sp,
        vy: 0.5 + Math.random() * 2.2,
        vz: Math.sin(a) * sp,
        life: 0.45 + Math.random() * 0.35,
        size: 0.09 + Math.random() * 0.08,
        size1: 0.05,
        r: 0.42,
        g: 0.03,
        b: 0.04,
        alpha: 0.95,
        gravity: 9.5,
        drag: 1.2,
      });
    }
    if (metal)
      for (let i = 0; i < 8; i++) {
        const a = angle + Math.PI + (Math.random() - 0.5) * 2.2;
        this.glow.emit({
          x,
          y: 0.85,
          z: y,
          vx: Math.cos(a) * (2 + Math.random() * 3),
          vy: 1 + Math.random() * 2,
          vz: Math.sin(a) * (2 + Math.random() * 3),
          life: 0.18 + Math.random() * 0.12,
          size: 0.06,
          size1: 0.015,
          r: 1,
          g: 0.85,
          b: 0.55,
          gravity: 8,
        });
      }
    const star = new Mesh(new PlaneGeometry(1, 1), this.starMat);
    star.position.set(x - Math.cos(angle) * 0.15, 0.85, y - Math.sin(angle) * 0.15);
    star.rotation.x = -Math.PI / 2;
    this.group.add(star);
    this.stars.push({ mesh: star, ttl: 0.12, life: 0.12 });
  }

  /** Any damage to a zombie (bullets included): a small burst of blood. */
  blood(x: number, y: number, amount: number): void {
    const n = Math.min(12, 3 + Math.round(amount / 6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.soft.emit({
        x,
        y: 0.7 + Math.random() * 0.3,
        z: y,
        vx: Math.cos(a) * (0.5 + Math.random() * 1.5),
        vy: 0.5 + Math.random() * 1.5,
        vz: Math.sin(a) * (0.5 + Math.random() * 1.5),
        life: 0.4 + Math.random() * 0.3,
        size: 0.08,
        size1: 0.04,
        r: 0.4,
        g: 0.03,
        b: 0.04,
        alpha: 0.9,
        gravity: 9,
      });
    }
  }

  explosion(x: number, y: number, radius: number): void {
    this.addLight(x, 1.2, y, 0xffa040, 14, radius * 3.5, 0.45);
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * radius * 2.4;
      this.glow.emit({
        x,
        y: 0.3,
        z: y,
        vx: Math.cos(a) * sp,
        vy: 1 + Math.random() * 4,
        vz: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.4,
        size: 0.5 + Math.random() * 0.6,
        size1: 1.2,
        r: 1,
        g: 0.55 + Math.random() * 0.3,
        b: 0.2,
        drag: 3,
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      this.soft.emit({
        x: x + Math.cos(a) * Math.random() * radius * 0.6,
        y: 0.4,
        z: y + Math.sin(a) * Math.random() * radius * 0.6,
        vx: Math.cos(a) * 0.8,
        vy: 0.8 + Math.random(),
        vz: Math.sin(a) * 0.8,
        life: 1.4 + Math.random() * 1.2,
        size: 0.8,
        size1: 2.4,
        r: 0.18,
        g: 0.17,
        b: 0.16,
        alpha: 0.6,
        drag: 1,
      });
    }
  }

  flashbang(x: number, y: number, radius: number): void {
    this.addLight(x, 1.0, y, 0xf4f8ff, 22, radius * 3, 0.3);
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      this.glow.emit({
        x,
        y: 0.4,
        z: y,
        vx: Math.cos(a) * radius * 2,
        vy: Math.random() * 2,
        vz: Math.sin(a) * radius * 2,
        life: 0.25,
        size: 0.8,
        size1: 1.6,
        r: 1,
        g: 1,
        b: 1,
        drag: 6,
      });
    }
    const star = new Mesh(new PlaneGeometry(1, 1), this.starMat);
    star.position.set(x, 0.6, y);
    star.rotation.x = -Math.PI / 2;
    star.scale.setScalar(radius * 2);
    this.group.add(star);
    this.stars.push({ mesh: star, ttl: 0.3, life: 0.3 });
  }

  private addLight(
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    radius: number,
    ttl: number,
  ) {
    this.lights.push({ x, y, z, color, intensity, radius, ttl, life: ttl });
  }

  // ---------------------------------------------------------------- per frame

  update(zone: ZoneState, rt: ZoneRuntime, dt: number, camScale: number, dark = 0): void {
    this.soft.setLight(1 - dark * 0.62);
    this.t += dt;
    this.glow.setScale(camScale);
    this.soft.setScale(camScale);
    this.syncDecals(zone);
    this.updateTracers(zone);

    for (const m of this.muzzles) m.ttl -= dt;
    for (const m of this.muzzles.filter((q) => q.ttl <= 0)) {
      this.group.remove(m.mesh);
      m.mesh.geometry.dispose();
    }
    this.muzzles = this.muzzles.filter((q) => q.ttl > 0);
    for (const s of this.stars) {
      s.ttl -= dt;
      const k = Math.max(0, s.ttl / s.life);
      s.mesh.scale.setScalar(Math.max(s.mesh.scale.x, 0.3) * (1 + dt * 6));
      (s.mesh.material as MeshBasicMaterial).opacity = k;
    }
    for (const s of this.stars.filter((q) => q.ttl <= 0)) {
      this.group.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.stars = this.stars.filter((q) => q.ttl > 0);
    for (const l of this.lights) l.ttl -= dt;
    for (let i = this.lights.length - 1; i >= 0; i--) if (this.lights[i]!.ttl <= 0) this.lights.splice(i, 1);

    this.updateThrown(zone, dt);
    this.updateHazards(zone, rt, dt);
    this.updateScout(zone, dt);
    this.glow.update(dt);
    this.soft.update(dt);
  }

  private syncDecals(zone: ZoneState): void {
    const last = zone.decals[zone.decals.length - 1];
    const key = `${zone.decals.length}:${last ? `${last.x},${last.y}` : ''}`;
    if (key === this.decalKey) return;
    this.decalKey = key;
    const counts = new Map<DecalKind, number>();
    for (const d of zone.decals) {
      const kind = decalKindOf(d);
      const m = this.decals.get(kind)!;
      const i = counts.get(kind) ?? 0;
      if (i >= DECAL_CAP) continue;
      counts.set(kind, i + 1);
      const s =
        d.kind === 'gore'
          ? Math.max(0.9, d.scale * 0.9)
          : d.kind === 'scorch'
            ? Math.max(0.8, d.scale * 1.6)
            : d.scale * 0.9;
      tmp.position.set(d.x, kind === 'pool' ? 0.008 : 0.012, d.y);
      tmp.rotation.set(0, d.rot, 0);
      tmp.scale.set(s, 1, s);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    for (const [kind, m] of this.decals) {
      m.count = counts.get(kind) ?? 0;
      m.instanceMatrix.needsUpdate = true;
    }
  }

  private updateTracers(zone: ZoneState): void {
    const n = Math.min(64, zone.tracers.length);
    for (let i = 0; i < n; i++) {
      const tr = zone.tracers[i]!;
      const dx = tr.x2 - tr.x1;
      const dz = tr.y2 - tr.y1;
      const len = Math.hypot(dx, dz) || 1;
      const w = 0.025;
      const nx = (-dz / len) * w;
      const nz = (dx / len) * w;
      const v = [
        [tr.x1 + nx, tr.y1 + nz],
        [tr.x1 - nx, tr.y1 - nz],
        [tr.x2 - nx, tr.y2 - nz],
        [tr.x1 + nx, tr.y1 + nz],
        [tr.x2 - nx, tr.y2 - nz],
        [tr.x2 + nx, tr.y2 + nz],
      ];
      const k = Math.min(1, tr.ttl * 16);
      v.forEach(([x, z], j) => {
        const o = (i * 6 + j) * 3;
        this.tracerPos[o] = x!;
        this.tracerPos[o + 1] = GUN_Y;
        this.tracerPos[o + 2] = z!;
        // Hot at the muzzle end, fading toward the far end.
        const f = j === 2 || j === 4 || j === 5 ? 0.35 : 1;
        this.tracerCol[o] = k * f;
        this.tracerCol[o + 1] = 0.88 * k * f;
        this.tracerCol[o + 2] = 0.62 * k * f;
      });
    }
    this.tracerGeom.setDrawRange(0, n * 6);
    this.tracerGeom.attributes.position!.needsUpdate = true;
    this.tracerGeom.attributes.color!.needsUpdate = true;
  }

  private updateThrown(zone: ZoneState, dt: number): void {
    const seen = new Set<string>();
    for (const t of zone.thrown) {
      seen.add(t.id);
      let m = this.thrown.get(t.id);
      if (!m) {
        const g = geometry(MODELS.weapon(t.itemId), () => weaponModel(t.itemId, 'throwable'));
        m = new Mesh(g, this.itemMat);
        m.castShadow = true;
        this.group.add(m);
        this.thrown.set(t.id, m);
      }
      const k = Math.min(1, t.t / t.duration);
      const arc = Math.sin(k * Math.PI) * (0.6 + t.duration * 1.2);
      const x = t.x0 + (t.x1 - t.x0) * k;
      const z = t.y0 + (t.y1 - t.y0) * k;
      m.position.set(x, 0.9 * (1 - k) + 0.08 + arc, z);
      m.rotation.set(this.t * 11, 0, this.t * 7);
      if (t.itemId === 'molotov') {
        this.glow.emit({
          x,
          y: m.position.y + 0.1,
          z,
          vy: 0.5,
          life: 0.25,
          size: 0.18,
          size1: 0.05,
          r: 1,
          g: 0.6,
          b: 0.2,
        });
        this.addLight(x, m.position.y, z, 0xff8a30, 2.5, 3.5, dt * 1.5);
      }
    }
    for (const [id, m] of this.thrown) {
      if (seen.has(id)) continue;
      this.group.remove(m);
      this.thrown.delete(id);
    }
  }

  private updateHazards(zone: ZoneState, rt: ZoneRuntime, dt: number): void {
    const seen = new Set<string>();
    for (const h of zone.hazards) {
      seen.add(h.id);
      let v = this.hazards.get(h.id);
      if (!v) {
        v = this.makeHazard(h);
        this.hazards.set(h.id, v);
      }
      const vis = isVisible(rt, h.x, h.y);
      const fade = Math.min(1, h.ttl / 1.2);
      if (h.kind === 'fire') {
        // Fire is a light source: you see it burn even from the dark.
        const n = Math.ceil(dt * 70 * h.radius);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * h.radius * 0.9;
          this.glow.emit({
            x: h.x + Math.cos(a) * r,
            y: 0.05,
            z: h.y + Math.sin(a) * r,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 1.2 + Math.random() * 1.6,
            vz: (Math.random() - 0.5) * 0.3,
            life: 0.35 + Math.random() * 0.35,
            size: 0.35 + Math.random() * 0.25,
            size1: 0.08,
            r: 1,
            g: 0.45 + Math.random() * 0.25,
            b: 0.12,
            alpha: fade,
          });
        }
        if (Math.random() < dt * 8)
          this.soft.emit({
            x: h.x + (Math.random() - 0.5) * h.radius,
            y: 0.9,
            z: h.y + (Math.random() - 0.5) * h.radius,
            vy: 0.9,
            life: 1.6,
            size: 0.5,
            size1: 1.6,
            r: 0.12,
            g: 0.11,
            b: 0.1,
            alpha: 0.45 * fade,
          });
        this.addLight(
          h.x,
          0.9,
          h.y,
          0xff7a20,
          (4 + Math.sin(this.t * 17) * 0.8) * fade,
          h.radius + 4,
          dt * 1.5,
        );
      } else if (h.kind === 'gas' || h.kind === 'smoke') {
        const smoke = h.kind === 'smoke';
        const rate = smoke ? 34 : 14;
        if (vis || smoke) {
          const n = Math.ceil(dt * rate * h.radius);
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * h.radius;
            this.soft.emit({
              x: h.x + Math.cos(a) * r,
              y: 0.2 + Math.random() * (smoke ? 1.4 : 0.6),
              z: h.y + Math.sin(a) * r,
              vx: (Math.random() - 0.5) * 0.3,
              vy: smoke ? 0.15 : 0.05,
              vz: (Math.random() - 0.5) * 0.3,
              life: smoke ? 2.2 : 1.6,
              size: smoke ? 1.4 : 0.8,
              size1: smoke ? 2.8 : 1.4,
              r: smoke ? 0.46 : 0.4,
              g: smoke ? 0.47 : 0.52,
              b: smoke ? 0.46 : 0.2,
              alpha: (smoke ? 0.34 : 0.32) * fade,
            });
          }
        }
      } else if (h.kind === 'fuse' || h.kind === 'decoy') {
        const blinkOn = h.kind === 'fuse' ? Math.sin(this.t * 14) > 0 : (h.pulseIn ?? 0) > 0.55;
        if (v.blink) v.blink.visible = blinkOn;
        if (h.kind === 'decoy' && v.ring) {
          v.ringT += dt;
          if (h.pulseIn > 0.75 && v.ringT > 0.3) v.ringT = 0;
          const k = Math.min(1, v.ringT / 0.7);
          v.ring.scale.setScalar(0.3 + k * 4);
          (v.ring.material as MeshBasicMaterial).opacity = (1 - k) * 0.6;
          if (blinkOn) this.addLight(h.x, 0.25, h.y, 0xff3020, 1.2, 2.5, dt * 1.5);
        }
        v.root.visible = vis;
      }
    }
    for (const [id, v] of this.hazards) {
      if (seen.has(id)) continue;
      this.group.remove(v.root);
      this.hazards.delete(id);
    }
  }

  private makeHazard(h: Hazard): HazardView {
    const root = new Group();
    root.position.set(h.x, 0, h.y);
    this.group.add(root);
    const v: HazardView = { root, ringT: 1 };
    if (h.kind === 'fuse' || h.kind === 'decoy') {
      const itemId = h.itemId ?? (h.kind === 'fuse' ? 'pipe_bomb' : 'noisemaker');
      const m = new Mesh(
        geometry(MODELS.weapon(itemId), () => weaponModel(itemId, 'throwable')),
        this.itemMat,
      );
      m.position.y = 0.05;
      m.rotation.set(0, Math.random() * 6, Math.PI / 2);
      root.add(m);
      const blink = new Mesh(
        new PlaneGeometry(0.4, 0.4).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({
          color: 0xff3020,
          map: this.starMat.map,
          transparent: true,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      blink.position.y = 0.2;
      root.add(blink);
      v.blink = blink;
      if (h.kind === 'decoy') {
        const ring = new Mesh(
          new RingGeometry(0.45, 0.5, 32).rotateX(-Math.PI / 2),
          new MeshBasicMaterial({
            color: 0xffd080,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
          }),
        );
        ring.position.y = 0.03;
        root.add(ring);
        v.ring = ring;
      }
    }
    return v;
  }

  /**
   * The Scavenger's scouting sense: a sonar ping sweeping out from Sam when it fires, then a small pulsing
   * ring on every unsearched container and every zombie in range, seen through walls.
   */
  private updateScout(zone: ZoneState, dt: number): void {
    const p = zone.player;
    const R = 20;
    if (p.scout > this.scoutWas + 0.5) this.pingT = 0;
    this.scoutWas = p.scout;
    const want: { x: number; z: number; r: number; color: number }[] = [];
    if (p.scout > 0) {
      for (const c of Object.values(zone.containers)) {
        if (c.searched) continue;
        const cx = c.x + c.w / 2;
        const cz = c.y + c.h / 2;
        if (Math.hypot(cx - p.x, cz - p.y) <= R) want.push({ x: cx, z: cz, r: 0.5, color: 0xe0b040 });
      }
      for (const z of zone.zombies)
        if (z.hp > 0 && Math.hypot(z.x - p.x, z.y - p.y) <= R)
          want.push({ x: z.x, z: z.y, r: 0.45, color: 0xff4030 });
    }
    const ring = (inner = 0.8): Mesh => {
      const m = new Mesh(
        new RingGeometry(inner, 1, inner > 0.9 ? 96 : 32).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: AdditiveBlending,
        }),
      );
      m.renderOrder = 9;
      this.group.add(m);
      return m;
    };
    while (this.scoutRings.length < want.length) this.scoutRings.push(ring());
    this.ping ??= ring(0.975);
    this.pingT += dt;
    const pk = Math.min(1, this.pingT / 0.9);
    this.ping.visible = pk < 1;
    this.ping.position.set(p.x, 0.05, p.y);
    this.ping.scale.setScalar(0.5 + pk * R);
    const pm = this.ping.material as MeshBasicMaterial;
    pm.color.setHex(0xe0b040);
    pm.opacity = (1 - pk) * 0.5;
    const fade = Math.min(1, p.scout / 1.2);
    this.scoutRings.forEach((m, i) => {
      const w = want[i];
      // Each marker lights up as the ping passes over it.
      const reached = w ? pk >= 1 || Math.hypot(w.x - p.x, w.z - p.y) <= 0.5 + pk * R : false;
      m.visible = !!w && reached;
      if (!w || !reached) return;
      m.position.set(w.x, 0.05, w.z);
      m.scale.setScalar(w.r * (1 + Math.sin(this.t * 5 + i) * 0.12));
      const mat = m.material as MeshBasicMaterial;
      mat.color.setHex(w.color);
      mat.opacity = 0.8 * fade;
    });
  }

  dispose(): void {
    for (const m of this.ping ? [...this.scoutRings, this.ping] : this.scoutRings) {
      m.geometry.dispose();
      (m.material as Material).dispose();
    }
    this.glow.dispose();
    this.soft.dispose();
    for (const m of this.mats) m.dispose();
    for (const m of this.decals.values()) {
      m.geometry.dispose();
      m.dispose();
    }
    this.tracerGeom.dispose();
  }

  /** For tests/debug: how many particles are alive. */
  get particleCount(): number {
    return this.glow.count + this.soft.count;
  }

  /** Content kept for item-specific effects. */
  get items(): Content['items'] {
    return this.content.items;
  }
}

export const WHITE = new Color(1, 1, 1);
