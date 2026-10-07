import Phaser from 'phaser';
import type { GameStore } from '@/core/store';
import { debugInfo, devTools } from '@/dev/devtools';
import { zoneDarkness } from '@/sim/fov';
import type { Interactable } from '@/sim/interact';
import { getRuntime, type ZoneRuntime } from '@/sim/runtime';
import { stepZone } from '@/sim/step';
import type { ZoneState } from '@/sim/types';
import { TILE_SIZE } from '../art/manifest';
import { storeOf, VIEW_H, VIEW_W } from '../createGame';
import { InputTracker } from '../input';
import type { AudioManager } from '../audio/AudioManager';
import { ActorsLayer } from '../render/actors';
import { FogLayer } from '../render/fog';
import { FxLayer } from '../render/fx';
import { renderMap } from '../render/mapRenderer';
import { PropsLayer } from '../render/props';
import { WorldUi } from '../render/worldUi';

const S = TILE_SIZE;
const DEPTH = {
  map: 0,
  decals: 5,
  props: 10,
  items: 12,
  actors: 20,
  fx: 30,
  glow: 39,
  fog: 40,
  tint: 41,
  worldUi: 50,
  debug: 60,
};

/** Renders the active zone and drives its simulation. A thin layer: all rules live in `src/sim`. */
export class ZoneScene extends Phaser.Scene {
  private store!: GameStore;
  private zone!: ZoneState;
  private rt!: ZoneRuntime;
  private tracker!: InputTracker;
  private props!: PropsLayer;
  private actors!: ActorsLayer;
  private fog!: FogLayer;
  private fx!: FxLayer;
  private worldUi!: WorldUi;
  private audio: AudioManager | undefined;
  private hitStopUntil = 0;
  private tint!: Phaser.GameObjects.Rectangle;
  private debugGfx!: Phaser.GameObjects.Graphics;
  private target: Interactable | null = null;
  private offs: (() => void)[] = [];
  private fpsAcc = { t: 0, frames: 0 };

  constructor() {
    super('Zone');
  }

  create(): void {
    this.store = storeOf(this);
    const zone = this.store.state.zone;
    if (!zone) return;
    this.zone = zone;
    const content = this.store.content;
    this.rt = getRuntime(content, zone);
    this.cameras.main.setBackgroundColor('#050506');
    this.input.setDefaultCursor('crosshair');

    renderMap(this, zone, DEPTH.map);
    this.props = new PropsLayer(this, content, zone, this.rt, {
      props: DEPTH.props,
      items: DEPTH.items,
      glow: DEPTH.glow,
    });
    this.fx = new FxLayer(this, { decals: DEPTH.decals, fx: DEPTH.fx, glow: DEPTH.glow });
    this.actors = new ActorsLayer(this, content, DEPTH.actors);
    this.audio = this.registry.get('audio') as AudioManager | undefined;
    this.fog = new FogLayer(this, zone, DEPTH.fog);
    this.tint = this.add
      .rectangle(0, 0, VIEW_W, VIEW_H, 0x6c7ca8)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.tint)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setAlpha(0);
    this.worldUi = new WorldUi(this, DEPTH.worldUi);
    this.debugGfx = this.add.graphics().setDepth(DEPTH.debug);
    this.tracker = new InputTracker(this);

    const cam = this.cameras.main;
    cam.scrollX = zone.player.x * S - VIEW_W / 2;
    cam.scrollY = zone.player.y * S - VIEW_H / 2;
    this.clampCamera();

    const bus = this.store.bus;
    this.offs.push(
      bus.on('fx:shake', ({ intensity, durationMs }) => {
        if (this.store.settings.screenShake) cam.shake(durationMs, intensity);
      }),
      bus.on('fx:muzzle', ({ x, y, angle, small }) => this.fx.muzzle(x, y, angle, small)),
      bus.on('fx:spark', ({ x, y }) => this.fx.spark(x, y)),
      bus.on('fx:explosion', ({ x, y, radius }) => this.fx.explosion(x, y, radius)),
      bus.on('fx:hitstop', ({ ms }) => {
        this.hitStopUntil = performance.now() + ms;
      }),
      bus.on('fx:damageNumber', ({ x, y, amount, crit }) => {
        if (this.store.settings.damageNumbers) this.worldUi.damageNumber(x, y, amount, crit);
      }),
      bus.on('noise:emitted', ({ x, y, radius, byPlayer }) => {
        if (byPlayer || radius < 7) return;
        const p = this.zone.player;
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        if (this.rt.visible[ty * this.rt.w + tx]) return;
        if (Math.hypot(x - p.x, y - p.y) > radius * 1.5) return;
        this.worldUi.ping(p.x, p.y, x, y, radius);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    // First FOV so the opening frame isn't black.
    stepZone(this.store.ctx, this.tracker.read(S, true), 0);
  }

  private cleanup(): void {
    this.offs.forEach((o) => o());
    this.offs = [];
    this.tracker?.destroy();
    this.fog?.destroy();
  }

  override update(_time: number, deltaMs: number): void {
    const store = this.store;
    if (!this.zone || store.state?.zone !== this.zone || store.phase !== 'playing') return;
    const dt = Math.min(deltaMs, 100) / 1000;
    const t0 = performance.now();
    const input = this.tracker.read(S, store.inputCaptured);
    const frozen = store.clockStopped || performance.now() < this.hitStopUntil;
    if (!frozen) this.target = stepZone(store.ctx, input, dt).target;
    else if (store.clockStopped) this.target = null;
    const t1 = performance.now();

    const zone = this.zone;
    this.props.update(zone, store.state, dt);
    this.fx.update(zone, this.rt, frozen ? 0 : dt);
    this.audio?.setListener(zone.player.x, zone.player.y);
    this.actors.showAll = devTools.fovOff;
    this.actors.update(zone, this.rt, zone.time);
    const dark = zoneDarkness(store.ctx, this.rt);
    this.fog.enabled = !devTools.fovOff;
    this.fog.update(zone, this.rt, dark);
    this.tint.setAlpha(dark * 0.45);
    this.worldUi.update(zone, store.inputCaptured ? null : this.target);
    this.updateCamera(dt, input.aim);
    this.drawDebug();

    this.fpsAcc.t += deltaMs;
    this.fpsAcc.frames++;
    if (this.fpsAcc.t >= 500) {
      debugInfo.fps = Math.round((this.fpsAcc.frames * 1000) / this.fpsAcc.t);
      this.fpsAcc = { t: 0, frames: 0 };
    }
    debugInfo.simMs = t1 - t0;
    debugInfo.frameMs = performance.now() - t0;
    debugInfo.zombies = zone.zombies.length;
    debugInfo.awake = zone.zombies.filter((z) => z.awake).length;
    debugInfo.chasing = zone.zombies.filter((z) => z.mode === 'chase' || z.mode === 'attack').length;
    debugInfo.entities = zone.zombies.length + zone.npcs.length + zone.items.length + zone.hazards.length + 1;
    debugInfo.playerTile = `${Math.floor(zone.player.x)},${Math.floor(zone.player.y)}`;
    debugInfo.noise = zone.player.noise;
  }

  private updateCamera(dt: number, aiming: boolean): void {
    const cam = this.cameras.main;
    const p = this.zone.player;
    const ptr = this.input.activePointer;
    const k = aiming ? 0.42 : 0.16;
    let lx = (ptr.x - VIEW_W / 2) * k;
    let ly = (ptr.y - VIEW_H / 2) * k;
    const max = aiming ? 260 : 110;
    const len = Math.hypot(lx, ly);
    if (len > max) {
      lx = (lx / len) * max;
      ly = (ly / len) * max;
    }
    const tx = p.x * S + lx - VIEW_W / 2;
    const ty = p.y * S + ly - VIEW_H / 2;
    const f = 1 - Math.exp(-dt * 7);
    cam.scrollX += (tx - cam.scrollX) * f;
    cam.scrollY += (ty - cam.scrollY) * f;
    this.clampCamera();
  }

  private clampCamera(): void {
    const cam = this.cameras.main;
    const mw = this.zone.w * S;
    const mh = this.zone.h * S;
    cam.scrollX = mw <= VIEW_W ? (mw - VIEW_W) / 2 : Math.max(-S, Math.min(mw - VIEW_W + S, cam.scrollX));
    cam.scrollY = mh <= VIEW_H ? (mh - VIEW_H) / 2 : Math.max(-S, Math.min(mh - VIEW_H + S, cam.scrollY));
  }

  private aiLabels = new Map<string, Phaser.GameObjects.Text>();

  private drawDebug(): void {
    const g = this.debugGfx;
    g.clear();
    const on = devTools.enabled && devTools.overlay;
    const seen = new Set<string>();
    if (on) {
      for (const z of this.zone.zombies) {
        if (z.hp <= 0) continue;
        seen.add(z.id);
        let t = this.aiLabels.get(z.id);
        if (!t) {
          t = this.add
            .text(0, 0, '', {
              fontFamily: 'monospace',
              fontSize: '10px',
              color: '#9fe09a',
              backgroundColor: 'rgba(0,0,0,0.6)',
            })
            .setOrigin(0.5, 1)
            .setDepth(DEPTH.debug + 1);
          this.aiLabels.set(z.id, t);
        }
        t.setText(`${z.type} ${z.mode}${z.awake ? '' : ' zz'} ${Math.ceil(z.hp)}`).setPosition(
          z.x * S,
          z.y * S - 18,
        );
      }
    }
    for (const [id, t] of this.aiLabels) {
      if (!seen.has(id)) {
        t.destroy();
        this.aiLabels.delete(id);
      }
    }
    if (!on) return;
    for (const n of this.zone.noises) {
      g.lineStyle(1, n.byPlayer ? 0x60c0ff : 0xff8040, Math.max(0.1, n.ttl));
      g.strokeCircle(n.x * S, n.y * S, n.radius * S);
    }
    for (const z of this.zone.zombies) {
      if (z.hp <= 0) continue;
      if (z.path) {
        g.lineStyle(1, 0xffe060, 0.5);
        g.beginPath();
        g.moveTo(z.x * S, z.y * S);
        for (let i = z.pathIndex; i < z.path.length; i++) g.lineTo(z.path[i]!.x * S, z.path[i]!.y * S);
        g.strokePath();
      }
    }
  }

  /** Debug labels for zombie AI states (drawn as text objects, recreated each frame only in debug). */
  getZone(): ZoneState {
    return this.zone;
  }
}
