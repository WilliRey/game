/**
 * In-world feedback drawn in Phaser (brief §4): interaction prompts, the hold-action progress ring,
 * damage numbers, noise pings for loud sounds out of sight, and objective markers.
 */
import type Phaser from 'phaser';
import type { Interactable } from '@/sim/interact';
import type { ZoneState } from '@/sim/types';
import { ART, TILE_SIZE } from '../art/manifest';

const S = TILE_SIZE;

export class WorldUi {
  private prompt: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Graphics;
  private pingLayer: Phaser.GameObjects.Container;
  private marker: Phaser.GameObjects.Image;

  constructor(
    private scene: Phaser.Scene,
    private depth: number,
  ) {
    this.prompt = scene.add
      .text(0, 0, '', {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: '13px',
        color: '#f1e6cc',
        backgroundColor: 'rgba(10,10,12,0.78)',
        padding: { x: 7, y: 4 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 2)
      .setVisible(false);
    this.ring = scene.add.graphics().setDepth(depth + 3);
    this.pingLayer = scene.add
      .container(0, 0)
      .setDepth(depth + 4)
      .setScrollFactor(0);
    this.marker = scene.add
      .image(0, 0, ART.marker)
      .setDepth(depth + 1)
      .setVisible(false);
    scene.tweens.add({
      targets: this.marker,
      y: '-=6',
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  update(zone: ZoneState, target: Interactable | null): void {
    const a = zone.player.action;
    this.ring.clear();
    if (target) {
      let txt = target.disabled
        ? `${target.label} — ${target.disabled}`
        : `[${target.hold ? 'Hold E' : 'E'}] ${target.verb} ${target.verb === target.label ? '' : target.label}`.trim();
      if (target.alt && !target.disabled) txt += `\n[Shift+E] ${target.alt}`;
      this.prompt.setText(txt).setColor(target.disabled ? '#e39a8c' : '#f1e6cc');
      this.prompt.setPosition(target.x * S, target.y * S - 18).setVisible(true);
    } else this.prompt.setVisible(false);

    if (a?.kind === 'timed') {
      const x = zone.player.x * S;
      const y = zone.player.y * S - 30;
      const t = Math.min(1, a.t / a.duration);
      this.ring.lineStyle(4, 0x000000, 0.55).strokeCircle(x, y, 11);
      this.ring.lineStyle(3, 0xe0b040, 1);
      this.ring.beginPath();
      this.ring.arc(x, y, 11, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2, false);
      this.ring.strokePath();
    } else if (a?.kind === 'reload') {
      const x = zone.player.x * S;
      const y = zone.player.y * S - 30;
      const t = Math.min(1, a.t / a.duration);
      this.ring.fillStyle(0x000000, 0.6).fillRect(x - 16, y - 2, 32, 5);
      this.ring.fillStyle(0x9ac0e0, 1).fillRect(x - 15, y - 1, 30 * t, 3);
    }
  }

  /** Point to an objective location in this zone (tiles), or hide. */
  setMarker(pos: { x: number; y: number } | null): void {
    if (!pos) {
      this.marker.setVisible(false);
      return;
    }
    if (!this.marker.visible) this.marker.setPosition(pos.x * S, pos.y * S - 26);
    this.marker.x = pos.x * S;
    this.marker.setVisible(true);
  }

  damageNumber(x: number, y: number, amount: number, crit: boolean): void {
    const t = this.scene.add
      .text(x * S + (Math.random() - 0.5) * 10, y * S - 14, String(Math.round(amount)), {
        fontFamily: 'Segoe UI, sans-serif',
        fontSize: crit ? '17px' : '13px',
        fontStyle: 'bold',
        color: crit ? '#ffcf5a' : '#f2e8d8',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(this.depth + 5);
    this.scene.tweens.add({
      targets: t,
      y: t.y - 26,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /** A directional ping at the screen edge toward a loud noise the player can't see. */
  ping(fromX: number, fromY: number, toX: number, toY: number, radius: number): void {
    const cam = this.scene.cameras.main;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const r = Math.min(cx, cy) - 40;
    const arrow = this.scene.add
      .image(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, ART.ping)
      .setRotation(angle)
      .setTint(radius >= 30 ? 0xff6040 : 0xffd080)
      .setScale(radius >= 30 ? 1.2 : 0.9)
      .setAlpha(0.95);
    this.pingLayer.add(arrow);
    this.scene.tweens.add({
      targets: arrow,
      alpha: 0,
      scale: arrow.scale * 1.4,
      duration: 1300,
      onComplete: () => arrow.destroy(),
    });
  }
}
