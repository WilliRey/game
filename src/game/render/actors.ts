/**
 * The player, NPCs and zombies. Zombies are only drawn on tiles the player can currently see (brief:
 * remembered tiles show no enemies); damaged ones get a small health bar.
 */
import Phaser from 'phaser';
import type { Content } from '@/content';
import { isVisible } from '@/sim/fov';
import type { ZoneRuntime } from '@/sim/runtime';
import type { ZoneState } from '@/sim/types';
import { ART, TILE_SIZE } from '../art/manifest';

const S = TILE_SIZE;

interface ZombieSprite {
  img: Phaser.GameObjects.Image;
  type: string;
}

export class ActorsLayer {
  player: Phaser.GameObjects.Image;
  private npcs = new Map<string, { img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }>();
  private zombies = new Map<string, ZombieSprite>();
  private bars: Phaser.GameObjects.Graphics;
  /** Debug: draw zombies even when not visible. */
  showAll = false;

  constructor(
    private scene: Phaser.Scene,
    private content: Content,
    private depth: number,
  ) {
    this.player = scene.add.image(0, 0, ART.player).setDepth(depth + 2);
    this.bars = scene.add.graphics().setDepth(depth + 5);
  }

  update(zone: ZoneState, rt: ZoneRuntime, simTime: number): void {
    const p = zone.player;
    this.player.setPosition(p.x * S, p.y * S).setRotation(p.facing);
    this.player.setScale(p.crouched ? 0.88 : 1);
    if (p.hurtFlash > 0) this.player.setTint(0xff6a5a);
    else this.player.clearTint();

    const seenNpc = new Set<string>();
    for (const n of zone.npcs) {
      seenNpc.add(n.id);
      let s = this.npcs.get(n.id);
      if (!s) {
        const def = this.content.npcs[n.npcId];
        const color = Phaser.Display.Color.HexStringToColor(def?.color ?? '#9bbcd1').color;
        const img = this.scene.add
          .image(n.x * S, n.y * S, ART.npc)
          .setDepth(this.depth + 1)
          .setTint(color);
        const label = this.scene.add
          .text(n.x * S, n.y * S - 24, def?.name?.split(' ')[0] ?? n.npcId, {
            fontFamily: 'sans-serif',
            fontSize: '11px',
            color: '#d8d0c0',
          })
          .setOrigin(0.5)
          .setDepth(this.depth + 6);
        s = { img, label };
        this.npcs.set(n.id, s);
      }
      s.img.setPosition(n.x * S, n.y * S).setRotation(n.facing);
      const near = Math.hypot(p.x - n.x, p.y - n.y) < 6;
      const vis = isVisible(rt, n.x, n.y) || this.showAll;
      s.img.setVisible(vis);
      s.label.setVisible(vis && near);
    }
    for (const [id, s] of this.npcs) {
      if (!seenNpc.has(id)) {
        s.img.destroy();
        s.label.destroy();
        this.npcs.delete(id);
      }
    }

    this.bars.clear();
    const seen = new Set<string>();
    for (const z of zone.zombies) {
      if (z.hp <= 0) continue;
      seen.add(z.id);
      let s = this.zombies.get(z.id);
      if (!s) {
        s = {
          img: this.scene.add.image(z.x * S, z.y * S, ART.zombie(z.type)).setDepth(this.depth),
          type: z.type,
        };
        this.zombies.set(z.id, s);
      }
      const vis = this.showAll || isVisible(rt, z.x, z.y);
      s.img.setVisible(vis);
      if (!vis) continue;
      const wobble = z.mode === 'idle' ? 0 : Math.sin(simTime * 8 + z.x) * 0.06;
      s.img.setPosition(z.x * S, z.y * S).setRotation(z.facing + wobble);
      if (z.hitFlash > 0) s.img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      else if (z.windup > 0) s.img.setTint(0xff9070).setTintMode(Phaser.TintModes.MULTIPLY);
      else s.img.clearTint();
      if (z.hp < z.maxHp && simTime - z.damagedAt < 4) {
        const w = Math.max(18, z.maxHp > 200 ? 60 : 24);
        const x = z.x * S - w / 2;
        const y = z.y * S - (z.maxHp > 200 ? 40 : 22);
        this.bars.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, 5);
        this.bars.fillStyle(0xc0483a, 1).fillRect(x, y, w * (z.hp / z.maxHp), 3);
      }
    }
    for (const [id, s] of this.zombies) {
      if (!seen.has(id)) {
        s.img.destroy();
        this.zombies.delete(id);
      }
    }
  }
}
