/**
 * The asset registry. Every model and texture is requested by a manifest key; the registry returns a real
 * asset when one has been loaded for that key, otherwise the procedural placeholder (built once, cached).
 *
 * Dropping in real models: list `key → URL` in `MODEL_OVERRIDES` (glTF/GLB). Overrides are loaded at
 * boot, before the renderer starts; a static prop override is placed as its own object (not instanced).
 * Characters are posed per part, so a character override must contain nodes named after the rig parts
 * (torso, head, armL, armR, legL, legR), each with its origin at the joint — see docs/CONTENT_GUIDE.md.
 */
import {
  BufferAttribute,
  CanvasTexture,
  Color,
  Matrix4,
  SRGBColorSpace,
  TextureLoader,
  type BufferGeometry,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Real models by manifest key (none ship with v2; everything is procedural). */
export const MODEL_OVERRIDES: Record<string, string> = {};
/** Real textures by manifest key. */
export const TEXTURE_OVERRIDES: Record<string, string> = {};

const geometries = new Map<string, BufferGeometry>();
const textures = new Map<string, Texture>();
const loadedModels = new Map<string, Object3D>();

/** The geometry for a key: a loaded override (colours baked), else the placeholder, built on first use. */
export function geometry(key: string, build: () => BufferGeometry): BufferGeometry {
  let g = geometries.get(key);
  if (!g) {
    const real = loadedModels.get(key);
    g = (real ? bake(real, real) : null) ?? build();
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

/** Register a real model for a key (what `loadOverrides` does for each listed file; also used by tests). */
export function setOverrideModel(key: string, model: Object3D): void {
  loadedModels.set(key, model);
  geometries.delete(key);
  for (const k of [...partCache.keys()]) if (k.startsWith(`${key}#`)) partCache.delete(k);
}

/** A loaded real model for this key, if one was listed in MODEL_OVERRIDES. */
export function overrideModel(key: string): Object3D | undefined {
  return loadedModels.get(key);
}

const partCache = new Map<string, BufferGeometry | null>();

/**
 * Every mesh under `node`, in that node's space, merged into one geometry with the material colours baked
 * into vertex colours (placeholder materials are vertex-coloured, so a real model drops into them).
 */
function bake(root: Object3D, node: Object3D): BufferGeometry | null {
  root.updateMatrixWorld(true);
  const toNode = new Matrix4().copy(node.matrixWorld).invert();
  const pieces: BufferGeometry[] = [];
  node.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    let g = m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(toNode, m.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes))
      if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    const col = (mat as { color?: Color } | undefined)?.color ?? new Color(1, 1, 1);
    const n = g.getAttribute('position').count;
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) rgb.set([col.r, col.g, col.b], i * 3);
    g.setAttribute('color', new BufferAttribute(rgb, 3));
    pieces.push(g);
  });
  return pieces.length ? mergeGeometries(pieces) : null;
}

/**
 * One rig part of a character override: the meshes under the node named `part` (its origin is the joint
 * the rig turns it about). Undefined when there's no override or no such node.
 */
export function overridePart(key: string, part: string): BufferGeometry | undefined {
  const cacheKey = `${key}#${part}`;
  if (partCache.has(cacheKey)) return partCache.get(cacheKey) ?? undefined;
  const root = loadedModels.get(key);
  const node = root?.getObjectByName(part);
  const out = root && node ? bake(root, node) : null;
  partCache.set(cacheKey, out);
  return out ?? undefined;
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
          setOverrideModel(key, gltf.scene);
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
