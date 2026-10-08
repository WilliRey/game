/**
 * The camera rig (BRIEF_V2 §1): a perspective camera pitched about 56° down, following the player with a
 * look-ahead toward the cursor (further when aiming), screen shake, a small nudge on melee hits, and
 * scripted pans. Also turns the mouse into an aim point by raycasting onto a plane at torso height.
 */
import { MathUtils, PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { VIEW_H, VIEW_W } from '../../constants';

const PITCH = MathUtils.degToRad(56);
const DIST = 21;
const FOV = 34;
/** Aim plane height: about where a zombie's chest is, so clicking a body aims at that body. */
const AIM_Y = 0.55;

export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, VIEW_W / VIEW_H, 1, 140);
  /** Smoothed point the camera looks at (world). */
  readonly target = new Vector3();
  private shakeT = 0;
  private shakeDur = 1;
  private shakeAmp = 0;
  private nudge = new Vector2();
  private ray = new Raycaster();
  private plane = new Plane(new Vector3(0, 1, 0), -AIM_Y);
  private hit = new Vector3();
  private v = new Vector3();
  /** Visible half extents on the ground around the target (tiles), for clamping and look-ahead. */
  halfW = 15;
  halfH = 10;

  constructor() {
    this.updateExtents();
  }

  private updateExtents(): void {
    const vHalf = MathUtils.degToRad(FOV / 2);
    this.halfH = (DIST * Math.tan(vHalf)) / Math.sin(PITCH);
    this.halfW = DIST * Math.tan(vHalf) * this.camera.aspect;
  }

  /** Snap to a point (zone entry). */
  snap(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.place();
  }

  shake(intensity: number, ms: number): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), intensity * 26);
    this.shakeDur = ms / 1000;
    this.shakeT = this.shakeDur;
  }

  /** A small push along `angle` (radians, sim space) that springs back: melee impact. */
  kick(angle: number, amount: number): void {
    this.nudge.x += Math.cos(angle) * amount;
    this.nudge.y += Math.sin(angle) * amount;
  }

  /**
   * Follow (x, z) with a look-ahead toward the cursor. `ndc` is the cursor in normalised device
   * coordinates; aiming pushes the view further.
   */
  follow(dt: number, x: number, z: number, ndc: Vector2, aiming: boolean, w: number, h: number): void {
    const k = aiming ? 0.42 : 0.17;
    let lx = ndc.x * this.halfW * k;
    let lz = -ndc.y * this.halfH * k;
    const max = aiming ? 7 : 3;
    const len = Math.hypot(lx, lz);
    if (len > max) {
      lx = (lx / len) * max;
      lz = (lz / len) * max;
    }
    this.moveToward(dt, x + lx, z + lz, 7, w, h);
  }

  /** Ease toward a fixed point (scripted pans). */
  panTo(dt: number, x: number, z: number, w: number, h: number): void {
    this.moveToward(dt, x, z, 3.2, w, h);
  }

  private moveToward(dt: number, tx: number, tz: number, rate: number, w: number, h: number): void {
    const f = 1 - Math.exp(-dt * rate);
    this.target.x += (tx - this.target.x) * f;
    this.target.z += (tz - this.target.z) * f;
    // Keep the map in view: don't scroll far past its edges.
    const mx = this.halfW * 0.85;
    const mz = this.halfH * 0.7;
    this.target.x = w <= mx * 2 ? w / 2 : MathUtils.clamp(this.target.x, mx - 1, w - mx + 1);
    this.target.z = h <= mz * 2 ? h / 2 : MathUtils.clamp(this.target.z, mz - 1.5, h - mz + 2.5);
    this.nudge.multiplyScalar(Math.exp(-dt * 14));
    if (this.shakeT > 0) this.shakeT -= dt;
    this.place();
  }

  private place(): void {
    let sx = 0;
    let sz = 0;
    if (this.shakeT > 0) {
      const k = (this.shakeT / this.shakeDur) * this.shakeAmp;
      sx = (Math.random() - 0.5) * k;
      sz = (Math.random() - 0.5) * k;
    }
    const tx = this.target.x + this.nudge.x + sx;
    const tz = this.target.z + this.nudge.y + sz;
    this.camera.position.set(tx, Math.sin(PITCH) * DIST, tz + Math.cos(PITCH) * DIST);
    this.camera.lookAt(tx, 0, tz);
    this.camera.updateMatrixWorld();
  }

  /** The aim point (tiles) under the cursor, on a plane at torso height. */
  aimPoint(ndc: Vector2): { x: number; y: number } {
    this.ray.setFromCamera(ndc, this.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return { x: this.target.x, y: this.target.z };
    return { x: this.hit.x, y: this.hit.z };
  }

  /** World point → logical UI pixels (1280×720). `behind` when it's behind the camera. */
  project(x: number, y: number, z: number): { x: number; y: number; behind: boolean } {
    this.v.set(x, y, z).project(this.camera);
    return { x: ((this.v.x + 1) / 2) * VIEW_W, y: ((1 - this.v.y) / 2) * VIEW_H, behind: this.v.z > 1 };
  }

  /** Point-sprite scale: drawing-buffer pixels per world unit at distance 1. */
  spriteScale(bufferHeight: number): number {
    return bufferHeight / (2 * Math.tan(MathUtils.degToRad(this.camera.fov / 2)));
  }

  /** Camera forward on the ground plane (for the wall cut-away). */
  groundForward(out: Vector2): Vector2 {
    return out.set(0, -1);
  }
}
