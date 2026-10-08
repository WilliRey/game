/**
 * Fog of war: one pixel per tile in a canvas texture, scaled up 32× with linear filtering so visibility
 * edges are soft. Never-seen tiles are black, remembered tiles dim, visible tiles lit by the FOV pass.
 */
import Phaser from 'phaser';
import type { ZoneRuntime } from '@/sim/runtime';
import type { ZoneState } from '@/sim/types';
import { TILE_SIZE } from '../art/manifest';

export class FogLayer {
  private tex: Phaser.Textures.CanvasTexture;
  private img: Phaser.GameObjects.Image;
  private data: ImageData;
  private key: string;
  enabled = true;

  constructor(
    private scene: Phaser.Scene,
    zone: ZoneState,
    depth: number,
  ) {
    this.key = `fog.${zone.zoneId}`;
    if (scene.textures.exists(this.key)) scene.textures.remove(this.key);
    this.tex = scene.textures.createCanvas(this.key, zone.w, zone.h)!;
    this.tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.data = this.tex.getContext().createImageData(zone.w, zone.h);
    this.img = scene.add.image(0, 0, this.key).setOrigin(0, 0).setScale(TILE_SIZE).setDepth(depth);
  }

  /** `dark` 0..1 (night or indoor darkness) dims even visible tiles. */
  update(zone: ZoneState, rt: ZoneRuntime, dark: number): void {
    this.img.setVisible(this.enabled);
    if (!this.enabled) return;
    const d = this.data.data;
    const ambient = 1 - 0.28 * dark;
    const n = zone.w * zone.h;
    for (let i = 0; i < n; i++) {
      let a: number;
      if (rt.visible[i]) a = 1 - rt.bright[i]! * ambient;
      else if (zone.explored[i]) a = 0.8;
      else a = 1;
      const o = i * 4;
      d[o] = 4;
      d[o + 1] = 5;
      d[o + 2] = 9;
      d[o + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
    this.tex.getContext().putImageData(this.data, 0, 0);
    this.tex.refresh();
  }

  destroy(): void {
    this.img.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
