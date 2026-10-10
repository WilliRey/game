/**
 * A humanoid rig: a small Object3D hierarchy (root → body → legs, torso → head, shoulders → arms → hands)
 * posed procedurally every frame. The player and NPCs carry real meshes on it; zombies use a mesh-less
 * rig per type whose part matrices are copied into instanced meshes.
 *
 * Local axes: +X is forward (the facing direction), +Y up, +Z the character's right.
 */
import { Group, Mesh, type BufferGeometry, type Material } from 'three';
import { BODY, RIG_PARTS, type BodyDims, type BodyStyle, type RigPart } from '../../art/models';

export class Rig {
  readonly root = new Group();
  readonly body = new Group();
  readonly legL = new Group();
  readonly legR = new Group();
  readonly torso = new Group();
  readonly head = new Group();
  readonly shoulderL = new Group();
  readonly shoulderR = new Group();
  readonly armL = new Group();
  readonly armR = new Group();
  readonly handL = new Group();
  readonly handR = new Group();
  readonly d: BodyDims;
  readonly parts: Record<RigPart, Group>;

  constructor(
    readonly style: BodyStyle,
    geoms?: Record<RigPart, BufferGeometry>,
    material?: Material,
  ) {
    const d = (this.d = BODY[style]);
    this.root.add(this.body);
    this.body.scale.setScalar(d.scale);
    this.legL.position.set(0, d.hip, -d.hipSpread);
    this.legR.position.set(0, d.hip, d.hipSpread);
    this.torso.position.set(0, d.hip - 0.02, 0);
    this.body.add(this.legL, this.legR, this.torso);
    this.head.position.set(0.01, d.torsoH + 0.015, 0);
    this.shoulderL.position.set(0, d.torsoH - 0.06, -d.shoulder);
    this.shoulderR.position.set(0, d.torsoH - 0.06, d.shoulder);
    this.torso.add(this.head, this.shoulderL, this.shoulderR);
    this.shoulderL.add(this.armL);
    this.shoulderR.add(this.armR);
    this.handL.position.set(0, -d.armLen - 0.02, 0);
    this.handR.position.set(0, -d.armLen - 0.02, 0);
    this.armL.add(this.handL);
    this.armR.add(this.handR);
    this.parts = {
      torso: this.torso,
      head: this.head,
      armL: this.armL,
      armR: this.armR,
      legL: this.legL,
      legR: this.legR,
    };
    if (geoms && material) {
      for (const p of RIG_PARTS) {
        const m = new Mesh(geoms[p], material);
        m.castShadow = true;
        m.receiveShadow = true;
        m.name = p;
        this.parts[p].add(m);
      }
    }
  }

  /** Reset every joint to the neutral standing pose. */
  neutral(): void {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    for (const g of [
      this.legL,
      this.legR,
      this.torso,
      this.head,
      this.shoulderL,
      this.shoulderR,
      this.armL,
      this.armR,
      this.handL,
      this.handR,
    ])
      g.rotation.set(0, 0, 0);
  }
}

export function easeOut(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return 1 - (1 - k) * (1 - k);
}

export function easeInOut(t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return k * k * (3 - 2 * k);
}

export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Turn `from` toward `to` by at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = wrapAngle(to - from);
  return from + Math.max(-maxStep, Math.min(maxStep, d));
}
