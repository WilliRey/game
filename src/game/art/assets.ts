/**
 * The asset registry. Every model and texture is requested by a manifest key; the registry returns a real
 * asset when one has been loaded for that key, otherwise the procedural placeholder (built once, cached).
 *
 * Dropping in real models: list `key → URL` in `MODEL_OVERRIDES` (glTF/GLB). Overrides are loaded at
 * boot; a static prop override is placed as its own object (not instanced). Characters are posed per part,
 * so a character override must contain nodes named after the rig parts (torso, head, armL, armR, legL,
 * legR) — see docs/CONTENT_GUIDE.md.
 */
import {
  CanvasTexture,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry,
  type Object3D,
  type Texture,
} from 'three';

/** Real models by manifest key (none ship with v2; everything is procedural). */
export const MODEL_OVERRIDES: Record<string, string> = {};
/** Real textures by manifest key. */
export const TEXTURE_OVERRIDES: Record<string, string> = {};

const geometries = new Map<string, BufferGeometry>();
const textures = new Map<string, Texture>();
const loadedModels = new Map<string, Object3D>();

/** The placeholder geometry for a key, built on first use. */
export function geometry(key: string, build: () => BufferGeometry): BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    g = build();
    g.name = key;
    geometries.set(key, g);
  }
  return g;
}

/** A canvas-painted texture for a key (or a loaded override), built on first use. */
export function texture(key: string, paint: () => HTMLCanvasElement, srgb = true): Texture {
  let t = textures.get(key);
  if (!t) {
    t = new CanvasTexture(paint());
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.name = key;
    textures.set(key, t);
  }
  return t;
}

/** A loaded real model for this key, if one was listed in MODEL_OVERRIDES. */
export function overrideModel(key: string): Object3D | undefined {
  return loadedModels.get(key);
}

/** Load the listed overrides (call once at boot; resolves immediately when there are none). */
export async function loadOverrides(): Promise<void> {
  const entries = Object.entries(MODEL_OVERRIDES);
  const texEntries = Object.entries(TEXTURE_OVERRIDES);
  if (!entries.length && !texEntries.length) return;
  if (entries.length) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    await Promise.all(
      entries.map(async ([key, url]) => {
        try {
          const gltf = await loader.loadAsync(url);
          loadedModels.set(key, gltf.scene);
        } catch (e) {
          console.warn(`Model override for ${key} failed to load (${url}); using the placeholder.`, e);
        }
      }),
    );
  }
  if (texEntries.length) {
    const loader = new TextureLoader();
    await Promise.all(
      texEntries.map(async ([key, url]) => {
        try {
          const t = await loader.loadAsync(url);
          t.colorSpace = SRGBColorSpace;
          textures.set(key, t);
        } catch (e) {
          console.warn(`Texture override for ${key} failed to load (${url}); using the placeholder.`, e);
        }
      }),
    );
  }
}
