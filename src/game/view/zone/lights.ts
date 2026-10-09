/**
 * Lighting (BRIEF_V2 §1): a hemisphere and a sun/moon light driven by day and night, the flashlight as a
 * shadow-casting spotlight from Sam's hand, and a fixed pool of point lights shared each frame by the
 * nearest light sources (lamps, fire barrels, molotov fires, muzzle flashes, explosions, flashbangs).
 * The pool never changes size, so shaders never recompile mid-game.
 */
import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Object3D,
  PointLight,
  SpotLight,
  type Vector3,
} from 'three';
import { BALANCE } from '@/config/balance';
import type { FlashLight } from './fx';
import type { LightSource } from './props';
import { worldUniforms } from '../worldMaterial';
import type { QualityTier } from '../../quality';

const DAY_SKY = new Color('#c9cdd4');
const DAY_GROUND = new Color('#4a4238');
const NIGHT_SKY = new Color('#3e4d72');
const NIGHT_GROUND = new Color('#17161b');
const SUN = new Color('#f0dcc0');
const MOON = new Color('#6f84b8');
const tmpC = new Color();

export class LightRig {
  readonly group = new Group();
  readonly hemi: HemisphereLight;
  readonly sun: DirectionalLight;
  readonly flashlight: SpotLight;
  private target = new Object3D();
  private pool: PointLight[] = [];
  private t = 0;

  constructor(readonly quality: QualityTier) {
    this.hemi = new HemisphereLight(DAY_SKY, DAY_GROUND, 1.3);
    this.sun = new DirectionalLight(SUN, 1.1);
    this.sun.position.set(-12, 30, 18);
    this.group.add(this.hemi, this.sun, this.sun.target, this.target);
    this.flashlight = new SpotLight(0xfff1d6, 0, BALANCE.vision.flashlightBonus + 10, 0.42, 0.5, 1.15);
    this.flashlight.target = this.target;
    if (quality.shadows) {
      this.flashlight.castShadow = true;
      this.flashlight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
      this.flashlight.shadow.camera.near = 0.2;
      this.flashlight.shadow.camera.far = 24;
      this.flashlight.shadow.bias = -0.002;
      this.flashlight.shadow.normalBias = 0.02;
    }
    this.group.add(this.flashlight);
    for (let i = 0; i < quality.pointLights; i++) {
      const l = new PointLight(0xffffff, 0, 6, 1.6);
      this.pool.push(l);
      this.group.add(l);
    }
  }

  /**
   * `dark` is 0 (noon) … 1 (night / pitch-black interiors). Sources are assigned to the pool by priority:
   * transient flashes first, then the nearest steady lights.
   */
  update(
    dt: number,
    dark: number,
    px: number,
    pz: number,
    torchOn: boolean,
    lens: Vector3,
    dir: Vector3,
    sources: LightSource[],
    flashes: FlashLight[],
  ): void {
    this.t += dt;
    const day = 1 - dark;
    this.hemi.color.copy(NIGHT_SKY).lerp(DAY_SKY, day);
    this.hemi.groundColor.copy(NIGHT_GROUND).lerp(DAY_GROUND, day);
    this.hemi.intensity = 0.95 + 0.78 * day;
    this.sun.color.copy(MOON).lerp(SUN, day);
    this.sun.intensity = 0.6 + 0.85 * day;
    this.sun.position.set(px - 12, 30, pz + 18);
    this.sun.target.position.set(px, 0, pz);
    // What you can see is never pitch black: a cool fill that grows at night.
    worldUniforms.uFill.value.copy(tmpC.setRGB(0.07, 0.075, 0.09)).multiplyScalar(0.6 + dark * 1.4);
    worldUniforms.uEdge.value = 0.25 + dark * 0.4;
    // Eyes adjusting to the dark: a soft cool glow around Sam that grows with the darkness.
    worldUniforms.uGlowPos.value.set(px, 0, pz);
    worldUniforms.uGlow.value.copy(tmpC.setRGB(0.5, 0.55, 0.7)).multiplyScalar(dark * dark * 0.9);

    this.flashlight.intensity = torchOn ? 26 : 0;
    this.flashlight.position.copy(lens);
    this.target.position.set(lens.x + dir.x * 6, 0.2, lens.z + dir.z * 6);

    // Rank light requests: flashes (short, bright) first, then lamps by distance.
    const want: {
      x: number;
      y: number;
      z: number;
      color: number;
      intensity: number;
      radius: number;
      score: number;
    }[] = [];
    for (const f of flashes)
      want.push({
        ...f,
        intensity: f.intensity * Math.max(0, f.ttl / f.life),
        score: -100 + Math.hypot(f.x - px, f.z - pz),
      });
    for (const s of sources) {
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d > 26) continue;
      let k = 1;
      if (s.flicker) {
        k = s.fire
          ? 0.82 + Math.sin(this.t * 13 + s.x) * 0.1 + Math.sin(this.t * 29 + s.z) * 0.08
          : 0.9 + Math.sin(this.t * 9 + s.x) * 0.06 + (Math.random() < 0.02 ? -0.5 : 0);
      }
      // Lamps matter more after dark; by day they barely show.
      const base = s.fire ? 5 : 3.2;
      want.push({
        x: s.x,
        y: s.y,
        z: s.z,
        color: s.color,
        intensity: base * k * (0.35 + 0.65 * dark),
        radius: s.radius + 2,
        score: d,
      });
    }
    want.sort((a, b) => a.score - b.score);
    this.pool.forEach((l, i) => {
      const w = want[i];
      if (!w) {
        l.intensity = 0;
        return;
      }
      l.position.set(w.x, w.y, w.z);
      l.color.setHex(w.color);
      l.intensity = w.intensity;
      l.distance = w.radius;
    });
  }

  dispose(): void {
    this.flashlight.shadow.map?.dispose();
    this.flashlight.dispose();
    for (const l of this.pool) l.dispose();
  }
}
