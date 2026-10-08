/**
 * Combat feel and world effects: blood/glass/scorch decals (capped), corpses, bullet tracers, muzzle
 * flashes, sparks, explosions, thrown objects in flight, fires, gas clouds and fused pipe bombs.
 */
import Phaser from 'phaser';
import type { Decal, Hazard, ZoneState } from '@/sim/types';
import { isVisible } from '@/sim/fov';
import type { ZoneRuntime } from '@/sim/runtime';
import { ART, TILE_SIZE } from '../art/manifest';

const S = TILE_SIZE;

export class FxLayer {
  private decals = new Map<Decal, Phaser.GameObjects.Image>();
  private thrown = new Map<string, Phaser.GameObjects.Image>();
  private hazards = new Map<string, Phaser.GameObjects.Container>();
  private tracers: Phaser.GameObjects.Graphics;
  private t = 0;

  constructor(
    private scene: Phaser.Scene,
    private depths: { decals: number; fx: number; glow: number },
  ) {
    this.tracers = scene.add
      .graphics()
      .setDepth(depths.fx + 1)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  muzzle(x: number, y: number, angle: number, small: boolean): void {
    const img = this.scene.add
      .image(x * S + Math.cos(angle) * 10, y * S + Math.sin(angle) * 10, ART.muzzle)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setDepth(this.depths.fx + 2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(small ? 0.5 : 1);
    const glow = this.scene.add
      .image(x * S, y * S, ART.light)
      .setDepth(this.depths.glow)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffc070)
      .setScale(small ? 0.8 : 1.8)
      .setAlpha(0.6);
    this.scene.time.delayedCall(55, () => {
      img.destroy();
      glow.destroy();
    });
  }

  spark(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const s = this.scene.add
        .image(x * S, y * S, ART.spark)
        .setDepth(this.depths.fx + 2)
        .setTint(0xffd890)
        .setBlendMode(Phaser.BlendModes.ADD);
      const a = Math.random() * Math.PI * 2;
      this.scene.tweens.add({
        targets: s,
        x: s.x + Math.cos(a) * 14,
        y: s.y + Math.sin(a) * 14,
        alpha: 0,
        duration: 180,
        onComplete: () => s.destroy(),
      });
    }
  }

  explosion(x: number, y: number, radius: number): void {
    const ring = this.scene.add
      .image(x * S, y * S, ART.light)
      .setDepth(this.depths.fx + 3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffa040)
      .setScale(0.2);
    this.scene.tweens.add({
      targets: ring,
      scale: (radius * 2.6 * S) / 128,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 10; i++) {
      const f = this.scene.add
        .image(x * S, y * S, ART.fire)
        .setDepth(this.depths.fx + 2)
        .setBlendMode(Phaser.BlendModes.ADD);
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius * S;
      this.scene.tweens.add({
        targets: f,
        x: f.x + Math.cos(a) * d,
        y: f.y + Math.sin(a) * d,
        alpha: 0,
        scale: 1.6,
        duration: 500 + Math.random() * 300,
        onComplete: () => f.destroy(),
      });
    }
  }

  update(zone: ZoneState, rt: ZoneRuntime, dt: number): void {
    this.t += dt;
    // Decals: add new ones, drop those trimmed by the cap.
    const live = new Set(zone.decals);
    for (const d of zone.decals) {
      if (this.decals.has(d)) continue;
      let key: string;
      switch (d.kind) {
        case 'blood':
          key = ART.blood(Math.floor(d.rot * 10));
          break;
        case 'glass':
          key = ART.glassDecal;
          break;
        case 'scorch':
          key = ART.scorch;
          break;
        case 'gore':
          key = ART.corpse(d.scale > 1.8 ? 'bloater_boss' : d.scale > 1.2 ? 'bloater' : 'walker');
          break;
      }
      const img = this.scene.add
        .image(d.x * S, d.y * S, key)
        .setDepth(this.depths.decals)
        .setRotation(d.rot)
        .setAlpha(d.kind === 'gore' ? 0.95 : 0.8);
      if (d.kind === 'scorch') img.setScale(Math.max(0.6, d.scale));
      else if (d.kind === 'blood') img.setScale(d.scale);
      this.decals.set(d, img);
    }
    for (const [d, img] of this.decals) {
      if (!live.has(d)) {
        img.destroy();
        this.decals.delete(d);
      }
    }

    const g = this.tracers;
    g.clear();
    for (const tr of zone.tracers) {
      g.lineStyle(2, 0xffe2a0, Math.min(1, tr.ttl * 14));
      g.lineBetween(tr.x1 * S, tr.y1 * S, tr.x2 * S, tr.y2 * S);
    }

    const seenT = new Set<string>();
    for (const t of zone.thrown) {
      seenT.add(t.id);
      let img = this.thrown.get(t.id);
      if (!img) {
        img = this.scene.add.image(t.x0 * S, t.y0 * S, ART.thrown(t.itemId)).setDepth(this.depths.fx);
        this.thrown.set(t.id, img);
      }
      const k = Math.min(1, t.t / t.duration);
      const arc = Math.sin(k * Math.PI);
      img.setPosition((t.x0 + (t.x1 - t.x0) * k) * S, (t.y0 + (t.y1 - t.y0) * k) * S - arc * 18);
      img.setScale(1 + arc * 0.5).setRotation(this.t * 12);
    }
    for (const [id, img] of this.thrown) {
      if (!seenT.has(id)) {
        img.destroy();
        this.thrown.delete(id);
      }
    }

    const seenH = new Set<string>();
    for (const h of zone.hazards) {
      seenH.add(h.id);
      let c = this.hazards.get(h.id);
      if (!c) {
        c = this.makeHazard(h);
        this.hazards.set(h.id, c);
      }
      this.animateHazard(c, h, rt);
    }
    for (const [id, c] of this.hazards) {
      if (!seenH.has(id)) {
        c.destroy();
        this.hazards.delete(id);
      }
    }
  }

  private makeHazard(h: Hazard): Phaser.GameObjects.Container {
    const c = this.scene.add.container(h.x * S, h.y * S).setDepth(this.depths.fx);
    if (h.kind === 'fire') {
      const glow = this.scene.add
        .image(0, 0, ART.light)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xff7a20)
        .setScale(((h.radius + 2) * 2 * S) / 128)
        .setAlpha(0.45);
      c.add(glow);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = (i % 3) * 0.35 * h.radius * S;
        c.add(
          this.scene.add
            .image(Math.cos(a) * r, Math.sin(a) * r, ART.fire)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setScale(1.2),
        );
      }
    } else if (h.kind === 'gas' || h.kind === 'smoke') {
      const img = this.scene.add
        .image(0, 0, ART.gas)
        .setScale((h.radius * 2 * S) / 64)
        .setAlpha(0.8);
      if (h.kind === 'smoke') img.setTint(0x9a9a9a);
      c.add(img);
    } else {
      c.add(this.scene.add.image(0, 0, ART.thrown(h.itemId ?? 'pipe_bomb')));
      c.add(this.scene.add.circle(0, -6, 3, 0xff3020).setBlendMode(Phaser.BlendModes.ADD));
    }
    return c;
  }

  private animateHazard(c: Phaser.GameObjects.Container, h: Hazard, rt: ZoneRuntime): void {
    c.setVisible(isVisible(rt, h.x, h.y) || h.kind === 'fire');
    const fade = Math.min(1, h.ttl / 1.2);
    if (h.kind === 'fire') {
      c.list.forEach((o, i) => {
        if (i === 0) (o as Phaser.GameObjects.Image).setAlpha((0.35 + Math.sin(this.t * 13) * 0.08) * fade);
        else {
          const img = o as Phaser.GameObjects.Image;
          img.setAlpha((0.55 + Math.sin(this.t * 17 + i * 1.7) * 0.3) * fade);
          img.setScale(1 + Math.sin(this.t * 11 + i) * 0.25);
        }
      });
    } else if (h.kind === 'gas' || h.kind === 'smoke') {
      const img = c.list[0] as Phaser.GameObjects.Image;
      img.setAlpha(0.75 * fade).setRotation(this.t * 0.4);
    } else {
      const dot = c.list[1] as Phaser.GameObjects.Arc;
      dot.setVisible(Math.sin(this.t * 14) > 0);
    }
  }
}
