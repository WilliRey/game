/**
 * Zombies, instanced: one InstancedMesh per body part per zombie type, so fifty zombies cost the same few
 * draw calls as one. Each zombie is posed on a shared mesh-less rig — shambling walk, reaching arms, a
 * readable wind-up before every swing (arms raised, a red flush), the slam, a flinch when hit, wobbling
 * while staggered — and its part matrices are copied into the instances. Zombies outside the player's line
 * of sight are not drawn. Killed zombies fall and stay down as corpses for as long as their gore decal.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  RingGeometry,
  type Material,
} from 'three';
import type { Content } from '@/content';
import { isVisible } from '@/sim/fov';
import type { ZoneRuntime } from '@/sim/runtime';
import type { Decal, Zombie, ZoneState } from '@/sim/types';
import { zombieReach } from '@/sim/zombies';
import { geometry } from '../../art/assets';
import { MODELS, ZOMBIE_TYPES } from '../../art/manifest';
import { RIG_PARTS, ZOMBIE_COLORS, characterParts, type BodyStyle, type RigPart } from '../../art/models';
import { patchWorld } from '../worldMaterial';
import { Rig, easeOut, turnToward } from './rig';

interface ZAnim {
  phase: number;
  x: number;
  y: number;
  yaw: number;
  lastDamaged: number;
  flinch: number;
  windWas: number;
  windTotal: number;
  slam: number;
  seen: number;
}

interface Corpse {
  decal: Decal;
  type: string;
  fall: number;
  yaw: number;
  x: number;
  z: number;
  /** Seed for the sprawl of the limbs. */
  seed: number;
}

interface TypeBatch {
  rig: Rig;
  meshes: Record<RigPart, InstancedMesh>;
  capacity: number;
  count: number;
}

const FLASH = new Color(3, 3, 3);
const WHITE = new Color(1, 1, 1);
const tint = new Color();

/** Body style per zombie type (unknown types look like walkers). */
function styleOf(type: string): BodyStyle {
  return (ZOMBIE_TYPES.includes(type) ? type : 'walker') as BodyStyle;
}

export class ZombieLayer {
  readonly group = new Group();
  private batches = new Map<string, TypeBatch>();
  private anim = new Map<string, ZAnim>();
  private corpses: Corpse[] = [];
  private known = new WeakSet<Decal>();
  /** Recent kills (from enemy:killed) so a new gore decal knows what died and which way it faced. */
  private kills: { type: string; x: number; y: number; yaw: number; t: number }[] = [];
  private mat: Material;
  /** Red arcs on the ground in front of zombies winding up a swing: the telegraph. */
  private tells: InstancedMesh;
  private t = 0;
  /** Debug: draw zombies even when the player can't see them. */
  showAll = false;

  constructor(
    private content: Content,
    zone: ZoneState,
  ) {
    this.group.name = 'zombies';
    this.mat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    // The wind-up tell: a fan on the ground out to the zombie's reach, faint near the body and brightest at
    // the edge, so "step back past the line" reads at a glance.
    const arc = (100 * Math.PI) / 180;
    const tellGeom = new RingGeometry(0.3, 1, 18, 5, -arc / 2, arc).rotateX(-Math.PI / 2);
    const pos = tellGeom.getAttribute('position');
    const shade = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      const v = 0.08 + 0.92 * Math.pow(Math.max(0, (r - 0.3) / 0.7), 3);
      shade.fill(v, i * 3, i * 3 + 3);
    }
    tellGeom.setAttribute('color', new BufferAttribute(shade, 3));
    this.tells = new InstancedMesh(
      tellGeom,
      new MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      24,
    );
    this.tells.setColorAt(0, WHITE);
    this.tells.count = 0;
    this.tells.frustumCulled = false;
    this.tells.renderOrder = 2;
    this.group.add(this.tells);
    // Corpses already lying in a remembered zone don't fall again.
    for (const d of zone.decals) {
      if (d.kind !== 'gore') continue;
      this.known.add(d);
      this.corpses.push(this.corpseFor(d, true));
    }
  }

  /** The sim removed a zombie it killed this frame: remember its last pose for the corpse. */
  onKilled(enemyId: string, type: string): void {
    const a = this.anim.get(enemyId);
    if (a) this.kills.push({ type, x: a.x, y: a.y, yaw: a.yaw, t: this.t });
    this.anim.delete(enemyId);
  }

  private corpseFor(d: Decal, settled: boolean): Corpse {
    let type = d.scale > 1.8 ? 'bloater_boss' : d.scale > 1.2 ? 'bloater' : 'walker';
    let yaw = -(d.rot + Math.PI);
    const k = this.kills.findIndex((q) => Math.hypot(q.x - d.x, q.y - d.y) < 0.6);
    if (k >= 0) {
      type = this.kills[k]!.type;
      yaw = this.kills[k]!.yaw;
      this.kills.splice(k, 1);
    }
    return { decal: d, type, fall: settled ? 1 : 0, yaw, x: d.x, z: d.y, seed: (d.x * 13.7 + d.y * 7.1) % 1 };
  }

  private batch(type: string): TypeBatch {
    const b = this.batches.get(type);
    if (b && b.count < b.capacity) return b;
    const capacity = b ? b.capacity * 2 : 32;
    const style = styleOf(type);
    const rig = b?.rig ?? new Rig(style);
    const geoms = {} as Record<RigPart, ReturnType<typeof geometry>>;
    let built: ReturnType<typeof characterParts> | null = null;
    for (const p of RIG_PARTS)
      geoms[p] = geometry(`${MODELS.body(style)}.${p}`, () => {
        built ??= characterParts(MODELS.body(style), style, ZOMBIE_COLORS[style] ?? ZOMBIE_COLORS.walker!);
        return built[p];
      });
    const meshes = {} as Record<RigPart, InstancedMesh>;
    for (const p of RIG_PARTS) {
      const m = new InstancedMesh(geoms[p], this.mat, capacity);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.setColorAt(0, WHITE); // create the colour attribute up front (no shader recompile later)
      m.count = 0;
      m.name = `${type}.${p}`;
      if (b) {
        // Growing: copy what's already been written this frame.
        const old = b.meshes[p];
        for (let i = 0; i < b.count; i++) {
          old.getMatrixAt(i, M);
          m.setMatrixAt(i, M);
          if (old.instanceColor) {
            old.getColorAt(i, tint);
            m.setColorAt(i, tint);
          }
        }
        this.group.remove(old);
        old.dispose();
      }
      meshes[p] = m;
      this.group.add(m);
    }
    const nb: TypeBatch = { rig, meshes, capacity, count: b?.count ?? 0 };
    this.batches.set(type, nb);
    return nb;
  }

  update(zone: ZoneState, rt: ZoneRuntime, dt: number): void {
    this.t += dt;
    for (const b of this.batches.values()) b.count = 0;
    this.kills = this.kills.filter((k) => this.t - k.t < 2);
    let tells = 0;

    for (const z of zone.zombies) {
      if (z.hp <= 0) continue;
      let a = this.anim.get(z.id);
      if (!a) {
        a = {
          phase: Math.random() * 6,
          x: z.x,
          y: z.y,
          yaw: -z.facing,
          lastDamaged: z.damagedAt,
          flinch: 0,
          windWas: 0,
          windTotal: 0.45,
          slam: 0,
          seen: 0,
        };
        this.anim.set(z.id, a);
      }
      this.animate(z, a, dt);
      if (!this.showAll && !isVisible(rt, z.x, z.y)) continue;
      const b = this.batch(z.type);
      this.pose(b.rig, z, a);
      this.write(b, z.hitFlash > 0 ? FLASH : this.windTint(z, a));
      if (z.windup > 0 && z.stagger <= 0 && tells < this.tells.instanceMatrix.count) {
        const k = 1 - z.windup / Math.max(a.windTotal, 0.01);
        const def = this.content.enemies[z.type];
        TELL.position.set(z.x, 0.03, z.y);
        TELL.rotation.set(0, a.yaw, 0);
        TELL.scale.setScalar(def ? zombieReach(def) + 0.15 : 1.2);
        TELL.updateMatrix();
        this.tells.setMatrixAt(tells, TELL.matrix);
        this.tells.setColorAt(tells, tint.setRGB(0.75, 0.07, 0.03).multiplyScalar(0.25 + 0.55 * k * k));
        tells++;
      }
    }
    this.tells.count = tells;
    this.tells.instanceMatrix.needsUpdate = true;
    if (this.tells.instanceColor) this.tells.instanceColor.needsUpdate = true;
    // Forget zombies that left (killed ones were handled by onKilled).
    if (this.anim.size > zone.zombies.length + 8) {
      const live = new Set(zone.zombies.map((z) => z.id));
      for (const id of this.anim.keys()) if (!live.has(id)) this.anim.delete(id);
    }

    // Corpses follow the gore decals (the decal cap removes the oldest).
    const live = new Set(zone.decals);
    this.corpses = this.corpses.filter((c) => live.has(c.decal));
    for (const d of zone.decals) {
      if (d.kind !== 'gore' || this.known.has(d)) continue;
      this.known.add(d);
      this.corpses.push(this.corpseFor(d, false));
    }
    for (const c of this.corpses) {
      c.fall = Math.min(1, c.fall + dt * 2.4);
      const b = this.batch(c.type);
      this.poseCorpse(b.rig, c);
      this.write(b, WHITE);
    }

    for (const b of this.batches.values()) {
      for (const p of RIG_PARTS) {
        const m = b.meshes[p];
        m.count = b.count;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    }
  }

  private windTint(z: Zombie, a: ZAnim): Color {
    if (z.windup <= 0 || z.stagger > 0) return WHITE;
    const k = 1 - z.windup / Math.max(a.windTotal, 0.01);
    return tint.setRGB(1 + 1.4 * k, 1 - 0.35 * k, 1 - 0.45 * k);
  }

  private animate(z: Zombie, a: ZAnim, dt: number): void {
    const moved = Math.hypot(z.x - a.x, z.y - a.y);
    a.x = z.x;
    a.y = z.y;
    a.phase += moved * (z.type === 'runner' ? 3.0 : 4.2) + dt * 0.4;
    a.yaw = turnToward(a.yaw, -z.facing, dt * 10);
    if (z.damagedAt !== a.lastDamaged) {
      a.lastDamaged = z.damagedAt;
      a.flinch = 0.28;
    }
    a.flinch = Math.max(0, a.flinch - dt);
    if (z.windup > 0 && a.windWas <= 0) a.windTotal = z.windup;
    if (a.windWas > 0 && z.windup <= 0 && z.stagger <= 0 && z.mode === 'attack') a.slam = 0.22;
    a.windWas = z.windup;
    a.slam = Math.max(0, a.slam - dt);
    a.seen += dt;
  }

  private pose(r: Rig, z: Zombie, a: ZAnim): void {
    r.neutral();
    r.root.position.set(z.x, 0, z.y);
    r.root.rotation.set(0, a.yaw, 0);
    const fat = z.type === 'bloater' || z.type === 'bloater_boss';
    const runner = z.type === 'runner';
    const hunting = z.mode === 'chase' || z.mode === 'attack';
    const s = Math.sin(a.phase);
    const c = Math.cos(a.phase);
    const stride = runner && hunting ? 0.8 : fat ? 0.3 : 0.45;
    r.legL.rotation.z = s * stride;
    r.legR.rotation.z = -s * stride;
    r.body.position.y = Math.abs(c) * (runner ? 0.05 : 0.03);
    r.body.rotation.x = s * (fat ? 0.05 : 0.09);
    let lean = runner ? (hunting ? 0.62 : 0.4) : fat ? 0.12 : 0.32;
    // Reaching arms, swaying out of step.
    let armL = runner && hunting ? 0.6 + s * 0.6 : 1.2 + Math.sin(a.phase * 0.5 + 1) * 0.12;
    let armR = runner && hunting ? 0.6 - s * 0.6 : 1.3 + Math.sin(a.phase * 0.5) * 0.12;
    let spread = 0.12;
    let headTilt = 0.25 + Math.sin(this.t * 1.3 + z.x) * 0.1;
    if (z.mode === 'idle' || z.mode === 'wander') {
      armL = 0.35 + Math.sin(this.t * 0.9 + z.y) * 0.1;
      armR = 0.3;
      lean = fat ? 0.08 : 0.2;
    }
    // Telegraphed wind-up: arms rise overhead, the body rears back.
    if (z.windup > 0 && z.stagger <= 0) {
      const k = 1 - z.windup / Math.max(a.windTotal, 0.01);
      armL = 1.2 + k * 1.5;
      armR = 1.3 + k * 1.5;
      lean -= 0.4 * k;
      headTilt = -0.2 * k;
      spread = 0.12 + 0.25 * k;
    }
    // The slam: arms come down hard, a lunge forward.
    if (a.slam > 0) {
      const k = a.slam / 0.22;
      armL = 0.7 + 1.9 * k * k;
      armR = 0.8 + 1.9 * k * k;
      lean += 0.45 * (1 - k);
      r.body.position.x = 0.14 * Math.sin((1 - k) * Math.PI);
    }
    // Hit: snap back and fling the arms.
    if (a.flinch > 0) {
      const k = a.flinch / 0.28;
      lean -= 0.55 * k;
      headTilt -= 0.5 * k;
      armL = armL * (1 - k) + 0.3 * k;
      armR = armR * (1 - k) + 0.5 * k;
      spread += 0.6 * k;
      r.body.position.x -= 0.08 * k;
    }
    // Staggered: wobbling, arms dangling.
    if (z.stagger > 0) {
      r.body.rotation.x = Math.sin(this.t * 13 + z.x) * 0.28;
      armL = 0.2;
      armR = 0.25;
      lean = 0.1 + Math.sin(this.t * 9) * 0.15;
    }
    r.torso.rotation.z = -lean;
    r.head.rotation.z = headTilt;
    r.armL.rotation.z = armL;
    r.armR.rotation.z = armR;
    r.armL.rotation.x = spread;
    r.armR.rotation.x = -spread;
    if (fat) r.torso.scale.setScalar(1 + Math.sin(this.t * 2 + z.x) * 0.03);
    else r.torso.scale.setScalar(1);
    r.root.updateMatrixWorld(true);
  }

  /** Falling over backward (away from the killing blow), then sprawled on the ground. */
  private poseCorpse(r: Rig, c: Corpse): void {
    r.neutral();
    r.torso.scale.setScalar(1);
    const k = easeOut(c.fall * c.fall);
    r.root.position.set(c.x, 0, c.z);
    r.root.rotation.set(0, c.yaw, 0);
    r.body.rotation.z = (Math.PI / 2) * k;
    r.body.position.set(-0.05 * k, 0.09 * k, 0);
    r.armL.rotation.z = 1.2 * k + 0.4 * c.seed;
    r.armR.rotation.z = 0.6 * k + 1.2 * (1 - c.seed);
    r.armL.rotation.x = 0.9 * k;
    r.armR.rotation.x = -0.7 * k;
    r.legL.rotation.x = 0.25 * k;
    r.legR.rotation.x = -0.15 * k;
    r.head.rotation.x = (c.seed - 0.5) * 0.8 * k;
    r.root.updateMatrixWorld(true);
  }

  private write(b: TypeBatch, color: Color): void {
    if (b.count >= b.capacity) {
      // `batch()` grows the meshes when they're full; re-fetch.
      const type = [...this.batches.entries()].find(([, v]) => v === b)?.[0];
      if (!type) return;
      b = this.batch(type);
    }
    const i = b.count++;
    for (const p of RIG_PARTS) {
      b.meshes[p].setMatrixAt(i, b.rig.parts[p].matrixWorld);
      b.meshes[p].setColorAt(i, color);
    }
  }

  dispose(): void {
    for (const b of this.batches.values()) for (const p of RIG_PARTS) b.meshes[p].dispose();
    this.mat.dispose();
    this.tells.geometry.dispose();
    (this.tells.material as Material).dispose();
    this.tells.dispose();
  }

  /** Content is kept for future per-type tweaks (enemy radius scale). */
  get enemies(): Content['enemies'] {
    return this.content.enemies;
  }
}

const M = new Matrix4();
const TELL = new Object3D();
