/**
 * Bakes the static tile map into 32×32-tile canvas chunks (one texture each), with wall faces and soft
 * contact shadows drawn procedurally so any tile art dropped into the manifest still reads as top-down.
 */
import type Phaser from 'phaser';
import { TILE_KINDS } from '@/sim/tiles';
import type { ZoneState } from '@/sim/types';
import type { TileKind } from '@/content/schemas';
import { ART, TILE_SIZE, TILE_VARIANTS } from '../art/manifest';
import { OVERLAY_TILES } from '../art/placeholders';

const CHUNK = 32;

function tileHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function renderMap(scene: Phaser.Scene, zone: ZoneState, depth: number): Phaser.GameObjects.Image[] {
  const S = TILE_SIZE;
  const images: Phaser.GameObjects.Image[] = [];
  const kindAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= zone.w || y >= zone.h ? 'void' : TILE_KINDS[zone.tiles[y * zone.w + x]!]!;
  const isWall = (x: number, y: number) => {
    const k = kindAt(x, y);
    return k === 'wall' || k === 'void' || k === 'window';
  };
  const source = (key: string) => scene.textures.get(key).getSourceImage() as CanvasImageSource;
  /** Ground under an overlay tile: the most common plain ground among its neighbours. */
  const groundUnder = (x: number, y: number): TileKind => {
    const counts = new Map<TileKind, number>();
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, -1],
      [1, -1],
      [-1, 1],
    ] as const) {
      const k = kindAt(x + dx, y + dy);
      if (OVERLAY_TILES.has(k) || k === 'wall' || k === 'void' || k === 'window' || k === 'water') continue;
      counts.set(k, (counts.get(k) ?? 0) + (dx === 0 || dy === 0 ? 2 : 1));
    }
    let best: TileKind = 'floor';
    let n = 0;
    for (const [k, c] of counts) if (c > n) [best, n] = [k, c];
    return best;
  };

  for (let cy = 0; cy * CHUNK < zone.h; cy++) {
    for (let cx = 0; cx * CHUNK < zone.w; cx++) {
      const tw = Math.min(CHUNK, zone.w - cx * CHUNK);
      const th = Math.min(CHUNK, zone.h - cy * CHUNK);
      const canvas = document.createElement('canvas');
      canvas.width = tw * S;
      canvas.height = th * S;
      const g = canvas.getContext('2d', { willReadFrequently: true })!;
      for (let ty = 0; ty < th; ty++) {
        for (let tx = 0; tx < tw; tx++) {
          const x = cx * CHUNK + tx;
          const y = cy * CHUNK + ty;
          const kind = kindAt(x, y);
          const v = tileHash(x, y) % TILE_VARIANTS;
          const px = tx * S;
          const py = ty * S;
          if (OVERLAY_TILES.has(kind)) g.drawImage(source(ART.tile(groundUnder(x, y), v)), px, py);
          g.drawImage(source(ART.tile(kind, v)), px, py);
          if (kind === 'wall') {
            // Front face where the wall meets open floor below: a darker band reads as height.
            if (!isWall(x, y + 1)) {
              g.fillStyle = 'rgba(0,0,0,0.42)';
              g.fillRect(px, py + S - 9, S, 9);
              g.fillStyle = 'rgba(255,255,255,0.05)';
              g.fillRect(px, py + S - 10, S, 1);
            }
            if (!isWall(x, y - 1)) {
              g.fillStyle = 'rgba(255,255,255,0.06)';
              g.fillRect(px, py, S, 2);
            }
          } else if (kind !== 'void') {
            // Contact shadows from neighbouring walls.
            if (isWall(x, y - 1)) shade(g, px, py, S, 'top');
            if (isWall(x - 1, y)) shade(g, px, py, S, 'left');
            if (isWall(x + 1, y)) shade(g, px, py, S, 'right');
          }
        }
      }
      const key = `zonechunk.${zone.zoneId}.${cx}.${cy}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      scene.textures.addCanvas(key, canvas);
      images.push(
        scene.add
          .image(cx * CHUNK * S, cy * CHUNK * S, key)
          .setOrigin(0, 0)
          .setDepth(depth),
      );
    }
  }
  return images;
}

function shade(
  g: CanvasRenderingContext2D,
  px: number,
  py: number,
  S: number,
  side: 'top' | 'left' | 'right',
): void {
  const d = 7;
  const grad =
    side === 'top'
      ? g.createLinearGradient(0, py, 0, py + d)
      : side === 'left'
        ? g.createLinearGradient(px, 0, px + d, 0)
        : g.createLinearGradient(px + S, 0, px + S - d, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.4)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  if (side === 'top') g.fillRect(px, py, S, d);
  else if (side === 'left') g.fillRect(px, py, d, S);
  else g.fillRect(px + S - d, py, d, S);
}
