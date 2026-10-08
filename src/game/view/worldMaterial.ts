/**
 * Line of sight in 3D (BRIEF_V2 §1): every world material samples a per-tile visibility texture written
 * from the sim's FOV each frame. Visible tiles are lit by the real lights (plus a small fill so what you can
 * see is never pitch black); remembered tiles are drawn dim and desaturated with no live lighting; tiles
 * never seen are black. Walls (and doors) between the camera and the player are cut down to stubs in the
 * vertex shader so the player is never hidden.
 */
import {
  Color,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Material,
} from 'three';

const blank = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType);
blank.needsUpdate = true;

/** Shared uniform objects: every patched material reads the same values. */
export const worldUniforms = {
  uFog: { value: blank as DataTexture },
  uFogSize: { value: new Vector2(1, 1) },
  uFogOn: { value: 1 },
  /** Fill light added to visible surfaces (scaled by the sim's per-tile brightness). */
  uFill: { value: new Color(0.06, 0.06, 0.07) },
  /** Brightness of remembered (explored, not visible) surfaces. */
  uMemory: { value: 0.3 },
  /** How much the edge of your vision darkens visible surfaces (0 = not at all). */
  uEdge: { value: 0.5 },
  uCutPos: { value: new Vector3() },
  /** Camera forward on the ground plane (from the camera toward the player). */
  uCutDir: { value: new Vector2(0, -1) },
  uCutOn: { value: 1 },
  uCutStub: { value: 0.22 },
};

/** A per-tile RGBA texture: R visible now, G explored, B brightness (sim FOV), A unused. */
export class FogTexture {
  readonly texture: DataTexture;
  private data: Uint8Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 4);
    this.texture = new DataTexture(this.data, w, h, RGBAFormat, UnsignedByteType);
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  update(visible: Uint8Array, explored: readonly number[], bright: Float32Array): void {
    const d = this.data;
    const n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      d[o] = visible[i] ? 255 : 0;
      d[o + 1] = explored[i] ? 255 : 0;
      d[o + 2] = Math.min(255, Math.round((bright[i] ?? 0) * 255));
      d[o + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  activate(): void {
    worldUniforms.uFog.value = this.texture;
    worldUniforms.uFogSize.value.set(this.w, this.h);
  }

  dispose(): void {
    if (worldUniforms.uFog.value === this.texture) worldUniforms.uFog.value = blank;
    this.texture.dispose();
  }
}

export interface PatchOptions {
  /** Cut this mesh down near the player when it stands between the camera and the player. */
  cutaway?: boolean;
  /** Ignore line of sight (things the player always sees, like their own body). */
  noFog?: boolean;
}

const VERT_DECL = /* glsl */ `
varying vec3 vFogPos;
#ifdef WORLD_CUT
uniform vec3 uCutPos;
uniform vec2 uCutDir;
uniform float uCutOn;
uniform float uCutStub;
#endif
`;

const VERT_PROJECT = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
vec4 wPos = modelMatrix * mvPosition;
#ifdef WORLD_CUT
{
	#ifdef USE_INSTANCING
		vec3 cutRef = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	#else
		vec3 cutRef = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
	#endif
	vec2 rel = cutRef.xz - uCutPos.xz;
	float along = dot( rel, -uCutDir );
	float side = abs( rel.x * uCutDir.y - rel.y * uCutDir.x );
	float cut = uCutOn * smoothstep( -0.7, 0.3, along ) * ( 1.0 - smoothstep( 7.0, 9.5, along ) )
		* ( 1.0 - smoothstep( 2.3, 3.5, side - along * 0.3 ) );
	wPos.y = mix( wPos.y, min( wPos.y, uCutStub ), cut );
}
#endif
vFogPos = wPos.xyz;
mvPosition = viewMatrix * wPos;
gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_DECL = /* glsl */ `
varying vec3 vFogPos;
uniform sampler2D uFog;
uniform vec2 uFogSize;
uniform float uFogOn;
uniform vec3 uFill;
uniform float uMemory;
uniform float uEdge;
`;

const FRAG_APPLY = /* glsl */ `
#ifndef WORLD_NOFOG
{
	vec4 fs = texture2D( uFog, vFogPos.xz / uFogSize );
	float vis = mix( 1.0, fs.r, uFogOn );
	float mem = mix( 1.0, fs.g, uFogOn );
	float bri = mix( 1.0, fs.b, uFogOn );
	outgoingLight += diffuseColor.rgb * uFill * bri;
	outgoingLight *= mix( 1.0 - uEdge, 1.0, smoothstep( 0.2, 0.85, bri ) );
	float lum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
	vec3 remembered = mix( vec3( lum ), diffuseColor.rgb, 0.3 ) * uMemory * mem;
	outgoingLight = mix( remembered, outgoingLight, vis );
}
#endif
#include <opaque_fragment>
`;

/** Add line of sight (and optionally the wall cut-away) to a three.js material. Returns the material. */
export function patchWorld<T extends Material>(m: T, opts: PatchOptions = {}): T {
  const key = `world${opts.cutaway ? '-cut' : ''}${opts.noFog ? '-nofog' : ''}`;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.defines ??= {};
    if (opts.cutaway) shader.defines.WORLD_CUT = '';
    if (opts.noFog) shader.defines.WORLD_NOFOG = '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <project_vertex>', VERT_PROJECT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <opaque_fragment>', FRAG_APPLY);
  };
  m.customProgramCacheKey = () => key;
  return m;
}
