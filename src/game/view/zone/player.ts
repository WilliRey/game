/**
 * Sam in 3D: a low-poly rig with the active weapon in hand and a flashlight in the other, posed every frame
 * from the sim (walk, sprint, crouch, aim, reload, search, throw, shove, hurt, death). Melee swings animate
 * through wind-up, a fast follow-through and recovery, with a slash trail along the weapon's arc
 * (BRIEF_V2 §2); misses swing just the same.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Vector3,
} from 'three';
import type { GameContext } from '@/core/store';
import { activeWeapon } from '@/systems/inventory';
import { classOf } from '@/systems/classes';
import type { ZoneState } from '@/sim/types';
import { geometry } from '../../art/assets';
import { MODELS } from '../../art/manifest';
import { bodyParts, flashlightModel, weaponModel, weaponReach, type BodyColors } from '../../art/models';
import { patchWorld } from '../worldMaterial';
import { Rig, easeInOut, easeOut, turnToward } from './rig';

/** Jacket colours by class: you can tell who Sam was at a glance. */
const CLASS_COLORS: Record<string, BodyColors> = {
  mechanic: {
    skin: '#a98466',
    top: '#3a4a63',
    topDark: '#2c3a50',
    legs: '#2c3036',
    shoes: '#241e18',
    hair: '#2a221c',
  },
  paramedic: {
    skin: '#a98466',
    top: '#2f5040',
    topDark: '#22392e',
    legs: '#2a2e33',
    shoes: '#1e1c19',
    hair: '#2a221c',
  },
  excop: {
    skin: '#a98466',
    top: '#262c38',
    topDark: '#1b2029',
    legs: '#23262c',
    shoes: '#141414',
    hair: '#2a221c',
  },
  scavenger: {
    skin: '#a98466',
    top: '#5a4a33',
    topDark: '#433625',
    legs: '#33363b',
    shoes: '#241e18',
    hair: '#2a221c',
  },
};

const HEAVY = new Set(['fire_axe']);
const TRAIL_LIFE = 0.22;
const TRAIL_MAX = 40;

type SwingStage = 'windup' | 'sweep' | 'recover';

/** Where a melee action is: winding up, sweeping through (fast), or recovering; k is 0..1 within it. */
function swingStage(
  phase: 'windup' | 'recovery',
  t: number,
  windup: number,
  recovery: number,
): { stage: SwingStage; k: number } {
  if (phase === 'windup') return { stage: 'windup', k: Math.min(1, t / Math.max(windup, 1e-3)) };
  const sweepT = Math.min(0.2, recovery * 0.45);
  if (t < sweepT) return { stage: 'sweep', k: t / sweepT };
  return { stage: 'recover', k: Math.min(1, (t - sweepT) / Math.max(recovery - sweepT, 1e-3)) };
}

/** A ribbon that follows the weapon's tip through the fast part of a swing. */
class SlashTrail {
  readonly mesh: Mesh;
  private pts: { tip: Vector3; base: Vector3; age: number }[] = [];
  private pos = new Float32Array(TRAIL_MAX * 2 * 3);
  private col = new Float32Array(TRAIL_MAX * 2 * 3);
  private geom = new BufferGeometry();
  tint = { r: 1, g: 0.93, b: 0.8 };

  constructor() {
    this.geom.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geom.setAttribute('color', new BufferAttribute(this.col, 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_MAX - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geom.setIndex(idx);
    this.mesh = new Mesh(
      this.geom,
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  push(tip: Vector3, base: Vector3, age = 0): void {
    this.pts.push({ tip: tip.clone(), base: base.clone(), age });
    if (this.pts.length > TRAIL_MAX) this.pts.shift();
  }

  update(dt: number): void {
    for (const p of this.pts) p.age += dt;
    this.pts = this.pts.filter((p) => p.age < TRAIL_LIFE);
    const n = this.pts.length;
    for (let i = 0; i < TRAIL_MAX; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      const o = i * 6;
      if (!p) {
        this.pos.fill(0, o, o + 6);
        continue;
      }
      this.pos[o] = p.tip.x;
      this.pos[o + 1] = p.tip.y;
      this.pos[o + 2] = p.tip.z;
      this.pos[o + 3] = p.base.x;
      this.pos[o + 4] = p.base.y;
      this.pos[o + 5] = p.base.z;
      const f = i < n ? Math.max(0, 1 - p.age / TRAIL_LIFE) * (0.35 + (0.65 * (i + 1)) / Math.max(1, n)) : 0;
      this.col[o] = this.tint.r * f;
      this.col[o + 1] = this.tint.g * f;
      this.col[o + 2] = this.tint.b * f;
      this.col[o + 3] = this.tint.r * f * 0.15;
      this.col[o + 4] = this.tint.g * f * 0.15;
      this.col[o + 5] = this.tint.b * f * 0.15;
    }
    this.geom.attributes.position!.needsUpdate = true;
    this.geom.attributes.color!.needsUpdate = true;
    this.geom.setDrawRange(0, Math.max(0, n - 1) * 6);
    this.mesh.visible = n > 1;
  }

  reset(): void {
    this.pts = [];
  }
}

export class PlayerView {
  readonly group = new Group();
  readonly rig: Rig;
  readonly trail = new SlashTrail();
  private mat: MeshLambertMaterial;
  private grip = new Group();
  private weapon: Mesh | null = null;
  private weaponId: string | null = '∅';
  private torch: Mesh;
  private classId = '';
  private phase = 0;
  private yaw = 0;
  private lastX = 0;
  private lastY = 0;
  private swingIndex = 0;
  private lastAction: object | null = null;
  private throwT = 0;
  private shoveT = 0;
  private lastShove = 0;
  private thrownSeen = new Set<string>();
  private deathT = 0;
  private hurtT = 0;
  /** Flashlight lens in world space (the spotlight sits here). */
  readonly lens = new Vector3();
  readonly lensDir = new Vector3(1, 0, 0);
  private tip = new Vector3();
  private base = new Vector3();

  constructor() {
    this.mat = patchWorld(new MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.rig = new Rig('survivor');
    this.group.add(this.rig.root, this.trail.mesh);
    this.rig.handR.add(this.grip);
    this.torch = new Mesh(geometry(MODELS.flashlight, flashlightModel), this.mat);
    this.torch.castShadow = true;
    this.rig.handL.add(this.torch);
  }

  private setBody(classId: string): void {
    if (classId === this.classId) return;
    this.classId = classId;
    for (const p of Object.values(this.rig.parts))
      for (const c of [...p.children]) if (c instanceof Mesh) p.remove(c);
    const parts = bodyParts('survivor', CLASS_COLORS[classId] ?? CLASS_COLORS.mechanic!);
    for (const [name, g] of Object.entries(parts)) {
      const m = new Mesh(g, this.mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.rig.parts[name as keyof typeof parts].add(m);
    }
  }

  private setWeapon(itemId: string | null, kind: 'melee' | 'firearm' | 'throwable' | null): void {
    if (itemId === this.weaponId) return;
    this.weaponId = itemId;
    if (this.weapon) this.grip.remove(this.weapon);
    this.weapon = null;
    if (!itemId || !kind) return;
    this.weapon = new Mesh(
      geometry(MODELS.weapon(itemId), () => weaponModel(itemId, kind)),
      this.mat,
    );
    this.weapon.castShadow = true;
    this.grip.add(this.weapon);
  }

  /** Called when a melee swing connects: the trail flashes blood-red. */
  onHit(): void {
    this.trail.tint = { r: 1, g: 0.45, b: 0.35 };
  }

  update(ctx: GameContext, zone: ZoneState, dt: number, safe: boolean): void {
    const p = zone.player;
    const pl = ctx.state.player;
    const r = this.rig;
    this.setBody(classOf(ctx).id);
    const w = activeWeapon(ctx);
    const def = w ? ctx.content.items[w.itemId] : undefined;
    const kind = def?.weapon?.kind ?? null;
    // In the hub weapons stay holstered (brief); fists show no weapon.
    this.setWeapon(safe ? null : (w?.itemId ?? null), safe ? null : kind);
    r.neutral();

    // Position, facing, and the walk cycle from distance moved.
    const moved = Math.hypot(p.x - this.lastX, p.y - this.lastY);
    this.lastX = p.x;
    this.lastY = p.y;
    r.root.position.set(p.x, 0, p.y);
    this.yaw = turnToward(this.yaw, -p.facing, dt * 18);
    r.root.rotation.y = this.yaw;
    const speed = moved / Math.max(dt, 1e-4);
    if (moved > 0.0005) this.phase += moved * (p.sprinting ? 3.2 : 3.8);
    const walk = Math.min(1, speed / 3);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    r.legL.rotation.z = s * 0.55 * walk;
    r.legR.rotation.z = -s * 0.55 * walk;
    r.body.position.y = Math.abs(c) * 0.035 * walk;
    let lean = p.sprinting ? 0.22 : 0.05 * walk;
    r.armL.rotation.z = -s * 0.35 * walk;
    r.armR.rotation.z = s * 0.35 * walk;
    if (p.crouched) {
      r.body.position.y -= 0.12;
      r.legL.rotation.z += 0.5;
      r.legR.rotation.z += 0.5;
      r.torso.position.x = -0.05;
      lean += 0.3;
    } else r.torso.position.x = 0;

    // Off hand: the flashlight, raised when it's on.
    const torchOn = pl.flashlightOn;
    this.torch.visible = torchOn;
    if (torchOn) {
      r.armL.rotation.z = 0.95;
      r.armL.rotation.x = 0.15;
      r.handL.rotation.z = -0.95;
    }

    // Weapon hand.
    this.grip.rotation.set(0, 0, 0);
    let sweep: { from: number; to: number } | null = null;
    const a = p.action;
    if (a?.kind === 'melee') {
      if (a !== this.lastAction) {
        this.lastAction = a;
        this.swingIndex++;
        this.lastStage = null;
        this.lastK = 0;
        this.trail.tint = { r: 1, g: 0.93, b: 0.8 };
      }
      const cur = swingStage(a.phase, a.t, a.windup, a.recovery);
      // The sweep is fast (a fifth of a second): at low frame rates a whole arc can fall between two frames,
      // so the trail is sampled along the arc rather than once per frame.
      if (cur.stage === 'sweep') sweep = { from: this.lastStage === 'sweep' ? this.lastK : 0, to: cur.k };
      else if (cur.stage === 'recover' && this.lastStage !== 'recover' && this.lastStage !== null)
        sweep = { from: this.lastStage === 'sweep' ? this.lastK : 0, to: 1 };
      this.lastStage = cur.stage;
      this.lastK = cur.k;
      this.swingNow = cur;
      this.applySwing(cur.stage, cur.k);
    } else {
      this.swingNow = null;
      this.lastAction = a;
      if (kind === 'firearm' && !safe) {
        const raise = p.aiming ? 1.5 : 1.3;
        r.armR.rotation.z = raise;
        r.armR.rotation.x = -0.12;
        this.grip.rotation.z = -raise;
        if (!torchOn) {
          r.armL.rotation.z = raise - 0.1;
          r.armL.rotation.x = 0.55;
        }
        if (a?.kind === 'reload') {
          const k = Math.sin((a.t / a.duration) * Math.PI);
          r.armL.rotation.z = 0.6 + k * 0.4;
          r.armL.rotation.x = 0.7;
          r.armR.rotation.z = 0.9;
          this.grip.rotation.z = -0.9 + k * 0.3;
        }
      } else if (kind === 'melee' && !safe) {
        r.armR.rotation.z = 0.45 + s * 0.15 * walk;
        this.grip.rotation.z = 0.35;
      } else if (kind === 'throwable' && !safe) {
        r.armR.rotation.z = 0.35;
        this.grip.rotation.z = 0.2;
      }
      if (a?.kind === 'timed') {
        // Searching, picking a lock, siphoning: kneel and work with both hands.
        r.body.position.y -= 0.14;
        r.legL.rotation.z = 0.9;
        r.legR.rotation.z = 0.2;
        lean += 0.45;
        const k = Math.sin(performance.now() / 90) * 0.15;
        r.armR.rotation.z = 1.0 + k;
        r.armL.rotation.z = 1.0 - k;
        r.armL.rotation.x = 0.3;
      }
    }

    // Throws and shoves are detected from the sim (a new thrown object; the shove cooldown restarting).
    for (const t of zone.thrown)
      if (!this.thrownSeen.has(t.id)) {
        this.thrownSeen.add(t.id);
        if (t.t < 0.1) this.throwT = 0.32;
      }
    if (this.thrownSeen.size > 64) this.thrownSeen.clear();
    if (p.shoveCooldown > this.lastShove + 0.3) this.shoveT = 0.25;
    this.lastShove = p.shoveCooldown;
    if (this.throwT > 0) {
      this.throwT -= dt;
      const k = 1 - this.throwT / 0.32;
      r.armR.rotation.z = 2.8 - k * 2.2;
      this.grip.rotation.z = 0.3;
    }
    if (this.shoveT > 0) {
      this.shoveT -= dt;
      const k = Math.sin((1 - this.shoveT / 0.25) * Math.PI);
      r.armL.rotation.z = 1.45 * k + 0.1;
      r.armR.rotation.z = Math.max(r.armR.rotation.z, 1.45 * k);
      r.body.position.x = 0.1 * k;
      lean += 0.2 * k;
    }

    // Hurt: a flinch and a red flash.
    if (p.hurtFlash > 0.2 && this.hurtT <= 0) this.hurtT = 0.22;
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hurtT > 0) lean -= 0.3 * (this.hurtT / 0.22);
    this.mat.emissive.setRGB(p.hurtFlash > 0 ? 0.55 * Math.min(1, p.hurtFlash * 4) : 0, 0, 0);

    r.torso.rotation.z = -lean;
    r.head.rotation.z = lean * 0.6;

    // Death: fall back and stay down.
    if (pl.dead) {
      this.deathT = Math.min(1, this.deathT + dt * 2.2);
      const k = easeOut(this.deathT);
      r.body.rotation.z = (Math.PI / 2) * k;
      r.body.position.y = 0.1 * k;
      r.armL.rotation.x = 1.2 * k;
      r.armR.rotation.x = -1.2 * k;
    } else this.deathT = 0;

    r.root.updateMatrixWorld(true);
    // Flashlight lens and direction (world space) for the spotlight.
    this.torch.localToWorld(this.lens.set(0.16, 0, 0));
    this.lensDir.set(Math.cos(p.facing), -0.08, Math.sin(p.facing)).normalize();

    if (sweep && sweep.to > sweep.from && this.swingNow) {
      const n = Math.max(2, Math.ceil((sweep.to - sweep.from) * 12));
      for (let j = 1; j <= n; j++) {
        this.applySwing('sweep', sweep.from + ((sweep.to - sweep.from) * j) / n);
        r.torso.updateMatrixWorld(true);
        // Earlier samples along the arc are older, so the trail fades from its tail.
        this.sampleTip(-(j / n) * dt);
      }
      // Back to this frame's pose.
      this.applySwing(this.swingNow.stage, this.swingNow.k);
      r.torso.updateMatrixWorld(true);
    }
    this.trail.update(dt);
  }

  private lastStage: SwingStage | null = null;
  private lastK = 0;
  private swingNow: { stage: SwingStage; k: number } | null = null;

  /** Record the weapon's arc (or the fist's) for the slash trail. */
  private sampleTip(age: number): void {
    if (this.weapon) {
      const reach = weaponReach(this.weaponId);
      this.weapon.localToWorld(this.tip.set(reach, 0, 0));
      this.weapon.localToWorld(this.base.set(reach * 0.42, 0, 0));
    } else {
      this.rig.handR.localToWorld(this.tip.set(0.08, -0.02, 0));
      this.rig.handR.localToWorld(this.base.set(0, 0.1, 0));
    }
    this.trail.push(this.tip, this.base, age);
  }

  /**
   * Pose the weapon arm for a melee swing: wind-up (cocked back), a fast sweep across the front (the strike
   * lands as it starts, when the sim's wind-up ends), then recovery. Alternate swings come back the other
   * way; heavy weapons chop overhead.
   */
  private applySwing(stage: SwingStage, k0: number): void {
    const r = this.rig;
    const heavy = HEAVY.has(this.weaponId ?? '');
    const side = this.swingIndex % 2 === 0 || heavy ? 1 : -1;
    const along = -Math.PI / 2; // the weapon extends the arm
    const carry = 0.35;
    if (heavy) {
      if (stage === 'windup') {
        const k = easeInOut(k0);
        r.armR.rotation.z = 0.45 + k * 2.45;
        r.shoulderR.rotation.y = -0.2 * k;
        r.torso.rotation.z = 0.15 * k;
        this.grip.rotation.z = carry + (along - carry) * Math.sqrt(k);
      } else if (stage === 'sweep') {
        const k = easeOut(k0);
        r.armR.rotation.z = 2.9 - k * 2.5;
        r.shoulderR.rotation.y = -0.2 + 0.2 * k;
        r.torso.rotation.z = -0.35 * k;
        this.grip.rotation.z = along;
      } else {
        const k = easeInOut(k0);
        r.armR.rotation.z = 0.4 + 0.05 * k;
        r.torso.rotation.z = -0.35 * (1 - k);
        this.grip.rotation.z = along + (carry - along) * k;
      }
      return;
    }
    const cocked = -1.6 * side;
    const through = 1.25 * side;
    if (stage === 'windup') {
      const k = easeInOut(k0);
      r.shoulderR.rotation.y = cocked * k;
      r.armR.rotation.z = 0.45 + 0.85 * k;
      r.torso.rotation.y = -0.4 * side * k;
      this.grip.rotation.z = carry + (along - carry) * Math.sqrt(k);
    } else if (stage === 'sweep') {
      const k = easeOut(k0);
      r.shoulderR.rotation.y = cocked + (through - cocked) * k;
      r.armR.rotation.z = 1.3;
      r.torso.rotation.y = -0.4 * side + 0.85 * side * k;
      this.grip.rotation.z = along;
    } else {
      const k = easeInOut(k0);
      r.shoulderR.rotation.y = through * (1 - k);
      r.armR.rotation.z = 1.3 - 0.85 * k;
      r.torso.rotation.y = 0.45 * side * (1 - k);
      this.grip.rotation.z = along + (carry - along) * k;
    }
  }

  dispose(): void {
    this.mat.dispose();
    (this.trail.mesh.material as MeshBasicMaterial).dispose();
    this.trail.mesh.geometry.dispose();
  }
}
