/**
 * Everything placed in a zone that isn't an actor: containers, stations, doors, items on the ground,
 * exits, signs, blockers, fuel caps and light glows. Synced from the zone state every frame.
 */
import Phaser from 'phaser';
import type { Content } from '@/content';
import type { GameState } from '@/core/types';
import type { ZoneRuntime } from '@/sim/runtime';
import type { ZoneState } from '@/sim/types';
import { ART, TILE_SIZE } from '../art/manifest';

const S = TILE_SIZE;

interface Glow {
  img: Phaser.GameObjects.Image;
  base: number;
  flicker: boolean;
  phase: number;
}

export class PropsLayer {
  private containers = new Map<string, Phaser.GameObjects.Image>();
  private doors = new Map<string, Phaser.GameObjects.Image>();
  private items = new Map<string, Phaser.GameObjects.Image>();
  private objects = new Map<string, Phaser.GameObjects.GameObject[]>();
  private stations = new Map<string, Phaser.GameObjects.Image>();
  private glows: Glow[] = [];
  private t = 0;

  constructor(
    private scene: Phaser.Scene,
    private content: Content,
    zone: ZoneState,
    rt: ZoneRuntime,
    private depths: { props: number; items: number; glow: number },
  ) {
    for (const c of Object.values(zone.containers)) {
      const img = scene.add
        .image((c.x + c.w / 2) * S, (c.y + c.h / 2) * S, ART.container(c.type))
        .setDepth(depths.props);
      const tex = img.frame;
      const tall = tex.height > tex.width;
      if (c.w > c.h && tall) img.setRotation(Math.PI / 2);
      if (c.h > c.w && !tall && tex.width > tex.height) img.setRotation(Math.PI / 2);
      const rotated = img.rotation !== 0;
      img.setDisplaySize((rotated ? c.h : c.w) * S, (rotated ? c.w : c.h) * S);
      this.containers.set(c.id, img);
    }
    for (const s of rt.layout.stations) {
      const img = scene.add
        .image((s.x + s.w / 2) * S, (s.y + s.h / 2) * S, ART.station(s.kind))
        .setDepth(depths.props);
      img.setDisplaySize(s.w * S, s.h * S);
      this.stations.set(s.id, img);
    }
    for (const d of Object.values(zone.doors)) {
      const img = scene.add
        .image((d.x + 0.5) * S, (d.y + 0.5) * S, ART.door('closed'))
        .setDepth(depths.props + 1);
      const layoutDoor = rt.layout.doors.find((l) => l.id === d.id);
      if (layoutDoor?.vertical) img.setRotation(Math.PI / 2);
      this.doors.set(d.id, img);
    }
    for (const e of rt.layout.exits) {
      const cx = (e.x + e.w / 2) * S;
      const cy = (e.y + e.h / 2) * S;
      const arrow = scene.add.image(cx, cy, ART.exit).setDepth(depths.props).setAlpha(0.8);
      const angle =
        e.x + e.w >= zone.w - 1
          ? Math.PI / 2
          : e.x <= 1
            ? -Math.PI / 2
            : e.y <= 1
              ? 0
              : e.y + e.h >= zone.h - 1
                ? Math.PI
                : 0;
      arrow.setRotation(angle);
      const label = scene.add
        .text(cx, cy - 22, e.label ?? (e.toZone ? 'STAIRS' : 'EXIT'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#e0b040',
        })
        .setOrigin(0.5)
        .setDepth(depths.props);
      scene.tweens.add({ targets: arrow, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });
      this.objects.set(e.id, [arrow, label]);
    }
    for (const o of rt.layout.objects) {
      const cx = (o.x + o.w / 2) * S;
      const cy = (o.y + o.h / 2) * S;
      if (o.type === 'label') {
        const t = scene.add
          .text(cx, cy, o.text ?? o.label ?? '', {
            fontFamily: 'monospace',
            fontSize: '13px',
            color: o.color ?? '#b8ad98',
            align: 'center',
          })
          .setOrigin(0.5)
          .setAlpha(0.55)
          .setDepth(depths.props - 1);
        this.objects.set(o.id, [t]);
      } else if (o.type === 'blocker') {
        const parts: Phaser.GameObjects.GameObject[] = [];
        for (let y = o.y; y < o.y + o.h; y++)
          for (let x = o.x; x < o.x + o.w; x++)
            parts.push(scene.add.image((x + 0.5) * S, (y + 0.5) * S, ART.blocker).setDepth(depths.props));
        this.objects.set(o.id, parts);
      } else if (o.type === 'siphon') {
        this.objects.set(o.id, [scene.add.image(cx, cy, ART.siphon).setDepth(depths.props + 1)]);
      } else if (o.type === 'interact') {
        const key = o.label?.toLowerCase().includes('ambulance') ? ART.vehicle : ART.interact;
        const img = scene.add.image(cx, cy, key).setDepth(depths.props);
        if (key === ART.vehicle) img.setDisplaySize(o.w * S, o.h * S);
        else if (o.w > 1 || o.h > 1) img.setDisplaySize(o.w * S, o.h * S);
        this.objects.set(o.id, [img]);
      }
    }
    for (const l of rt.layout.lights) {
      const glow = scene.add
        .image(l.x * S, l.y * S, ART.light)
        .setDepth(depths.glow)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(l.color)
        .setScale((l.radius * 2 * S) / 128)
        .setAlpha(0.38);
      this.glows.push({ img: glow, base: 0.38, flicker: l.flicker, phase: Math.random() * 10 });
      scene.add
        .image(l.x * S, l.y * S, ART.lamp)
        .setDepth(depths.props)
        .setAlpha(l.flicker ? 0 : 0.9);
    }
  }

  update(zone: ZoneState, state: GameState, dt: number): void {
    this.t += dt;
    for (const c of Object.values(zone.containers)) {
      const img = this.containers.get(c.id);
      if (!img) continue;
      img.setTint(c.searched ? (c.items.length ? 0xb0aca4 : 0x6a6762) : 0xffffff);
    }
    for (const d of Object.values(zone.doors)) {
      const img = this.doors.get(d.id);
      if (!img) continue;
      const key = ART.door(d.broken ? 'broken' : d.open ? 'open' : d.locked ? 'locked' : 'closed');
      if (img.texture.key !== key) img.setTexture(key);
      img.setTint(d.hp < d.maxHp * 0.5 && !d.open ? 0xc08070 : 0xffffff);
    }
    for (const s of this.stations.keys()) {
      const img = this.stations.get(s)!;
      const kind = img.texture.key.replace('station.', '');
      if (zone.safe && kind === 'rainCollector') img.setVisible(state.base.rainCollector.built);
      if (zone.safe && kind === 'reloading') img.setVisible(state.base.reloadingBench);
    }
    // Items on the ground: add new, remove taken.
    const seen = new Set<string>();
    for (const it of zone.items) {
      seen.add(it.uid);
      let img = this.items.get(it.uid);
      if (!img) {
        const cat = this.content.items[it.stack.itemId]?.category ?? 'junk';
        img = this.scene.add
          .image(it.x * S, it.y * S, ART.item(cat))
          .setDepth(this.depths.items)
          .setScale(0.8);
        this.items.set(it.uid, img);
      }
      img.setPosition(it.x * S, it.y * S + Math.sin(this.t * 3 + it.x) * 1.5);
    }
    for (const [uid, img] of this.items) {
      if (!seen.has(uid)) {
        img.destroy();
        this.items.delete(uid);
      }
    }
    for (const o of Object.keys(zone.objects)) {
      const parts = this.objects.get(o);
      if (parts && zone.objects[o]?.removed) {
        parts.forEach((p) => p.destroy());
        this.objects.delete(o);
      }
    }
    for (const g of this.glows) {
      if (!g.flicker) continue;
      const f = Math.sin(this.t * 9 + g.phase) * 0.04 + Math.sin(this.t * 23 + g.phase * 2) * 0.03;
      g.img.setAlpha(g.base + f + (Math.random() < 0.02 ? -0.08 : 0));
    }
  }
}
