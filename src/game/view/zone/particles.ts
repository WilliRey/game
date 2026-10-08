/**
 * A small CPU particle system drawn as one Points object (per blend mode): sparks, blood, flames, smoke,
 * gas and dust. Particles carry their own size, colour, alpha, gravity and drag.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
  Points,
  ShaderMaterial,
  type Texture,
} from 'three';

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** Size at the end of its life (default: same). */
  size1?: number;
  r: number;
  g: number;
  b: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
}

interface P extends Required<ParticleSpec> {
  age: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
void main() {
	vColor = aColor;
	vec4 mv = modelViewMatrix * vec4( position, 1.0 );
	gl_PointSize = aSize * uScale / max( 0.1, -mv.z );
	gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec4 vColor;
void main() {
	vec4 t = texture2D( uMap, gl_PointCoord );
	gl_FragColor = vec4( vColor.rgb * t.rgb, vColor.a * t.a );
	if ( gl_FragColor.a < 0.01 ) discard;
}
`;

export class Particles {
  readonly points: Points;
  private list: P[] = [];
  private pos: Float32Array;
  private size: Float32Array;
  private color: Float32Array;
  private geom = new BufferGeometry();
  readonly material: ShaderMaterial;

  constructor(
    map: Texture,
    additive: boolean,
    private capacity = 900,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 4);
    this.geom.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geom.setAttribute('aSize', new BufferAttribute(this.size, 1));
    this.geom.setAttribute('aColor', new BufferAttribute(this.color, 4));
    this.material = new ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 400 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geom, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  /** Pixels per world unit at distance 1 (set from the camera each frame). */
  setScale(s: number): void {
    this.material.uniforms.uScale!.value = s;
  }

  emit(s: ParticleSpec): void {
    if (this.list.length >= this.capacity) this.list.shift();
    this.list.push({
      vx: 0,
      vy: 0,
      vz: 0,
      size1: s.size,
      alpha: 1,
      gravity: 0,
      drag: 0,
      ...s,
      age: 0,
    });
  }

  update(dt: number): void {
    const out: P[] = [];
    for (const p of this.list) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vz *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.02 && p.gravity > 0) {
        p.y = 0.02;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      out.push(p);
    }
    this.list = out;
    const n = out.length;
    for (let i = 0; i < n; i++) {
      const p = out[i]!;
      const k = p.age / p.life;
      this.pos[i * 3] = p.x;
      this.pos[i * 3 + 1] = p.y;
      this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.size + (p.size1 - p.size) * k;
      this.color[i * 4] = p.r;
      this.color[i * 4 + 1] = p.g;
      this.color[i * 4 + 2] = p.b;
      // Fade in quickly, out slowly.
      this.color[i * 4 + 3] = p.alpha * Math.min(1, k * 12) * (1 - k * k);
    }
    this.geom.setDrawRange(0, n);
    this.geom.attributes.position!.needsUpdate = true;
    this.geom.attributes.aSize!.needsUpdate = true;
    this.geom.attributes.aColor!.needsUpdate = true;
  }

  get count(): number {
    return this.list.length;
  }

  dispose(): void {
    this.geom.dispose();
    this.material.dispose();
  }
}
