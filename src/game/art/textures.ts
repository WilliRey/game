/**
 * Procedural placeholder textures, painted with Canvas 2D: the floor tile atlas, wall and fence surfaces,
 * decals, particle sprites and sign labels. Mood: dark, desaturated surfaces; warm light comes from the
 * lights, not from the textures. Every texture is looked up by a key from `manifest.ts`, so a real image
 * can replace any of them (see `assets.ts`).
 */
import type { TileKind } from '@/content/schemas';
import { TILE_KINDS } from '@/sim/tiles';

type Ctx = CanvasRenderingContext2D;
export type Draw = (g: Ctx, w: number, h: number) => void;

/** Size of one tile in the floor atlas (the v1 art was authored at 32 px and is drawn scaled up). */
export const TILE_PX = 64;
const BASE_PX = 32;
export const TILE_VARIANTS = 4;
/** Pixels of padding around each atlas cell (edge pixels repeated) so mipmaps don't bleed. */
export const ATLAS_GUTTER = 4;

export function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // CPU-backed: painted once and uploaded; a GPU-backed 2D canvas needs a slow readback per upload under
  // software WebGL (DESIGN decision 48).
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

export function paint(w: number, h: number, draw: Draw): HTMLCanvasElement {
  const [c, g] = canvas(w, h);
  draw(g, w, h);
  return c;
}

function speckle(g: Ctx, w: number, h: number, r: () => number, colors: string[], count: number, size = 1.5) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)] ?? '#000';
    g.globalAlpha = 0.25 + r() * 0.35;
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

function rect(g: Ctx, x: number, y: number, w: number, h: number, fill: string, stroke?: string, lw = 1) {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }
}

// ---------------------------------------------------------------- floor tiles

/** Tiles drawn over the ground that surrounds them (glass on asphalt is asphalt with glass). */
export const OVERLAY_TILES: ReadonlySet<TileKind> = new Set<TileKind>([
  'glass',
  'door',
  'lockedDoor',
  'fence',
  'tree',
  'bush',
  'counter',
  'rubble',
  'window',
]);

/** Draws one ground tile (32 px design space; the caller scales). Overlay kinds draw only their overlay. */
export function drawTile(g: Ctx, kind: TileKind, variant: number): void {
  const S = BASE_PX;
  const r = rand(variant * 7919 + kind.length * 104729 + kind.charCodeAt(0));
  switch (kind) {
    case 'void':
    case 'wall':
      rect(g, 0, 0, S, S, '#0b0b0c');
      break;
    case 'floor': {
      rect(g, 0, 0, S, S, '#4b423a');
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      for (let y = 0; y < S; y += 8) {
        g.beginPath();
        g.moveTo(0, y + 0.5);
        g.lineTo(S, y + 0.5);
        g.stroke();
        const off = Math.floor(r() * S);
        g.beginPath();
        g.moveTo(off + 0.5, y);
        g.lineTo(off + 0.5, y + 8);
        g.stroke();
      }
      speckle(g, S, S, r, ['#595045', '#3c352d'], 18);
      break;
    }
    case 'tile':
      rect(g, 0, 0, S, S, '#585c5e');
      g.strokeStyle = 'rgba(20,20,20,0.5)';
      g.strokeRect(0.5, 0.5, 15, 15);
      g.strokeRect(16.5, 0.5, 15, 15);
      g.strokeRect(0.5, 16.5, 15, 15);
      g.strokeRect(16.5, 16.5, 15, 15);
      speckle(g, S, S, r, ['#6c6f72', '#4b4d50'], 10);
      if (variant === 3) {
        g.fillStyle = 'rgba(70,20,20,0.35)';
        g.beginPath();
        g.ellipse(10 + r() * 12, 10 + r() * 12, 6, 4, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'carpet':
      rect(g, 0, 0, S, S, '#4b4252');
      speckle(g, S, S, r, ['#584d61', '#3b3541'], 60, 1);
      break;
    case 'concrete':
      rect(g, 0, 0, S, S, '#4c4d4d');
      speckle(g, S, S, r, ['#5b5c5c', '#3d3f3f'], 30);
      // Slab joints, and the odd crack.
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(0, S - 1, S, 1);
      g.fillRect(S - 1, 0, 1, S);
      if (variant === 0) {
        g.strokeStyle = 'rgba(20,20,20,0.3)';
        g.beginPath();
        let x = r() * S;
        g.moveTo(x, 0);
        for (let y = 0; y <= S; y += 8) {
          x += (r() - 0.5) * 8;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    case 'road':
      rect(g, 0, 0, S, S, '#363739');
      speckle(g, S, S, r, ['#424446', '#2b2c2e', '#4a4844'], 40, 1.2);
      if (variant === 2) {
        // A faint oil stain.
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.beginPath();
        g.ellipse(8 + r() * 16, 8 + r() * 16, 9, 5, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case 'grass':
      rect(g, 0, 0, S, S, '#3a4634');
      g.strokeStyle = 'rgba(70,90,55,0.55)';
      for (let i = 0; i < 18; i++) {
        const x = r() * S;
        const y = r() * S;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 3);
        g.stroke();
      }
      break;
    case 'dirt':
      rect(g, 0, 0, S, S, '#4b4035');
      speckle(g, S, S, r, ['#594a3b', '#383027'], 34, 2);
      break;
    case 'water':
      rect(g, 0, 0, S, S, '#1d2a33');
      g.strokeStyle = 'rgba(120,150,170,0.18)';
      for (let i = 0; i < 4; i++) {
        const y = 4 + i * 8 + r() * 3;
        g.beginPath();
        g.moveTo(r() * 8, y);
        g.quadraticCurveTo(16, y - 3, 24 + r() * 8, y);
        g.stroke();
      }
      break;
    case 'stairs':
      rect(g, 0, 0, S, S, '#4c4d4d');
      for (let y = 2; y < S; y += 6) {
        g.fillStyle = `rgba(0,0,0,${0.15 + y / 80})`;
        g.fillRect(2, y, S - 4, 3);
      }
      break;
    case 'glass':
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(170,195,210,${0.45 + r() * 0.4})`;
        const x = r() * S;
        const y = r() * S;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 2 + r() * 4, y + r() * 3);
        g.lineTo(x + r() * 2, y + 2 + r() * 4);
        g.closePath();
        g.fill();
      }
      break;
    case 'rubble':
      for (let i = 0; i < 8; i++) {
        g.fillStyle = ['#6c6861', '#5e5952', '#46423d'][i % 3] ?? '#444';
        g.fillRect(r() * 26, r() * 26, 2 + r() * 5, 2 + r() * 4);
      }
      break;
    default:
      break;
  }
}

/** Atlas cell index for a tile kind and variant (overlays and grounds share the atlas). */
export function atlasCell(kind: TileKind, variant: number): number {
  return TILE_KINDS.indexOf(kind) * TILE_VARIANTS + (variant % TILE_VARIANTS);
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  cols: number;
  rows: number;
  /** Size of one cell including gutters. */
  cell: number;
}

/**
 * Every tile kind × variant in one padded atlas (overlay kinds on a transparent background). The 2D
 * fallback renderer draws from it too.
 */
export function buildTileAtlas(): Atlas {
  const cell = TILE_PX + ATLAS_GUTTER * 2;
  const count = TILE_KINDS.length * TILE_VARIANTS;
  const cols = 8;
  const rows = Math.ceil(count / cols);
  const [c, g] = canvas(cols * cell, rows * cell);
  const [tile, tg] = canvas(TILE_PX, TILE_PX);
  for (let i = 0; i < count; i++) {
    const kind = TILE_KINDS[Math.floor(i / TILE_VARIANTS)]!;
    const v = i % TILE_VARIANTS;
    tg.clearRect(0, 0, TILE_PX, TILE_PX);
    tg.save();
    tg.scale(TILE_PX / BASE_PX, TILE_PX / BASE_PX);
    drawTile(tg, kind, v);
    tg.restore();
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    const G = ATLAS_GUTTER;
    // Gutters: stretch the edge rows/columns outward so filtering at cell edges samples the tile itself.
    g.drawImage(tile, 0, 0, TILE_PX, 1, x + G, y, TILE_PX, G);
    g.drawImage(tile, 0, TILE_PX - 1, TILE_PX, 1, x + G, y + G + TILE_PX, TILE_PX, G);
    g.drawImage(tile, 0, 0, 1, TILE_PX, x, y + G, G, TILE_PX);
    g.drawImage(tile, TILE_PX - 1, 0, 1, TILE_PX, x + G + TILE_PX, y + G, G, TILE_PX);
    g.drawImage(tile, 0, 0, TILE_PX, TILE_PX, x + G, y + G, TILE_PX, TILE_PX);
  }
  return { canvas: c, cols, rows, cell };
}

// ---------------------------------------------------------------- surfaces

/** Interior plaster and exterior brick are one greyscale detail texture; walls are tinted per instance. */
export function wallTexture(): HTMLCanvasElement {
  return paint(64, 104, (g, w, h) => {
    const r = rand(42);
    rect(g, 0, 0, w, h, '#b9b4ab');
    // Courses of brick showing through cracked plaster.
    for (let y = 0; y < h; y += 8) {
      const off = (y / 8) % 2 ? 0 : 8;
      for (let x = -off; x < w; x += 16) {
        g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`;
        g.fillRect(x + 1, y + 1, 14, 6);
      }
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y, w, 1);
    }
    speckle(g, w, h, r, ['#8d887e', '#d2cdc3', '#6f6a62'], 120, 2);
    // Grime: darker towards the floor, streaks from the top.
    const grad = g.createLinearGradient(0, h, 0, h * 0.55);
    grad.addColorStop(0, 'rgba(30,25,20,0.45)');
    grad.addColorStop(1, 'rgba(30,25,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = `rgba(40,35,30,${0.1 + r() * 0.12})`;
      g.fillRect(r() * w, 0, 1 + r() * 2, 10 + r() * 30);
    }
  });
}

/** Chain-link panel (alpha-tested). */
export function fenceTexture(): HTMLCanvasElement {
  return paint(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(165,170,175,0.95)';
    g.lineWidth = 1.5;
    for (let i = -w; i < w * 2; i += 8) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
      g.beginPath();
      g.moveTo(i + h, 0);
      g.lineTo(i, h);
      g.stroke();
    }
    g.fillStyle = 'rgba(120,125,130,1)';
    g.fillRect(0, 0, w, 3);
  });
}

/** Lit and unlit windows for the title skyline (white = lit; tinted by the material). */
export function skylineWindows(): HTMLCanvasElement {
  return paint(64, 128, (g, w, h) => {
    const r = rand(7);
    rect(g, 0, 0, w, h, '#000');
    // Twenty-three days in, the grid is down: a rare candle or generator here and there.
    for (let y = 6; y < h - 6; y += 12)
      for (let x = 5; x < w - 5; x += 11) {
        const roll = r();
        g.fillStyle =
          roll < 0.035
            ? `rgba(255,${180 + Math.floor(r() * 60)},110,${0.65 + r() * 0.35})`
            : roll < 0.06
              ? `rgba(255,150,70,${0.25 + r() * 0.2})`
              : 'rgba(30,34,42,0.35)';
        g.fillRect(x, y, 6, 7);
      }
  });
}

// ---------------------------------------------------------------- decals & sprites

export type DecalKind = 'blood0' | 'blood1' | 'blood2' | 'blood3' | 'glass' | 'scorch' | 'pool';

export function decalTexture(kind: DecalKind): HTMLCanvasElement {
  return paint(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (kind === 'glass') {
      g.save();
      g.scale(2, 2);
      drawTile(g, 'glass', 1);
      g.restore();
      return;
    }
    if (kind === 'scorch') {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(10,8,6,0.9)');
      grad.addColorStop(0.7, 'rgba(20,15,10,0.45)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      return;
    }
    const v = kind === 'pool' ? 9 : Number(kind.slice(5));
    const r = rand(v * 131 + 17);
    const n = kind === 'pool' ? 1 : 4 + v;
    for (let i = 0; i < n; i++) {
      const big = i === 0;
      const x = w / 2 + (big ? 0 : (r() - 0.5) * w * 0.7);
      const y = h / 2 + (big ? 0 : (r() - 0.5) * h * 0.7);
      g.fillStyle = `rgba(${70 + Math.floor(r() * 30)},8,10,${big ? 0.85 : 0.6 + r() * 0.3})`;
      g.beginPath();
      g.ellipse(x, y, big ? w * 0.28 : 2 + r() * 5, big ? h * 0.2 : 2 + r() * 4, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Soft round sprite for particles, glows and smoke puffs. */
export function softDot(): HTMLCanvasElement {
  return paint(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Muzzle flash: a hot core with a few spikes (white, tinted by the material). */
export function muzzleTexture(): HTMLCanvasElement {
  return paint(64, 32, (g, w, h) => {
    const grad = g.createRadialGradient(10, h / 2, 0, 10, h / 2, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,240,200,0.9)';
    g.beginPath();
    g.moveTo(4, h / 2);
    g.lineTo(w, h / 2 - 3);
    g.lineTo(w * 0.6, h / 2);
    g.lineTo(w, h / 2 + 3);
    g.closePath();
    g.fill();
  });
}

/** Ground text for zone labels (street names, shop signs), white on transparent. */
export function labelTexture(text: string, color = '#b8ad98'): { canvas: HTMLCanvasElement; aspect: number } {
  const lines = text.split('\n');
  const font = '600 48px ui-monospace, Consolas, monospace';
  const [m] = canvas(4, 4);
  const mg = m.getContext('2d')!;
  mg.font = font;
  const width = Math.max(...lines.map((l) => mg.measureText(l).width), 10);
  const W = Math.ceil(width + 24);
  const H = lines.length * 56 + 16;
  const c = paint(W, H, (g) => {
    g.font = font;
    g.fillStyle = color;
    g.textBaseline = 'top';
    g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, W / 2, 8 + i * 56));
  });
  return { canvas: c, aspect: W / H };
}
