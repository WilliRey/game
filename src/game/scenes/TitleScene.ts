import Phaser from 'phaser';
import { ART } from '../art/manifest';
import { VIEW_H, VIEW_W } from '../createGame';

interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

/** Backdrop behind the main menu: a dark skyline, a few warm windows that flicker, and rain. */
export class TitleScene extends Phaser.Scene {
  private rain!: Phaser.GameObjects.Graphics;
  private drops: Drop[] = [];
  private flicker!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('Title');
  }

  create(): void {
    const sky = this.add.image(VIEW_W / 2, VIEW_H / 2, ART.skyline);
    this.tweens.add({
      targets: sky,
      x: VIEW_W / 2 - 30,
      duration: 40000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.flicker = this.add.rectangle(VIEW_W * 0.72, VIEW_H * 0.62, 6, 8, 0xe6a050, 0.8);
    this.rain = this.add.graphics();
    for (let i = 0; i < 220; i++) {
      this.drops.push({
        x: Math.random() * VIEW_W,
        y: Math.random() * VIEW_H,
        speed: 500 + Math.random() * 400,
        len: 8 + Math.random() * 10,
      });
    }
  }

  override update(_t: number, dtMs: number): void {
    const dt = Math.min(dtMs, 50) / 1000;
    this.flicker.setAlpha(Math.random() < 0.03 ? 0.1 : 0.8);
    const g = this.rain;
    g.clear();
    g.lineStyle(1, 0x8090a0, 0.25);
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x -= d.speed * dt * 0.15;
      if (d.y > VIEW_H) {
        d.y = -d.len;
        d.x = Math.random() * (VIEW_W + 100);
      }
      g.lineBetween(d.x, d.y, d.x - d.len * 0.15, d.y + d.len);
    }
  }
}
