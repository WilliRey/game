/**
 * Procedural placeholder art, drawn with Canvas 2D at boot and registered under the keys in `manifest.ts`.
 * Mood: dark, desaturated surfaces; warm light comes from light sources, not from the textures.
 * Any key that already exists in the texture manager (a real sprite loaded in preload) is left alone.
 */
import type Phaser from 'phaser';
import type { TileKind } from '@/content/schemas';
import { TILE_KINDS } from '@/sim/tiles';
import {
  ART,
  CONTAINER_TYPES,
  ITEM_ICON_CATEGORIES,
  STATION_KINDS,
  THROWN_ITEMS,
  TILE_SIZE,
  TILE_VARIANTS,
  ZOMBIE_TYPES,
} from './manifest';

type Ctx = CanvasRenderingContext2D;
type Draw = (g: Ctx, w: number, h: number) => void;

function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  // CPU-backed canvases: they're painted once and uploaded as textures, and a GPU-backed 2D canvas would
  // need a slow GPU readback per upload (minutes of boot under software WebGL).
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  return [c, g];
}

/** Draws a texture into a fresh canvas; also used by the zone chunk renderer for tiles. */
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

function circle(g: Ctx, x: number, y: number, r: number, fill: string, stroke?: string, lw = 1) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = lw;
    g.stroke();
  }
}

function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, fill: string) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

// ---------------------------------------------------------------- tiles

/** Tiles drawn on top of whatever ground surrounds them (the map renderer draws that ground first). */
export const OVERLAY_TILES: ReadonlySet<TileKind> = new Set<TileKind>([
  'glass',
  'door',
  'lockedDoor',
  'fence',
  'tree',
  'bush',
  'counter',
  'rubble',
]);

export function drawTile(g: Ctx, kind: TileKind, variant: number): void {
  const S = TILE_SIZE;
  const r = rand(variant * 7919 + kind.length * 104729 + kind.charCodeAt(0));
  switch (kind) {
    case 'void':
      rect(g, 0, 0, S, S, '#0a0a0b');
      break;
    case 'wall':
      rect(g, 0, 0, S, S, '#50555b');
      speckle(g, S, S, r, ['#5e646c', '#42474c'], 26);
      g.fillStyle = 'rgba(255,255,255,0.04)';
      g.fillRect(0, 0, S, 2);
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
      if (variant % 2 === 0) {
        g.strokeStyle = 'rgba(20,20,20,0.45)';
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
    case 'glass':
      for (let i = 0; i < 7; i++) {
        g.fillStyle = `rgba(170,195,210,${0.35 + r() * 0.35})`;
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
      for (let i = 0; i < 6; i++) {
        g.fillStyle = ['#6c6861', '#5e5952', '#46423d'][i % 3] ?? '#444';
        g.fillRect(r() * 26, r() * 26, 3 + r() * 6, 3 + r() * 5);
      }
      break;
    case 'water':
      rect(g, 0, 0, S, S, '#25343f');
      g.strokeStyle = 'rgba(120,150,170,0.18)';
      for (let i = 0; i < 4; i++) {
        const y = 4 + i * 8 + r() * 3;
        g.beginPath();
        g.moveTo(r() * 8, y);
        g.quadraticCurveTo(16, y - 3, 24 + r() * 8, y);
        g.stroke();
      }
      break;
    case 'window':
      rect(g, 0, 0, S, S, '#50555b');
      rect(g, 3, 11, S - 6, 10, 'rgba(110,140,160,0.55)', '#3a3d42', 2);
      g.strokeStyle = 'rgba(220,230,240,0.25)';
      g.beginPath();
      g.moveTo(7, 19);
      g.lineTo(13, 13);
      g.stroke();
      break;
    case 'counter':
      rect(g, 2, 2, S - 4, S - 4, '#645543', '#382f25', 2);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(4, 4, S - 8, 3);
      break;
    case 'fence':
      g.strokeStyle = 'rgba(140,145,150,0.75)';
      g.lineWidth = 1;
      for (let i = -S; i < S; i += 6) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + S, S);
        g.stroke();
        g.beginPath();
        g.moveTo(i + S, 0);
        g.lineTo(i, S);
        g.stroke();
      }
      break;
    case 'tree':
      circle(g, 16, 17, 14, '#2a3525');
      circle(g, 13, 14, 10, '#32412c');
      circle(g, 19, 12, 7, '#3b4b34');
      break;
    case 'bush':
      circle(g, 11, 18, 9, '#32412a');
      circle(g, 21, 15, 9, '#384830');
      circle(g, 16, 22, 8, '#2d3f22');
      break;
    case 'stairs':
      rect(g, 0, 0, S, S, '#4c4d4d');
      for (let y = 2; y < S; y += 6) {
        g.fillStyle = `rgba(0,0,0,${0.15 + y / 80})`;
        g.fillRect(2, y, S - 4, 3);
      }
      break;
    case 'door':
    case 'lockedDoor':
      break;
  }
}

// ---------------------------------------------------------------- actors

function humanoid(g: Ctx, s: number, body: string, shoulders: string, head: string, accent?: string) {
  const c = s / 2;
  const k = s / 32;
  ellipse(g, c - 1 * k, c, 7 * k, 11 * k, shoulders);
  ellipse(g, c - 1 * k, c, 6 * k, 9.5 * k, body);
  if (accent) {
    g.fillStyle = accent;
    g.fillRect(c - 4 * k, c - 9 * k, 2 * k, 18 * k);
  }
  // arms forward (+x)
  g.fillStyle = shoulders;
  g.fillRect(c, c - 8 * k, 8 * k, 3 * k);
  g.fillRect(c, c + 5 * k, 8 * k, 3 * k);
  circle(g, c + 1 * k, c, 5 * k, head, 'rgba(0,0,0,0.4)', 1);
}

function zombie(g: Ctx, s: number, type: string) {
  const c = s / 2;
  const k = s / 32;
  const pal: Record<string, [string, string, string]> = {
    walker: ['#55604c', '#434c3b', '#7f8a6c'],
    runner: ['#6a5a4b', '#544638', '#8c7d66'],
    bloater: ['#6c7a45', '#556135', '#8e9a62'],
    bloater_boss: ['#5f6d38', '#4a552a', '#86924f'],
    screamer: ['#6e5664', '#56434e', '#957a88'],
  };
  const [body, dark, head] = pal[type] ?? pal.walker!;
  if (type === 'bloater' || type === 'bloater_boss') {
    circle(g, c - 1 * k, c, 12 * k, dark);
    circle(g, c - 1 * k, c, 10.5 * k, body);
    const r = rand(type.length * 31);
    for (let i = 0; i < 6; i++)
      circle(g, c + (r() - 0.6) * 16 * k, c + (r() - 0.5) * 16 * k, 2 * k, '#a3b06a');
    g.fillStyle = dark;
    g.fillRect(c + 4 * k, c - 9 * k, 9 * k, 4 * k);
    g.fillRect(c + 4 * k, c + 5 * k, 9 * k, 4 * k);
    circle(g, c + 3 * k, c, 5 * k, head, 'rgba(0,0,0,0.5)', 1);
    return;
  }
  const thin = type === 'runner' ? 0.85 : 1;
  ellipse(g, c - 1 * k, c, 6.5 * k * thin, 10.5 * k, dark);
  ellipse(g, c - 1 * k, c, 5.5 * k * thin, 9 * k, body);
  // reaching arms
  g.fillStyle = dark;
  g.fillRect(c + 1 * k, c - 8 * k, 11 * k, 3 * k);
  g.fillRect(c + 1 * k, c + 5 * k, 11 * k, 3 * k);
  circle(g, c + 2 * k, c, 5 * k, head, 'rgba(0,0,0,0.5)', 1);
  if (type === 'screamer') circle(g, c + 5 * k, c, 2 * k, '#2a1a1f');
  // blood stains
  g.fillStyle = 'rgba(80,15,15,0.6)';
  g.fillRect(c - 4 * k, c + 2 * k, 3 * k, 3 * k);
}

function corpse(g: Ctx, s: number, type: string) {
  const c = s / 2;
  g.fillStyle = 'rgba(60,10,10,0.55)';
  g.beginPath();
  g.ellipse(c, c, s * 0.42, s * 0.3, 0.3, 0, Math.PI * 2);
  g.fill();
  const tone = type.startsWith('bloater') ? '#4f5a33' : '#3d4436';
  ellipse(g, c - 2, c, s * 0.18, s * 0.28, tone);
  circle(g, c + s * 0.18, c - s * 0.05, s * 0.11, '#56604a');
}

// ---------------------------------------------------------------- containers & stations

const CONTAINER_SIZE: Record<string, [number, number]> = {
  car_trunk: [64, 96],
  dumpster: [64, 32],
  bus: [96, 320],
};

function container(g: Ctx, w: number, h: number, type: string) {
  const r = rand(type.length * 977);
  switch (type) {
    case 'fridge':
      rect(g, 3, 3, w - 6, h - 6, '#7d807b', '#4b4d4a', 2);
      g.fillStyle = '#5c5e5a';
      g.fillRect(5, 13, w - 10, 2);
      g.fillRect(w - 9, 6, 2, 5);
      break;
    case 'cabinet':
      rect(g, 2, 4, w - 4, h - 8, '#5a4532', '#33271c', 2);
      g.fillStyle = '#33271c';
      g.fillRect(w / 2 - 1, 5, 2, h - 10);
      circle(g, w / 2 - 4, h / 2, 1.5, '#9a8a60');
      circle(g, w / 2 + 4, h / 2, 1.5, '#9a8a60');
      break;
    case 'medicine_cabinet':
      rect(g, 5, 5, w - 10, h - 10, '#a7a9a4', '#62645f', 2);
      g.fillStyle = '#8c3a3a';
      g.fillRect(w / 2 - 2, 9, 4, h - 18);
      g.fillRect(9, h / 2 - 2, w - 18, 4);
      break;
    case 'toolbox':
      rect(g, 4, 9, w - 8, h - 16, '#7a3b31', '#45201a', 2);
      g.strokeStyle = '#2a2a2a';
      g.lineWidth = 2;
      g.strokeRect(11, 6, w - 22, 5);
      break;
    case 'desk':
      rect(g, 1, 4, w - 2, h - 8, '#55432f', '#2f251a', 2);
      rect(g, 6, 8, 10, 8, '#c9c0aa');
      rect(g, 18, 10, 8, 6, '#b3ab97');
      break;
    case 'locker':
    case 'gun_locker':
      rect(g, 3, 2, w - 6, h - 4, type === 'locker' ? '#4c5661' : '#2f3337', '#262b30', 2);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      for (let y = 6; y < 14; y += 3) g.fillRect(8, y, w - 16, 1);
      if (type === 'gun_locker') circle(g, w / 2, h - 10, 2.5, '#a08a3a');
      break;
    case 'car_trunk': {
      g.save();
      rect(g, 6, 4, w - 12, h - 8, '#4f555c', '#2e3237', 2);
      rect(g, 10, 16, w - 20, 16, '#1c2328');
      rect(g, 10, h - 26, w - 20, 12, '#1c2328');
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `rgba(110,60,30,${0.3 + r() * 0.3})`;
        g.fillRect(8 + r() * (w - 20), 8 + r() * (h - 20), 3 + r() * 6, 2 + r() * 5);
      }
      g.fillStyle = 'rgba(160,190,210,0.2)';
      g.fillRect(12, 18, 8, 4);
      g.restore();
      break;
    }
    case 'bus': {
      rect(g, 3, 3, w - 6, h - 6, '#6e6a4e', '#3a382a', 3);
      rect(g, 10, 12, w - 20, 26, '#1c2328');
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 50; y < h - 20; y += 34) g.fillRect(8, y, w - 16, 3);
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(110,60,30,${0.25 + r() * 0.3})`;
        g.fillRect(6 + r() * (w - 16), 6 + r() * (h - 16), 4 + r() * 8, 3 + r() * 6);
      }
      break;
    }
    case 'dumpster':
      rect(g, 2, 3, w - 4, h - 6, '#2f4a3a', '#1c2c23', 2);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(w / 2 - 1, 4, 2, h - 8);
      break;
    case 'corpse':
      corpse(g, w, 'human');
      g.fillStyle = '#4b4033';
      g.fillRect(w / 2 - 6, h / 2 - 3, 8, 6);
      break;
    case 'shelf':
    case 'pharmacy_shelf':
      rect(g, 1, 3, w - 2, h - 6, type === 'shelf' ? '#4a4c4f' : '#8a8c88', '#2b2c2e', 2);
      for (let i = 0; i < 6; i++) {
        g.fillStyle =
          type === 'shelf'
            ? ['#6a4a3a', '#4a5a6a', '#6a6a3a'][i % 3]!
            : ['#c9c9c4', '#7a9aaa', '#aa6a6a'][i % 3]!;
        g.fillRect(4 + (i % 3) * 9, 6 + Math.floor(i / 3) * 11, 7, 8);
      }
      break;
    case 'crate':
      rect(g, 3, 3, w - 6, h - 6, '#5f4b31', '#33281a', 2);
      g.strokeStyle = '#3c3020';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(5, 5);
      g.lineTo(w - 5, h - 5);
      g.moveTo(w - 5, 5);
      g.lineTo(5, h - 5);
      g.stroke();
      break;
    case 'wardrobe':
      rect(g, 2, 2, w - 4, h - 4, '#3f3023', '#221a12', 2);
      g.fillStyle = '#221a12';
      g.fillRect(w / 2 - 1, 3, 2, h - 6);
      break;
    case 'register':
      rect(g, 6, 8, w - 12, h - 14, '#3b3e42', '#1f2124', 2);
      rect(g, 9, 10, w - 18, 5, '#6a8a6a');
      break;
    case 'hospital_cart':
      rect(g, 4, 6, w - 8, h - 12, '#7d8186', '#4a4d51', 2);
      rect(g, 8, 10, 8, 6, '#c9c9c4');
      rect(g, 18, 10, 6, 10, '#9aaab0');
      break;
    default:
      rect(g, 4, 4, w - 8, h - 8, '#555', '#333', 2);
  }
}

function station(g: Ctx, w: number, h: number, kind: string) {
  switch (kind) {
    case 'workbench':
      rect(g, 1, 4, w - 2, h - 8, '#6a5135', '#3a2c1c', 2);
      rect(g, 4, 7, 7, 6, '#4f5357');
      g.fillStyle = '#7d8186';
      g.fillRect(14, 9, 12, 2);
      g.fillRect(14, 14, 9, 2);
      circle(g, 25, 20, 3, '#9a4a3a');
      break;
    case 'stove':
      rect(g, 2, 2, w - 4, h - 4, '#2c2d2f', '#151617', 2);
      for (const [x, y] of [
        [10, 10],
        [22, 10],
        [10, 22],
        [22, 22],
      ] as const)
        circle(g, x, y, 4, '#1a1a1a', '#555', 1.5);
      break;
    case 'reloading':
      rect(g, 1, 5, w - 2, h - 10, '#4d4439', '#2a241d', 2);
      rect(g, 12, 3, 8, 14, '#5d6268', '#33363a', 1);
      circle(g, 8, 20, 2, '#b08a3a');
      circle(g, 13, 22, 2, '#b08a3a');
      break;
    case 'stash':
      rect(g, 2, 5, w - 4, h - 10, '#4a3f2f', '#2a231a', 2);
      g.fillStyle = '#2a231a';
      g.fillRect(2, 12, w - 4, 2);
      circle(g, w / 2, 18, 2.5, '#a08a3a');
      break;
    case 'bed':
      rect(g, 3, 1, w - 6, h - 2, '#3b3f44', '#22252a', 2);
      rect(g, 6, 4, w - 12, 8, '#8a8678');
      rect(g, 5, 14, w - 10, h - 17, '#4a5a4a');
      break;
    case 'rainCollector':
      circle(g, w / 2, h / 2, 12, '#2f444e', '#1c2a31', 2);
      circle(g, w / 2, h / 2, 8, '#1d2c34');
      g.fillStyle = 'rgba(120,160,180,0.4)';
      g.fillRect(w / 2 - 6, h / 2 - 1, 12, 2);
      break;
    case 'campfire':
      circle(g, w / 2, h / 2, 12, '#3a3a3a', '#222', 2);
      circle(g, w / 2, h / 2, 8, '#d0702a');
      circle(g, w / 2, h / 2, 5, '#f0b050');
      break;
    case 'radio':
      rect(g, 4, 8, w - 8, h - 14, '#3b3226', '#1f1a14', 2);
      circle(g, 12, 18, 4, '#20201c', '#8a7a50', 1);
      rect(g, 19, 14, 7, 3, '#c09040');
      g.strokeStyle = '#777';
      g.beginPath();
      g.moveTo(w - 8, 8);
      g.lineTo(w - 3, 1);
      g.stroke();
      break;
  }
}

function door(g: Ctx, w: number, h: number, state: 'closed' | 'open' | 'broken' | 'locked') {
  // Horizontal door (spans x). The renderer rotates it for doors in vertical walls.
  if (state === 'open') {
    rect(g, 1, 1, 6, h - 2, '#5c4630', '#2e2318', 1);
    return;
  }
  if (state === 'broken') {
    g.fillStyle = '#4a3826';
    g.fillRect(1, h / 2 - 3, 9, 6);
    g.fillRect(w - 11, h / 2 - 2, 10, 5);
    for (let i = 0; i < 5; i++) g.fillRect(10 + i * 3, h / 2 - 1 + (i % 2) * 3, 3, 2);
    return;
  }
  rect(g, 0, h / 2 - 5, w, 10, '#5c4630', '#2e2318', 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(w / 2 - 1, h / 2 - 4, 2, 8);
  if (state === 'locked') {
    rect(g, w / 2 + 4, h / 2 - 4, 7, 8, '#b49a3a', '#5c4c1c', 1);
  } else {
    circle(g, w - 7, h / 2, 1.5, '#a09060');
  }
}

function itemIcon(g: Ctx, w: number, cat: string) {
  const c = w / 2;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(c, c + 6, 9, 3, 0, 0, Math.PI * 2);
  g.fill();
  switch (cat) {
    case 'food':
      rect(g, c - 5, c - 6, 10, 12, '#8a7a5a', '#4a3f2a', 1);
      g.fillStyle = '#a04a3a';
      g.fillRect(c - 5, c - 2, 10, 4);
      break;
    case 'drink':
      rect(g, c - 3, c - 8, 6, 15, 'rgba(140,175,200,0.85)', '#3a5060', 1);
      break;
    case 'medical':
      rect(g, c - 6, c - 5, 12, 10, '#c9c9c4', '#7a7a76', 1);
      g.fillStyle = '#a03a3a';
      g.fillRect(c - 1, c - 4, 2, 8);
      g.fillRect(c - 4, c - 1, 8, 2);
      break;
    case 'ammo':
      for (let i = 0; i < 3; i++) rect(g, c - 6 + i * 4, c - 5, 3, 10, '#b08a3a', '#6a5020', 1);
      break;
    case 'weapon':
      g.save();
      g.translate(c, c);
      g.rotate(-0.6);
      rect(g, -10, -2, 20, 4, '#8a8d90', '#4a4d50', 1);
      rect(g, -10, -3, 6, 6, '#5a4630');
      g.restore();
      break;
    case 'throwable':
      rect(g, c - 3, c - 7, 6, 13, 'rgba(90,130,80,0.85)', '#2a3a20', 1);
      break;
    case 'fuel':
      rect(g, c - 6, c - 7, 12, 14, '#8a2f24', '#4a1712', 1);
      break;
    case 'note':
    case 'blueprint':
      rect(g, c - 6, c - 7, 12, 14, cat === 'note' ? '#cfc6b0' : '#4a6a9a', '#6a6250', 1);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      for (let y = -4; y < 6; y += 3) g.fillRect(c - 4, c + y, 8, 1);
      break;
    case 'quest':
      rect(g, c - 6, c - 6, 12, 12, '#c9a03a', '#6a5010', 1);
      break;
    default:
      rect(g, c - 6, c - 5, 12, 10, '#6b5a43', '#3a2f22', 1);
  }
}

// ---------------------------------------------------------------- fx & props

function radial(g: Ctx, w: number, h: number, stops: [number, string][]) {
  const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

function blood(g: Ctx, w: number, h: number, v: number) {
  const r = rand(v * 131 + 7);
  g.fillStyle = 'rgba(92,18,18,0.85)';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.arc(w / 2 + (r() - 0.5) * w * 0.6, h / 2 + (r() - 0.5) * h * 0.6, 1.5 + r() * 5, 0, Math.PI * 2);
    g.fill();
  }
}

function skyline(g: Ctx, w: number, h: number) {
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#07080b');
  sky.addColorStop(0.6, '#14161b');
  sky.addColorStop(1, '#1d1a17');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  radial(g, 260, 260, [
    [0, 'rgba(200,190,170,0.18)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  const r = rand(4242);
  let x = 0;
  while (x < w) {
    const bw = 40 + r() * 90;
    const bh = h * (0.25 + r() * 0.45);
    g.fillStyle = r() < 0.5 ? '#0b0c0f' : '#0e0f13';
    g.fillRect(x, h - bh, bw, bh);
    for (let wy = h - bh + 10; wy < h - 12; wy += 14) {
      for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
        if (r() < 0.06) {
          g.fillStyle = `rgba(230,160,80,${0.35 + r() * 0.4})`;
          g.fillRect(wx, wy, 5, 7);
        }
      }
    }
    x += bw + 2 + r() * 6;
  }
}

// ---------------------------------------------------------------- registry

export function generatePlaceholders(scene: Phaser.Scene): void {
  const tm = scene.textures;
  const add = (key: string, w: number, h: number, draw: Draw) => {
    if (tm.exists(key)) return;
    tm.addCanvas(key, paint(w, h, draw));
  };
  const S = TILE_SIZE;
  for (const kind of TILE_KINDS) {
    for (let v = 0; v < TILE_VARIANTS; v++) add(ART.tile(kind, v), S, S, (g) => drawTile(g, kind, v));
  }
  add(ART.player, S, S, (g, w) => humanoid(g, w, '#3f5a73', '#2c3f52', '#b59a80', '#c07a2a'));
  add(ART.npc, S, S, (g, w) => humanoid(g, w, '#d8d8d8', '#a8a8a8', '#b59a80'));
  for (const t of ZOMBIE_TYPES) {
    const size = t === 'bloater_boss' ? 72 : t === 'bloater' ? 40 : S;
    add(ART.zombie(t), size, size, (g, w) => zombie(g, w, t));
    add(ART.corpse(t), size, size, (g, w) => corpse(g, w, t));
  }
  for (const t of CONTAINER_TYPES) {
    const [w, h] = CONTAINER_SIZE[t] ?? [S, S];
    add(ART.container(t), w, h, (g) => container(g, w, h, t));
  }
  for (const k of STATION_KINDS) add(ART.station(k), S, S, (g, w, h) => station(g, w, h, k));
  for (const st of ['closed', 'open', 'broken', 'locked'] as const)
    add(ART.door(st), S, S, (g, w, h) => door(g, w, h, st));
  for (const c of ITEM_ICON_CATEGORIES) add(ART.item(c), S, S, (g, w) => itemIcon(g, w, c));
  for (const id of THROWN_ITEMS) {
    add(ART.thrown(id), 16, 16, (g) => {
      const col = id === 'pipe_bomb' ? '#5d6268' : id === 'molotov' ? '#6a8a50' : 'rgba(120,160,110,0.9)';
      rect(g, 5, 2, 6, 12, col, '#222', 1);
      if (id === 'molotov') circle(g, 8, 2, 3, '#f0a040');
    });
  }
  for (let v = 0; v < 4; v++) add(ART.blood(v), S, S, (g, w, h) => blood(g, w, h, v));
  add(ART.glassDecal, S, S, (g) => drawTile(g, 'glass', 1));
  add(ART.scorch, 64, 64, (g, w, h) =>
    radial(g, w, h, [
      [0, 'rgba(10,8,6,0.85)'],
      [0.7, 'rgba(20,15,10,0.4)'],
      [1, 'rgba(0,0,0,0)'],
    ]),
  );
  add(ART.light, 128, 128, (g, w, h) =>
    radial(g, w, h, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  add(ART.muzzle, 32, 16, (g) => {
    g.fillStyle = 'rgba(255,230,160,0.95)';
    g.beginPath();
    g.moveTo(0, 8);
    g.lineTo(32, 0);
    g.lineTo(24, 8);
    g.lineTo(32, 16);
    g.closePath();
    g.fill();
    circle(g, 4, 8, 4, '#fff6d8');
  });
  add(ART.gas, 64, 64, (g, w, h) =>
    radial(g, w, h, [
      [0, 'rgba(150,180,70,0.55)'],
      [0.6, 'rgba(120,150,50,0.3)'],
      [1, 'rgba(0,0,0,0)'],
    ]),
  );
  add(ART.fire, 32, 32, (g, w, h) =>
    radial(g, w, h, [
      [0, 'rgba(255,230,140,1)'],
      [0.4, 'rgba(240,130,40,0.8)'],
      [1, 'rgba(120,30,0,0)'],
    ]),
  );
  add(ART.spark, 4, 4, (g) => rect(g, 0, 0, 4, 4, '#fff'));
  add(ART.ping, 32, 32, (g) => {
    g.fillStyle = 'rgba(255,255,255,1)';
    g.beginPath();
    g.moveTo(30, 16);
    g.lineTo(8, 4);
    g.lineTo(14, 16);
    g.lineTo(8, 28);
    g.closePath();
    g.fill();
  });
  add(ART.marker, 24, 24, (g) => {
    g.fillStyle = '#e0b040';
    g.strokeStyle = '#3a2a00';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(12, 1);
    g.lineTo(23, 12);
    g.lineTo(12, 23);
    g.lineTo(1, 12);
    g.closePath();
    g.fill();
    g.stroke();
  });
  add(ART.ring, 64, 64, (g) => {
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(32, 32, 29, 0, Math.PI * 2);
    g.stroke();
  });
  add(ART.vehicle, 64, 128, (g, w, h) => {
    rect(g, 4, 4, w - 8, h - 8, '#a9aaa6', '#5a5b58', 2);
    rect(g, 10, 10, w - 20, 18, '#1d2429');
    g.fillStyle = '#8a3a34';
    g.fillRect(4, 56, w - 8, 8);
    g.fillRect(w / 2 - 3, 76, 6, 18);
    g.fillRect(w / 2 - 9, 82, 18, 6);
  });
  add(ART.blocker, S, S, (g, w, h) => {
    rect(g, 0, 0, w, h, '#4a4d50');
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 3; y < h; y += 5) g.fillRect(0, y, w, 1);
    g.strokeStyle = '#a0a4a8';
    g.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.ellipse(6 + i * 7, h / 2, 4, 2.5, 0, 0, Math.PI * 2);
      g.stroke();
    }
  });
  add(ART.siphon, S, S, (g) => {
    circle(g, 16, 16, 6, '#7a3a2a', '#3a1a12', 2);
    circle(g, 16, 16, 2, '#1a1a1a');
  });
  add(ART.exit, S, S, (g) => {
    g.fillStyle = 'rgba(224,176,64,0.75)';
    g.beginPath();
    g.moveTo(16, 4);
    g.lineTo(28, 16);
    g.lineTo(20, 16);
    g.lineTo(20, 28);
    g.lineTo(12, 28);
    g.lineTo(12, 16);
    g.lineTo(4, 16);
    g.closePath();
    g.fill();
  });
  add(ART.lamp, S, S, (g) => {
    circle(g, 16, 16, 6, '#3a3226', '#1a160f', 2);
    circle(g, 16, 16, 3, '#f0c070');
  });
  add(ART.interact, S, S, (g) => {
    rect(g, 6, 6, 20, 20, '#5a5040', '#2a241c', 2);
    circle(g, 16, 16, 4, '#d0b060');
  });
  add(ART.skyline, 1280, 720, skyline);
}
