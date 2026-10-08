/**
 * Procedural low-poly placeholder models, built in code from boxes, cylinders and spheres with vertex
 * colours (no textures), each merged into one BufferGeometry so props can be instanced. Every model is
 * reached through a key in `manifest.ts`; `assets.ts` swaps in a loaded model when one exists.
 *
 * Conventions: 1 unit = 1 tile. Props are authored in a unit footprint (x, z ∈ [-0.5, 0.5], long axis X)
 * standing on y = 0. Weapons are authored in hand space: the grip at the origin, the business end along +X.
 * Character parts hang from their joint: legs and arms extend down (−Y), torso and head extend up.
 */
import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Matrix4,
  SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- kit

export interface PartOpts {
  /** Position of the part's centre. */
  at?: [number, number, number];
  /** Euler rotation (radians, XYZ). */
  rot?: [number, number, number];
  /** Darken (−) or lighten (+) the colour a little per face for a hand-made look. */
  jitter?: number;
}

const _m = new Matrix4();
const _e = new Euler();
const _c = new Color();

/** Normalise a primitive into a coloured, non-indexed, uv-less geometry placed by `opts`. */
export function part(geom: BufferGeometry, color: string | number, opts: PartOpts = {}): BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  g.deleteAttribute('uv');
  if (g.getAttribute('uv1')) g.deleteAttribute('uv1');
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  _c.set(color);
  const jitter = opts.jitter ?? 0.04;
  for (let i = 0; i < n; i += 3) {
    // One shade per triangle: flat low-poly faces.
    const k = 1 + (((i * 7919) % 13) / 13 - 0.5) * jitter;
    for (let j = 0; j < 3 && i + j < n; j++) {
      colors[(i + j) * 3] = _c.r * k;
      colors[(i + j) * 3 + 1] = _c.g * k;
      colors[(i + j) * 3 + 2] = _c.b * k;
    }
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  if (opts.at || opts.rot) {
    const e = opts.rot ?? [0, 0, 0];
    _e.set(e[0], e[1], e[2], 'XYZ');
    _m.makeRotationFromEuler(_e);
    _m.setPosition(opts.at?.[0] ?? 0, opts.at?.[1] ?? 0, opts.at?.[2] ?? 0);
    g.applyMatrix4(_m);
  }
  if (g !== geom) geom.dispose();
  return g;
}

/** Box of size (x, y, z) whose bottom sits at `y0`. */
export function box(
  sx: number,
  sy: number,
  sz: number,
  color: string | number,
  x = 0,
  y0 = 0,
  z = 0,
  rot?: [number, number, number],
): BufferGeometry {
  return part(new BoxGeometry(sx, sy, sz), color, { at: [x, y0 + sy / 2, z], rot });
}

/** Upright cylinder (radius top/bottom, height) whose bottom sits at `y0`. */
export function cyl(
  rt: number,
  rb: number,
  h: number,
  color: string | number,
  x = 0,
  y0 = 0,
  z = 0,
  seg = 8,
  rot?: [number, number, number],
): BufferGeometry {
  return part(new CylinderGeometry(rt, rb, h, seg), color, { at: [x, y0 + h / 2, z], rot });
}

/** Cylinder lying along X, centred at (x, y, z). */
export function rod(len: number, r: number, color: string | number, x: number, y: number, z = 0, seg = 6) {
  return part(new CylinderGeometry(r, r, len, seg), color, { at: [x, y, z], rot: [0, 0, Math.PI / 2] });
}

export function ball(r: number, color: string | number, x = 0, y = 0, z = 0, detail = 0): BufferGeometry {
  return part(new IcosahedronGeometry(r, detail), color, { at: [x, y, z] });
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed');
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- palette

export const PAL = {
  wood: '#5f4630',
  woodDark: '#3e2d1f',
  woodLight: '#7a5d3e',
  metal: '#5d6268',
  metalDark: '#34383d',
  metalLight: '#8a9096',
  rust: '#6d4632',
  white: '#b7b8b2',
  paper: '#c9c0aa',
  red: '#7a2e27',
  green: '#2f4a3a',
  rubber: '#1d1f22',
  glass: '#2c3a44',
  fabric: '#4a5a4a',
  skin: '#a98466',
  hair: '#2a221c',
  blood: '#4f0f12',
};

// ---------------------------------------------------------------- characters

export type BodyStyle = 'survivor' | 'walker' | 'runner' | 'bloater' | 'bloater_boss' | 'screamer';

export interface BodyDims {
  /** Hip height (top of the legs). */
  hip: number;
  legLen: number;
  legW: number;
  hipSpread: number;
  torsoH: number;
  torsoD: number;
  torsoW: number;
  headS: number;
  armLen: number;
  armW: number;
  shoulder: number;
  /** Overall scale applied to the rig. */
  scale: number;
}

export const BODY: Record<BodyStyle, BodyDims> = {
  survivor: {
    hip: 0.5,
    legLen: 0.5,
    legW: 0.12,
    hipSpread: 0.08,
    torsoH: 0.42,
    torsoD: 0.2,
    torsoW: 0.34,
    headS: 0.2,
    armLen: 0.44,
    armW: 0.095,
    shoulder: 0.21,
    scale: 1,
  },
  walker: {
    hip: 0.5,
    legLen: 0.5,
    legW: 0.12,
    hipSpread: 0.08,
    torsoH: 0.43,
    torsoD: 0.2,
    torsoW: 0.34,
    headS: 0.2,
    armLen: 0.47,
    armW: 0.09,
    shoulder: 0.21,
    scale: 1.02,
  },
  runner: {
    hip: 0.52,
    legLen: 0.52,
    legW: 0.1,
    hipSpread: 0.07,
    torsoH: 0.41,
    torsoD: 0.17,
    torsoW: 0.29,
    headS: 0.19,
    armLen: 0.46,
    armW: 0.08,
    shoulder: 0.18,
    scale: 0.98,
  },
  bloater: {
    hip: 0.42,
    legLen: 0.42,
    legW: 0.17,
    hipSpread: 0.12,
    torsoH: 0.55,
    torsoD: 0.5,
    torsoW: 0.62,
    headS: 0.19,
    armLen: 0.42,
    armW: 0.14,
    shoulder: 0.3,
    scale: 1.15,
  },
  bloater_boss: {
    hip: 0.42,
    legLen: 0.42,
    legW: 0.18,
    hipSpread: 0.13,
    torsoH: 0.58,
    torsoD: 0.55,
    torsoW: 0.66,
    headS: 0.2,
    armLen: 0.46,
    armW: 0.15,
    shoulder: 0.32,
    scale: 1.85,
  },
  screamer: {
    hip: 0.52,
    legLen: 0.52,
    legW: 0.09,
    hipSpread: 0.07,
    torsoH: 0.43,
    torsoD: 0.16,
    torsoW: 0.27,
    headS: 0.2,
    armLen: 0.56,
    armW: 0.075,
    shoulder: 0.17,
    scale: 1.02,
  },
};

export interface BodyColors {
  skin: string;
  top: string;
  topDark: string;
  legs: string;
  shoes: string;
  hair: string;
  /** Blood and filth on zombies. */
  stain?: string;
}

export const ZOMBIE_COLORS: Record<string, BodyColors> = {
  walker: {
    skin: '#7f8a6c',
    top: '#4d5743',
    topDark: '#3a4232',
    legs: '#33363b',
    shoes: '#1f1c19',
    hair: '#2c2a22',
    stain: PAL.blood,
  },
  runner: {
    skin: '#8c7d66',
    top: '#5e4c3c',
    topDark: '#45372b',
    legs: '#2d3138',
    shoes: '#1c1a18',
    hair: '#1f1b16',
    stain: PAL.blood,
  },
  bloater: {
    skin: '#8e9a62',
    top: '#6c7a45',
    topDark: '#556135',
    legs: '#4a4f35',
    shoes: '#2a2a20',
    hair: '#3a3a2a',
    stain: '#5d6a2a',
  },
  bloater_boss: {
    skin: '#7f8b4f',
    top: '#5f6d38',
    topDark: '#4a552a',
    legs: '#3f4430',
    shoes: '#22231a',
    hair: '#2e2e22',
    stain: '#4b5820',
  },
  screamer: {
    skin: '#957a88',
    top: '#56434e',
    topDark: '#3f3139',
    legs: '#2c2a30',
    shoes: '#1b181c',
    hair: '#1a1316',
    stain: PAL.blood,
  },
};

export const RIG_PARTS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'] as const;
export type RigPart = (typeof RIG_PARTS)[number];

/** The six rig part geometries for a body style, each relative to its joint. */
export function bodyParts(style: BodyStyle, col: BodyColors): Record<RigPart, BufferGeometry> {
  const d = BODY[style];
  const fat = style === 'bloater' || style === 'bloater_boss';
  const torsoParts: BufferGeometry[] = [];
  if (fat) {
    torsoParts.push(
      part(new SphereGeometry(0.5, 7, 5).scale(d.torsoD * 1.15, d.torsoH * 1.2, d.torsoW), col.top, {
        at: [0.04, d.torsoH * 0.5, 0],
      }),
    );
    torsoParts.push(
      box(d.torsoD * 0.6, d.torsoH * 0.35, d.torsoW * 0.75, col.topDark, -0.02, d.torsoH * 0.72),
    );
    // Pustules.
    const n = style === 'bloater_boss' ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      torsoParts.push(
        ball(
          0.035 + (i % 3) * 0.012,
          '#a3b06a',
          Math.cos(a) * d.torsoD * 0.48,
          0.12 + (i % 4) * 0.1,
          Math.sin(a) * d.torsoW * 0.48,
        ),
      );
    }
  } else {
    torsoParts.push(box(d.torsoD, d.torsoH * 0.62, d.torsoW, col.top, 0, d.torsoH * 0.38));
    torsoParts.push(box(d.torsoD * 0.92, d.torsoH * 0.4, d.torsoW * 0.86, col.topDark, 0, 0));
    // Collar / shoulders.
    torsoParts.push(box(d.torsoD * 1.04, 0.06, d.torsoW * 1.06, col.topDark, 0, d.torsoH - 0.04));
    if (col.stain) {
      torsoParts.push(box(0.012, 0.09, 0.08, col.stain, d.torsoD / 2, d.torsoH * 0.35, -0.05));
      torsoParts.push(box(0.012, 0.06, 0.05, col.stain, d.torsoD / 2, d.torsoH * 0.62, 0.08));
    }
  }
  const head: BufferGeometry[] = [box(d.headS * 0.95, d.headS, d.headS * 0.88, col.skin, 0, 0)];
  // Hair cap and a face hint (the camera mostly sees the top of the head).
  head.push(box(d.headS * 0.98, d.headS * 0.32, d.headS * 0.92, col.hair, -0.01, d.headS * 0.72));
  if (style === 'screamer') head.push(box(0.012, 0.07, 0.07, '#1a0d10', d.headS * 0.48, d.headS * 0.18));
  else if (style !== 'survivor') {
    head.push(box(0.01, 0.025, 0.12, '#2a1a14', d.headS * 0.48, d.headS * 0.25));
    head.push(box(0.012, 0.02, 0.03, '#d8d0a0', d.headS * 0.48, d.headS * 0.58, -0.04));
    head.push(box(0.012, 0.02, 0.03, '#d8d0a0', d.headS * 0.48, d.headS * 0.58, 0.04));
  } else {
    head.push(box(0.012, 0.02, 0.03, '#1c1612', d.headS * 0.48, d.headS * 0.58, -0.045));
    head.push(box(0.012, 0.02, 0.03, '#1c1612', d.headS * 0.48, d.headS * 0.58, 0.045));
  }
  const arm = (side: 1 | -1) =>
    merge([
      box(d.armW, d.armLen * 0.55, d.armW, col.top, 0, -d.armLen * 0.55),
      box(d.armW * 0.9, d.armLen * 0.47, d.armW * 0.9, fat ? col.skin : col.topDark, 0, -d.armLen),
      box(d.armW * 0.95, 0.07, d.armW * 0.95, col.skin, 0, -d.armLen - 0.05, side * 0.002),
    ]);
  const leg = () =>
    merge([
      box(d.legW, d.legLen * 0.86, d.legW, col.legs, 0, -d.legLen * 0.86),
      box(d.legW * 1.05, 0.08, d.legW * 1.5, col.shoes, 0.03, -d.legLen),
    ]);
  return {
    torso: merge(torsoParts),
    head: merge(head),
    armL: arm(-1),
    armR: arm(1),
    legL: leg(),
    legR: leg(),
  };
}

// ---------------------------------------------------------------- weapons

/** Hand-space weapon models by item id; unknown ids fall back by weapon kind. */
export function weaponModel(itemId: string, kind: 'melee' | 'firearm' | 'throwable'): BufferGeometry {
  switch (itemId) {
    case 'knife':
      return merge([rod(0.1, 0.022, PAL.woodDark, 0.03, 0), box(0.2, 0.012, 0.045, '#a9adb2', 0.18, -0.006)]);
    case 'scalpel':
      return merge([rod(0.1, 0.012, '#8a9096', 0.03, 0), box(0.09, 0.008, 0.02, '#d0d4d8', 0.12, -0.004)]);
    case 'wrench':
      return merge([
        box(0.36, 0.035, 0.05, '#6a6f75', 0.16, -0.018),
        box(0.08, 0.06, 0.12, '#5a5f65', 0.36, -0.03),
        box(0.05, 0.06, 0.04, '#5a5f65', 0.4, -0.03, 0.05),
      ]);
    case 'lead_pipe':
      return merge([rod(0.62, 0.028, '#6b5e52', 0.27, 0), rod(0.06, 0.036, '#5a5048', 0.57, 0)]);
    case 'crowbar':
      return merge([
        rod(0.6, 0.02, '#3a1c1c', 0.26, 0),
        box(0.08, 0.025, 0.025, '#3a1c1c', 0.58, 0.03, 0, [0, 0, 0.9]),
        box(0.07, 0.02, 0.03, '#2c2c2c', -0.05, -0.01, 0, [0, 0, -0.4]),
      ]);
    case 'bat':
      return merge([
        part(new CylinderGeometry(0.045, 0.022, 0.66, 7), PAL.woodLight, {
          at: [0.3, 0, 0],
          rot: [0, 0, -Math.PI / 2],
        }),
        rod(0.1, 0.026, '#2a2420', 0, 0),
      ]);
    case 'nail_bat': {
      const parts = [
        part(new CylinderGeometry(0.046, 0.022, 0.66, 7), '#6f5539', {
          at: [0.3, 0, 0],
          rot: [0, 0, -Math.PI / 2],
        }),
        rod(0.1, 0.026, '#2a2420', 0, 0),
      ];
      for (let i = 0; i < 7; i++) {
        const a = i * 2.1;
        parts.push(
          box(0.012, 0.12, 0.012, '#9aa0a6', 0.44 + (i % 4) * 0.05, -0.06, 0, [
            Math.cos(a) * 1.2,
            0,
            Math.sin(a) * 1.2,
          ]),
        );
      }
      return merge(parts);
    }
    case 'machete':
      return merge([
        rod(0.12, 0.024, '#24201c', 0.04, 0),
        box(0.5, 0.012, 0.075, '#8f959b', 0.35, -0.006),
        box(0.08, 0.012, 0.05, '#7a8086', 0.6, -0.006, 0.01),
      ]);
    case 'fire_axe':
      return merge([
        rod(0.78, 0.024, '#8a2a20', 0.32, 0),
        box(0.12, 0.05, 0.2, '#6a6f75', 0.68, -0.025, 0.06),
        box(0.06, 0.05, 0.07, '#4a4f55', 0.68, -0.025, -0.09),
      ]);
    case 'police_baton':
      return merge([rod(0.48, 0.022, '#18191b', 0.2, 0), rod(0.04, 0.03, '#2a2b2e', 0.44, 0)]);
    case 'pistol_9mm':
      return merge([
        box(0.24, 0.06, 0.04, '#2a2c30', 0.08, 0.02),
        box(0.06, 0.12, 0.04, '#1f2124', -0.01, -0.09, 0, [0, 0, 0.25]),
      ]);
    case 'pipe_pistol':
      return merge([
        rod(0.3, 0.025, '#6b5e52', 0.12, 0.04),
        box(0.07, 0.13, 0.045, '#4a3a2a', -0.01, -0.1, 0, [0, 0, 0.2]),
        box(0.06, 0.05, 0.05, '#7a7a6a', 0.0, 0.0),
      ]);
    case 'pump_shotgun':
      return merge([
        rod(0.62, 0.025, '#2a2c30', 0.3, 0.04),
        box(0.22, 0.06, 0.06, '#4a3424', 0.32, -0.01),
        box(0.3, 0.09, 0.06, '#5a3e28', -0.18, -0.06, 0, [0, 0, -0.15]),
      ]);
    case 'hunting_rifle':
      return merge([
        rod(0.7, 0.02, '#2a2c30', 0.38, 0.05),
        box(0.36, 0.07, 0.06, '#5a3e28', 0.0, -0.02),
        box(0.3, 0.1, 0.06, '#5a3e28', -0.28, -0.08, 0, [0, 0, -0.12]),
        rod(0.2, 0.025, '#1a1b1d', 0.08, 0.11),
      ]);
    case 'crossbow':
      return merge([
        box(0.55, 0.05, 0.05, '#4a3424', 0.18, -0.02),
        box(0.04, 0.03, 0.5, '#2a2c30', 0.42, 0.0),
        rod(0.4, 0.008, '#c9c0aa', 0.25, 0.04),
      ]);
    case 'glass_bottle':
      return merge([
        cyl(0.035, 0.035, 0.16, '#3d5a3a', 0.02, -0.06),
        cyl(0.012, 0.02, 0.07, '#3d5a3a', 0.02, 0.1),
      ]);
    case 'molotov':
      return merge([
        cyl(0.035, 0.035, 0.16, '#5a6a3a', 0.02, -0.06),
        cyl(0.012, 0.02, 0.07, '#5a6a3a', 0.02, 0.1),
        box(0.03, 0.08, 0.03, '#c9b48a', 0.02, 0.16),
      ]);
    case 'pipe_bomb':
      return merge([rod(0.18, 0.032, '#5d6268', 0.04, 0), box(0.03, 0.03, 0.03, '#a02a20', 0.14, 0.02)]);
    case 'noisemaker':
      return merge([
        box(0.1, 0.07, 0.08, '#3a3d42', 0.03, -0.035),
        box(0.02, 0.02, 0.02, '#e03020', 0.05, 0.035),
      ]);
    case 'flashbang':
      return merge([
        cyl(0.03, 0.03, 0.13, '#3a4a3a', 0.03, -0.06),
        box(0.02, 0.06, 0.03, '#8a9096', 0.06, 0.0),
      ]);
    case 'smoke_bomb':
      return merge([
        cyl(0.035, 0.035, 0.13, '#7a7a74', 0.03, -0.06),
        cyl(0.02, 0.02, 0.02, '#3a3a36', 0.03, 0.07),
      ]);
  }
  if (kind === 'firearm') return merge([box(0.3, 0.06, 0.04, '#2a2c30', 0.1, 0.0)]);
  if (kind === 'throwable') return merge([cyl(0.035, 0.035, 0.14, '#5a5a52', 0.02, -0.06)]);
  return merge([rod(0.5, 0.025, '#5d6268', 0.22, 0)]);
}

/** Where the business end of a melee weapon is (hand space, +X), for the slash trail. */
export function weaponReach(itemId: string | null): number {
  switch (itemId) {
    case null:
      return 0.08;
    case 'knife':
      return 0.27;
    case 'scalpel':
      return 0.16;
    case 'wrench':
      return 0.42;
    case 'police_baton':
      return 0.45;
    case 'fire_axe':
      return 0.74;
    case 'bat':
    case 'nail_bat':
      return 0.62;
    default:
      return 0.58;
  }
}

/** A tiny flashlight for the off hand. */
export function flashlightModel(): BufferGeometry {
  return merge([rod(0.14, 0.022, '#2a2c30', 0.05, 0), rod(0.03, 0.03, '#d8d2b0', 0.13, 0)]);
}

// ---------------------------------------------------------------- props

/** Container and station models in a unit footprint (long axis X). */
export function propModel(kind: string): BufferGeometry {
  switch (kind) {
    case 'container.fridge':
      return merge([
        box(0.78, 1.45, 0.72, '#8f928b', 0, 0),
        box(0.02, 0.9, 0.6, '#6f726c', 0.39, 0.5),
        box(0.02, 0.04, 0.6, '#5c5e5a', 0.4, 0.98),
        box(0.03, 0.25, 0.04, '#c9c9c4', 0.41, 1.1, 0.25),
      ]);
    case 'container.cabinet':
      return merge([
        box(0.9, 0.82, 0.6, PAL.wood, 0, 0),
        box(0.94, 0.05, 0.64, '#6e655a', 0, 0.82),
        box(0.02, 0.7, 0.01, PAL.woodDark, 0.31, 0.06, 0),
        box(0.02, 0.05, 0.05, '#9a8a60', 0.31, 0.5, -0.06),
        box(0.02, 0.05, 0.05, '#9a8a60', 0.31, 0.5, 0.06),
      ]);
    case 'container.medicine_cabinet':
      return merge([
        box(0.5, 1.0, 0.4, '#a7a9a4', 0, 0),
        box(0.02, 0.22, 0.06, '#8c3a3a', 0.26, 0.6),
        box(0.02, 0.06, 0.22, '#8c3a3a', 0.26, 0.68),
      ]);
    case 'container.toolbox':
      return merge([
        box(0.6, 0.26, 0.34, '#7a3b31', 0, 0),
        box(0.62, 0.04, 0.36, '#5e2d25', 0, 0.26),
        box(0.36, 0.08, 0.03, '#2a2a2a', 0, 0.3),
      ]);
    case 'container.desk':
      return merge([
        box(0.95, 0.06, 0.62, PAL.wood, 0, 0.7),
        box(0.06, 0.7, 0.06, PAL.woodDark, -0.42, 0, -0.26),
        box(0.06, 0.7, 0.06, PAL.woodDark, 0.42, 0, -0.26),
        box(0.3, 0.6, 0.56, PAL.woodDark, 0.28, 0.08, 0),
        box(0.22, 0.02, 0.3, PAL.paper, -0.15, 0.76, 0.05),
        box(0.18, 0.14, 0.04, '#1d2024', 0.05, 0.76, -0.2),
      ]);
    case 'container.locker':
    case 'container.gun_locker': {
      const gun = kind === 'container.gun_locker';
      const body = gun ? '#2f3337' : '#4c5661';
      const parts = [box(0.78, 1.6, 0.58, body, 0, 0), box(0.02, 1.5, 0.01, '#262b30', 0.3, 0.05, 0)];
      for (let y = 1.2; y < 1.45; y += 0.07) parts.push(box(0.02, 0.02, 0.4, '#20242a', 0.3, y, 0));
      if (gun) parts.push(box(0.03, 0.08, 0.08, '#a08a3a', 0.31, 0.75, 0.15));
      return merge(parts);
    }
    case 'container.car_trunk':
      return carModel('#4f555c');
    case 'container.bus':
      return busModel();
    case 'container.dumpster':
      return merge([
        box(0.96, 0.95, 0.9, '#2f4a3a', 0, 0),
        box(1.0, 0.06, 0.96, '#24382c', 0, 0.95, 0, [0.12, 0, 0]),
        box(0.02, 0.85, 0.02, '#1c2c23', 0.0, 0.05, 0.46),
      ]);
    case 'container.corpse':
      return corpseModel('#4b4033', '#a98466');
    case 'container.shelf':
    case 'container.pharmacy_shelf':
      return shelfModel(kind === 'container.pharmacy_shelf');
    case 'container.crate':
      return merge([
        box(0.78, 0.66, 0.74, '#5f4b31', 0, 0),
        box(0.8, 0.06, 0.06, '#3c3020', 0, 0.3, 0.36),
        box(0.8, 0.06, 0.06, '#3c3020', 0, 0.3, -0.36),
        box(0.06, 0.68, 0.06, '#3c3020', 0.36, 0, 0.36),
        box(0.06, 0.68, 0.06, '#3c3020', -0.36, 0, 0.36),
      ]);
    case 'container.wardrobe':
      return merge([
        box(0.95, 1.7, 0.6, '#3f3023', 0, 0),
        box(0.02, 1.6, 0.01, '#221a12', 0.0, 0.05, 0.3),
        box(0.98, 0.06, 0.62, '#2e2318', 0, 1.7),
      ]);
    case 'container.register':
      return merge([
        box(0.85, 0.9, 0.6, '#4a4038', 0, 0),
        box(0.4, 0.22, 0.34, '#3b3e42', 0.1, 0.9),
        box(0.24, 0.08, 0.02, '#6a8a6a', 0.1, 1.04, 0.18),
      ]);
    case 'container.hospital_cart':
      return merge([
        box(0.8, 0.05, 0.5, '#7d8186', 0, 0.85),
        box(0.8, 0.05, 0.5, '#7d8186', 0, 0.4),
        box(0.04, 0.85, 0.04, '#4a4d51', -0.37, 0.05, -0.22),
        box(0.04, 0.85, 0.04, '#4a4d51', 0.37, 0.05, -0.22),
        box(0.04, 0.85, 0.04, '#4a4d51', -0.37, 0.05, 0.22),
        box(0.04, 0.85, 0.04, '#4a4d51', 0.37, 0.05, 0.22),
        box(0.14, 0.1, 0.12, '#c9c9c4', -0.15, 0.9),
        box(0.1, 0.16, 0.1, '#9aaab0', 0.15, 0.9),
      ]);
    case 'station.workbench':
      return merge([
        box(1.0, 0.07, 0.7, '#6a5135', 0, 0.82),
        box(0.07, 0.82, 0.07, '#3a2c1c', -0.44, 0, -0.3),
        box(0.07, 0.82, 0.07, '#3a2c1c', 0.44, 0, -0.3),
        box(0.07, 0.82, 0.07, '#3a2c1c', -0.44, 0, 0.3),
        box(0.07, 0.82, 0.07, '#3a2c1c', 0.44, 0, 0.3),
        box(0.9, 0.05, 0.6, '#4a3a26', 0, 0.3),
        box(0.16, 0.12, 0.1, '#4f5357', -0.3, 0.89, -0.2),
        box(0.3, 0.03, 0.04, '#7d8186', 0.15, 0.89, 0.1),
        box(0.22, 0.03, 0.04, '#7d8186', 0.1, 0.89, -0.05),
        box(0.08, 0.08, 0.08, '#9a4a3a', 0.35, 0.89, 0.2),
      ]);
    case 'station.stove':
      return merge([
        box(0.9, 0.86, 0.7, '#2c2d2f', 0, 0),
        box(0.92, 0.04, 0.72, '#1a1b1c', 0, 0.86),
        cyl(0.11, 0.11, 0.03, '#111', -0.2, 0.9, -0.17),
        cyl(0.11, 0.11, 0.03, '#111', 0.2, 0.9, -0.17),
        cyl(0.11, 0.11, 0.03, '#111', -0.2, 0.9, 0.17),
        cyl(0.11, 0.11, 0.03, '#111', 0.2, 0.9, 0.17),
        box(0.02, 0.4, 0.6, '#1f2022', 0.46, 0.2),
      ]);
    case 'station.reloading':
      return merge([
        box(1.0, 0.07, 0.6, '#4d4439', 0, 0.8),
        box(0.9, 0.8, 0.55, '#2a241d', 0, 0),
        box(0.12, 0.4, 0.12, '#5d6268', 0.1, 0.87),
        box(0.25, 0.05, 0.05, '#33363a', 0.1, 1.2),
        cyl(0.03, 0.03, 0.06, '#b08a3a', -0.3, 0.87, 0.1),
        cyl(0.03, 0.03, 0.06, '#b08a3a', -0.22, 0.87, 0.15),
      ]);
    case 'station.stash':
      return merge([
        box(0.95, 0.55, 0.62, '#4a3f2f', 0, 0),
        box(0.97, 0.1, 0.64, '#3a3022', 0, 0.55),
        box(0.06, 0.1, 0.05, '#a08a3a', 0.47, 0.42),
      ]);
    case 'station.bed':
      return merge([
        box(1.0, 0.25, 0.9, '#3b3f44', 0, 0),
        box(0.96, 0.14, 0.86, '#4a5a4a', 0, 0.25),
        box(0.2, 0.1, 0.6, '#8a8678', -0.36, 0.38),
        box(0.6, 0.05, 0.88, '#3e4c3e', 0.18, 0.39),
      ]);
    case 'station.rainCollector':
      return merge([
        cyl(0.32, 0.3, 0.95, '#2f444e', 0, 0, 0, 10),
        cyl(0.42, 0.1, 0.18, '#3a5560', 0, 0.95, 0, 10),
        cyl(0.34, 0.34, 0.03, '#1d2c34', 0, 0.94, 0, 10),
      ]);
    case 'station.campfire':
      return merge([
        cyl(0.27, 0.27, 0.8, '#3a3a3a', 0, 0, 0, 10),
        cyl(0.28, 0.28, 0.04, '#2a2a2a', 0, 0.78, 0, 10),
        cyl(0.2, 0.2, 0.06, '#1a120c', 0, 0.74, 0, 8),
        box(0.08, 0.04, 0.3, '#2a1c12', 0.02, 0.8, 0, [0.2, 0.4, 0]),
      ]);
    case 'station.radio':
      return merge([
        box(0.9, 0.06, 0.55, PAL.wood, 0, 0.72),
        box(0.06, 0.72, 0.06, PAL.woodDark, -0.38, 0, -0.2),
        box(0.06, 0.72, 0.06, PAL.woodDark, 0.38, 0, -0.2),
        box(0.06, 0.72, 0.06, PAL.woodDark, -0.38, 0, 0.2),
        box(0.06, 0.72, 0.06, PAL.woodDark, 0.38, 0, 0.2),
        box(0.42, 0.24, 0.28, '#3b3226', 0, 0.78),
        cyl(0.06, 0.06, 0.02, '#8a7a50', 0.22, 0.88, 0, 10, [0, 0, Math.PI / 2]),
        box(0.12, 0.04, 0.01, '#c09040', 0.1, 0.92, 0.14),
        box(0.01, 0.4, 0.01, '#777', -0.15, 1.02, -0.1, [0.3, 0, 0.2]),
      ]);
    case 'prop.vehicle':
      return ambulanceModel();
    case 'prop.blocker':
      return merge([
        box(0.96, 1.35, 0.08, '#4a4f55', 0, 0),
        box(0.98, 0.05, 0.1, '#3a3f45', 0, 0.7),
        box(0.06, 0.4, 0.14, '#7a7a6a', 0.0, 0.5, 0, [0, 0, 0.6]),
        box(0.06, 0.4, 0.14, '#7a7a6a', 0.0, 0.5, 0, [0, 0, -0.6]),
        box(0.08, 0.1, 0.16, '#a08a3a', 0, 0.55),
      ]);
    case 'prop.siphon':
      return merge([
        cyl(0.06, 0.06, 0.08, '#5d6268', 0, 0.55, 0, 10, [Math.PI / 2, 0, 0]),
        box(0.04, 0.04, 0.12, '#2a2c30', 0, 0.55, 0.06),
      ]);
    case 'prop.board':
      return merge([
        box(0.06, 1.3, 0.06, PAL.woodDark, 0, 0, -0.38),
        box(0.06, 1.3, 0.06, PAL.woodDark, 0, 0, 0.38),
        box(0.05, 0.6, 0.9, '#5f4630', 0, 0.62),
        box(0.02, 0.14, 0.12, PAL.paper, 0.03, 0.9, -0.2),
        box(0.02, 0.16, 0.14, '#d8cfb8', 0.03, 0.7, 0.05),
        box(0.02, 0.12, 0.1, PAL.paper, 0.03, 0.95, 0.25),
      ]);
    case 'prop.interact':
      return merge([box(0.5, 0.4, 0.4, '#5f4b31', 0, 0), box(0.52, 0.05, 0.42, '#3c3020', 0, 0.4)]);
    case 'prop.lampPost':
      return merge([
        cyl(0.05, 0.07, 2.3, '#2a2d30', 0, 0),
        box(0.5, 0.05, 0.06, '#2a2d30', 0.22, 2.25),
        box(0.18, 0.08, 0.14, '#3a3d40', 0.45, 2.17),
      ]);
    case 'prop.lampHanging':
      return merge([box(0.01, 0.35, 0.01, '#222', 0, 1.25), cyl(0.12, 0.05, 0.09, '#3a3a36', 0, 1.18, 0, 8)]);
    case 'prop.exit':
      return merge([box(0.05, 1.2, 0.05, '#2a2d30', 0, 0), box(0.04, 0.26, 0.5, '#2a5a2a', 0, 1.0)]);
    case 'prop.item':
      return merge([box(0.22, 0.12, 0.16, '#6a6a5a', 0, 0), box(0.16, 0.05, 0.12, '#8a8a72', 0, 0.12)]);
  }
  return merge([box(0.7, 0.6, 0.7, '#555', 0, 0)]);
}

function carModel(paint: string): BufferGeometry {
  // Long axis X (front at +X), footprint 1 × 1 (scaled to the container's tiles).
  const parts = [
    box(0.98, 0.38, 0.86, paint, 0, 0.14),
    box(0.55, 0.3, 0.78, '#3c4248', -0.05, 0.52),
    box(0.02, 0.24, 0.7, PAL.glass, 0.23, 0.55),
    box(0.02, 0.22, 0.7, PAL.glass, -0.33, 0.55),
    box(0.4, 0.22, 0.01, PAL.glass, -0.05, 0.55, 0.39),
    box(0.4, 0.22, 0.01, PAL.glass, -0.05, 0.55, -0.39),
    box(0.5, 0.36, 0.01, '#2b2e32', 0.0, 0.15, 0.43),
  ];
  for (const [x, z] of [
    [0.3, 0.43],
    [-0.3, 0.43],
    [0.3, -0.43],
    [-0.3, -0.43],
  ] as const)
    parts.push(cyl(0.14, 0.14, 0.1, PAL.rubber, x, 0.14, z, 10, [Math.PI / 2, 0, 0]));
  // Rust and grime.
  parts.push(box(0.18, 0.01, 0.2, PAL.rust, 0.3, 0.52, 0.1));
  parts.push(box(0.12, 0.01, 0.12, PAL.rust, -0.35, 0.52, -0.2));
  return merge(parts);
}

function busModel(): BufferGeometry {
  const parts = [box(0.99, 1.15, 0.92, '#6e6a4e', 0, 0.12), box(1.0, 0.06, 0.94, '#3a382a', 0, 1.27)];
  for (let i = 0; i < 6; i++) parts.push(box(0.12, 0.32, 0.01, PAL.glass, -0.4 + i * 0.16, 0.72, 0.465));
  for (let i = 0; i < 6; i++) parts.push(box(0.12, 0.32, 0.01, PAL.glass, -0.4 + i * 0.16, 0.72, -0.465));
  parts.push(box(0.01, 0.4, 0.8, PAL.glass, 0.5, 0.65));
  for (const x of [0.35, -0.35])
    for (const z of [0.46, -0.46])
      parts.push(cyl(0.14, 0.14, 0.08, PAL.rubber, x, 0.14, z, 10, [Math.PI / 2, 0, 0]));
  return merge(parts);
}

function ambulanceModel(): BufferGeometry {
  const parts = [
    box(0.68, 0.95, 0.9, '#c9c9c0', -0.15, 0.16),
    box(0.3, 0.6, 0.86, '#bcbcb2', 0.34, 0.16),
    box(0.02, 0.28, 0.78, PAL.glass, 0.49, 0.44),
    box(0.68, 0.08, 0.92, '#8a2a20', -0.15, 0.62),
    box(0.1, 0.06, 0.5, '#c02a20', 0.12, 1.11),
    box(0.1, 0.06, 0.2, '#2a4ac0', 0.12, 1.11, 0.3),
    box(0.05, 0.25, 0.25, '#8a2a20', -0.15, 0.7, 0.455),
    box(0.25, 0.05, 0.05, '#c9c9c0', -0.15, 0.8, 0.465),
  ];
  for (const x of [0.32, -0.32])
    for (const z of [0.45, -0.45])
      parts.push(cyl(0.15, 0.15, 0.1, PAL.rubber, x, 0.15, z, 10, [Math.PI / 2, 0, 0]));
  return merge(parts);
}

function shelfModel(pharmacy: boolean): BufferGeometry {
  const frame = pharmacy ? '#a8aaa6' : '#4a4c4f';
  const goods = pharmacy
    ? ['#c9c9c4', '#7a9aaa', '#aa6a6a', '#d8cf9a']
    : ['#6a4a3a', '#4a5a6a', '#6a6a3a', '#5a5a5a'];
  const parts = [
    box(0.04, 1.5, 0.45, frame, -0.48, 0),
    box(0.04, 1.5, 0.45, frame, 0.48, 0),
    box(0.98, 1.4, 0.02, frame, 0, 0.05, -0.21),
  ];
  for (let s = 0; s < 4; s++) {
    const y = 0.08 + s * 0.4;
    parts.push(box(0.96, 0.03, 0.44, frame, 0, y));
    for (let i = 0; i < 5; i++) {
      if ((s * 5 + i) % 4 === 3) continue;
      parts.push(
        box(
          0.12,
          0.14 + ((i + s) % 3) * 0.04,
          0.2,
          goods[(i + s) % goods.length]!,
          -0.38 + i * 0.19,
          y + 0.03,
          0.02,
        ),
      );
    }
  }
  return merge(parts);
}

function corpseModel(clothes: string, skin: string): BufferGeometry {
  return merge([
    box(0.9, 0.012, 0.6, PAL.blood, 0, 0.002, 0, [0, 0.3, 0]),
    box(0.42, 0.14, 0.3, clothes, 0, 0.012, 0, [0, 0.2, 0]),
    box(0.16, 0.13, 0.15, skin, 0.3, 0.012, 0.05),
    box(0.4, 0.1, 0.1, '#33363b', -0.36, 0.012, 0.1, [0, -0.2, 0]),
    box(0.4, 0.1, 0.1, '#33363b', -0.34, 0.012, -0.08, [0, 0.15, 0]),
    box(0.32, 0.08, 0.08, clothes, 0.1, 0.012, 0.24, [0, 0.8, 0]),
  ]);
}

/** A zombie lying dead (for kills): uses the type's colours. */
export function deadZombieModel(type: string): BufferGeometry {
  const col = ZOMBIE_COLORS[type] ?? ZOMBIE_COLORS.walker!;
  return corpseModel(col.top, col.skin);
}

/** A door slab (hinge at x = 0, spans +X to 1). */
export function doorModel(locked: boolean): BufferGeometry {
  const parts = [
    box(0.94, 1.36, 0.08, '#5c4630', 0.5, 0),
    box(0.8, 0.04, 0.085, '#4a3826', 0.5, 0.7),
    box(0.04, 0.06, 0.1, '#a09060', 0.85, 0.68),
  ];
  if (locked)
    parts.push(
      box(0.1, 0.12, 0.12, '#b49a3a', 0.6, 0.62),
      box(0.02, 0.9, 0.11, '#7a7a6a', 0.75, 0.25, 0, [0, 0, 0.3]),
    );
  return merge(parts);
}

/** Pieces of a broken door on the floor. */
export function brokenDoorModel(): BufferGeometry {
  return merge([
    box(0.4, 0.04, 0.3, '#4a3826', 0.25, 0, 0.1, [0, 0.3, 0]),
    box(0.35, 0.04, 0.22, '#4a3826', 0.7, 0, -0.15, [0, -0.5, 0]),
    box(0.12, 0.03, 0.08, '#3a2c1c', 0.5, 0, 0.3, [0, 1.2, 0]),
  ]);
}

/** Generic dropped item: a small parcel tinted by category. */
export function itemModel(color: string): BufferGeometry {
  return merge([
    box(0.24, 0.1, 0.18, color, 0, 0, 0, [0, 0.4, 0]),
    box(0.12, 0.06, 0.1, '#b8b0a0', 0.03, 0.1, 0.0),
  ]);
}

// ---------------------------------------------------------------- world pieces

/** A tree: trunk and a separate canopy (canopies are hidden near the player). */
export function treeTrunk(): BufferGeometry {
  return merge([cyl(0.07, 0.11, 1.3, '#3a2c20', 0, 0, 0, 7)]);
}
export function treeCanopy(): BufferGeometry {
  return merge([
    part(new IcosahedronGeometry(0.62, 0), '#2a3a26', { at: [0, 1.75, 0] }),
    part(new IcosahedronGeometry(0.45, 0), '#344a2e', { at: [0.25, 2.0, 0.15] }),
    part(new IcosahedronGeometry(0.4, 0), '#2e4228', { at: [-0.25, 1.55, -0.2] }),
  ]);
}
export function bushModel(): BufferGeometry {
  return merge([
    part(new IcosahedronGeometry(0.34, 0), '#32412a', { at: [-0.12, 0.3, 0.05] }),
    part(new IcosahedronGeometry(0.3, 0), '#384830', { at: [0.15, 0.28, -0.1] }),
    part(new IcosahedronGeometry(0.26, 0), '#2d3f22', { at: [0.05, 0.42, 0.12] }),
  ]);
}
export function counterModel(): BufferGeometry {
  return merge([box(1.0, 0.86, 1.0, '#584a3a', 0, 0), box(1.02, 0.06, 1.02, '#6e6150', 0, 0.86)]);
}
export function rubbleModel(seed: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4; i++) {
    const c = ['#6c6861', '#5e5952', '#46423d'][i % 3]!;
    parts.push(
      box(0.1 + r() * 0.2, 0.05 + r() * 0.12, 0.1 + r() * 0.2, c, (r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7, [
        0,
        r() * 3,
        0,
      ]),
    );
  }
  return merge(parts);
}

/** Flat ring on the ground (pickup glints, decoy pulses, objective rings). */
export function ringGeometry(): BufferGeometry {
  const g = new CylinderGeometry(0.5, 0.5, 0.01, 24, 1, true);
  return g;
}

export function coneGeometry(): BufferGeometry {
  return new ConeGeometry(0.5, 1, 12, 1, true);
}
