/**
 * The zone in 3D: builds the scene from the zone state, drives the simulation each frame (a thin layer —
 * all rules live in `src/sim`), and keeps every visual layer in sync: world, props, the player, NPCs,
 * zombies, effects, lights, line-of-sight darkness and the HTML world UI. Hit-stop, screen shake, melee
 * camera nudges and scripted camera pans happen here.
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Fog,
  Line,
  LineBasicMaterial,
  LineLoop,
  Scene,
  Vector2,
  type Texture,
  type WebGLRenderer,
} from 'three';
import type { GameStore } from '@/core/store';
import { debugInfo, devTools } from '@/dev/devtools';
import { isVisible, revealAround, zoneDarkness } from '@/sim/fov';
import type { Interactable } from '@/sim/interact';
import { getLayout } from '@/sim/layout';
import { getRuntime, type ZoneRuntime } from '@/sim/runtime';
import { stepZone } from '@/sim/step';
import type { ZoneState } from '@/sim/types';
import { activeWeapon } from '@/systems/inventory';
import { objectiveMarker } from '@/systems/markers';
import type { AudioManager } from '../audio/AudioManager';
import type { Atlas } from '../art/textures';
import { cinematics } from '../director';
import { InputTracker } from '../input';
import type { QualityTier } from '../quality';
import { CameraRig } from './zone/camera';
import { FxLayer } from './zone/fx';
import { LightRig } from './zone/lights';
import { NpcLayer } from './zone/npcs';
import { PlayerView } from './zone/player';
import { PropsLayer } from './zone/props';
import { buildWorld, type WorldMeshes } from './zone/world';
import { ZombieLayer } from './zone/zombies';
import { WorldUi } from './worldUi';
import { FogTexture, worldUniforms } from './worldMaterial';

export interface ViewContext {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  quality: QualityTier;
  audio: AudioManager | undefined;
  /** Container for the HTML world UI (sized and scaled like the Preact overlay). */
  uiHost: HTMLElement;
  atlas: Texture;
  atlasInfo: Atlas;
}

const METAL = new Set([
  'wrench',
  'lead_pipe',
  'crowbar',
  'machete',
  'fire_axe',
  'knife',
  'scalpel',
  'police_baton',
]);

export class ZoneView {
  readonly scene = new Scene();
  readonly rig = new CameraRig();
  private zone: ZoneState;
  private rt: ZoneRuntime;
  private input: InputTracker;
  private world: WorldMeshes;
  private props: PropsLayer;
  private player: PlayerView;
  private npcs: NpcLayer;
  private zombies: ZombieLayer;
  private fx: FxLayer;
  private lights: LightRig;
  private fog: FogTexture;
  private ui: WorldUi;
  private offs: (() => void)[] = [];
  private hitStopUntil = 0;
  private markerIn = 0;
  private target: Interactable | null = null;
  private pan: { x: number; y: number; t: number; dur: number; caption: string | null } | null = null;
  private fpsAcc = { t: 0, frames: 0 };
  private cutDir = new Vector2(0, -1);
  private debugLines: (Line | LineLoop)[] = [];
  private debugMat = new LineBasicMaterial({
    color: 0x60c0ff,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });

  constructor(
    private store: GameStore,
    private vc: ViewContext,
  ) {
    const zone = store.state.zone!;
    this.zone = zone;
    const content = store.content;
    this.rt = getRuntime(content, zone);
    this.scene.background = new Color('#040405');
    this.scene.fog = new Fog('#040405', 42, 70);

    this.fog = new FogTexture(zone.w, zone.h);
    this.fog.activate();
    this.world = buildWorld(zone, vc.atlas, vc.atlasInfo);
    this.props = new PropsLayer(content, zone, this.rt);
    this.player = new PlayerView();
    this.npcs = new NpcLayer(content);
    this.zombies = new ZombieLayer(content, zone);
    this.fx = new FxLayer(content, zone);
    this.lights = new LightRig(vc.quality);
    this.scene.add(
      this.world.group,
      this.props.group,
      this.player.group,
      this.npcs.group,
      this.zombies.group,
      this.fx.group,
      this.lights.group,
    );
    this.ui = new WorldUi(vc.uiHost);
    this.input = new InputTracker(vc.canvas, () => this.store.inputCaptured);
    this.rig.snap(zone.player.x, zone.player.y);

    const bus = store.bus;
    this.offs.push(
      bus.on('fx:shake', ({ intensity, durationMs }) => {
        if (this.store.settings.screenShake) this.rig.shake(intensity, durationMs);
      }),
      bus.on('fx:muzzle', ({ x, y, angle, small }) => this.fx.muzzle(x, y, angle, small)),
      bus.on('fx:spark', ({ x, y }) => this.fx.spark(x, y)),
      bus.on('fx:explosion', ({ x, y, radius }) => this.fx.explosion(x, y, radius)),
      bus.on('fx:flashbang', ({ x, y, radius }) => {
        this.fx.flashbang(x, y, radius);
        const p = this.zone.player;
        const d = Math.hypot(p.x - x, p.y - y);
        if (isVisible(this.rt, x, y) && d < radius * 3) this.ui.whiteFlash(0.85 - d / (radius * 4));
      }),
      bus.on('fx:meleeHit', ({ x, y, angle, heavy }) => {
        const w = activeWeapon(this.store.ctx);
        this.fx.meleeHit(x, y, angle, heavy, METAL.has(w?.itemId ?? ''));
        this.rig.kick(angle, heavy ? 0.22 : 0.13);
        this.player.onHit();
      }),
      bus.on('enemy:damaged', ({ x, y, amount }) => this.fx.blood(x, y, amount)),
      bus.on('enemy:killed', ({ enemyId, enemyType }) => this.zombies.onKilled(enemyId, enemyType)),
      bus.on('fx:hitstop', ({ ms }) => {
        this.hitStopUntil = performance.now() + ms;
      }),
      bus.on('fx:damageNumber', ({ x, y, amount, crit }) => {
        if (this.store.settings.damageNumbers) this.ui.damageNumber(x, y, amount, crit);
      }),
      bus.on('noise:emitted', ({ x, y, radius, byPlayer }) => {
        if (byPlayer || radius < 7) return;
        const p = this.zone.player;
        if (this.rt.visible[Math.floor(y) * this.rt.w + Math.floor(x)]) return;
        if (Math.hypot(x - p.x, y - p.y) > radius * 1.5) return;
        this.ui.ping(this.project, p.x, p.y, x, y, radius);
      }),
    );
    // First FOV so the opening frame isn't black.
    stepZone(store.ctx, this.input.read(this.aim(), true), 0);
  }

  private project = (x: number, y: number, z: number) => this.rig.project(x, y, z);

  private aim(): { x: number; y: number } {
    return this.rig.aimPoint(this.input.ndc);
  }

  /** The zone this view renders (the director rebuilds the view when it changes). */
  get zoneState(): ZoneState {
    return this.zone;
  }

  get camera() {
    return this.rig.camera;
  }

  update(dtMs: number): void {
    const store = this.store;
    if (store.state?.zone !== this.zone || store.phase !== 'playing') return;
    const dt = Math.min(dtMs, 100) / 1000;
    const t0 = performance.now();
    const input = this.input.read(this.aim(), store.inputCaptured);
    if (!this.pan && cinematics.pending && !store.clockStopped) this.startPan();
    const frozen = store.clockStopped || !!this.pan || performance.now() < this.hitStopUntil;
    if (!frozen) this.target = stepZone(store.ctx, input, dt).target;
    else if (store.clockStopped) this.target = null;
    const t1 = performance.now();
    const animDt = frozen && !store.clockStopped && !this.pan ? 0 : store.clockStopped ? 0 : dt;

    const zone = this.zone;
    const p = zone.player;
    this.vc.audio?.setListener(p.x, p.y);
    const dark = zoneDarkness(store.ctx, this.rt);

    // Line of sight → the fog texture every world material samples.
    worldUniforms.uFogOn.value = devTools.fovOff ? 0 : 1;
    this.fog.update(this.rt.visible, zone.explored, this.rt.bright);
    this.zombies.showAll = devTools.fovOff;
    this.npcs.showAll = devTools.fovOff;

    // Camera: follow with look-ahead, or play the pan.
    if (this.pan) this.updatePan(store.clockStopped ? 0 : dt);
    else this.rig.follow(dt, p.x, p.y, this.input.ndc, input.aim && !zone.safe, zone.w, zone.h);
    const focus = this.pan ? this.rig.target : { x: p.x, z: p.y };
    worldUniforms.uCutPos.value.set(focus.x, 0, focus.z);
    worldUniforms.uCutDir.value.copy(this.rig.groundForward(this.cutDir));
    this.world.update(focus.x, focus.z);

    this.props.update(zone, store.state, dt);
    this.player.update(store.ctx, zone, animDt, zone.safe);
    this.npcs.update(zone, this.rt, animDt);
    this.zombies.update(zone, this.rt, animDt);
    const bufH = this.vc.renderer.getDrawingBufferSize(TMP2).y;
    this.fx.update(zone, this.rt, store.clockStopped ? 0 : dt, this.rig.spriteScale(bufH));
    this.lights.update(
      dt,
      dark,
      p.x,
      p.y,
      store.state.player.flashlightOn && !store.state.player.dead,
      this.player.lens,
      this.player.lensDir,
      this.props.lights,
      this.fx.lights,
    );

    // HTML world UI.
    const a = p.action;
    const progress =
      a?.kind === 'timed'
        ? { kind: 'timed' as const, t: a.t / a.duration }
        : a?.kind === 'reload'
          ? { kind: 'reload' as const, t: a.t / a.duration }
          : null;
    this.ui.update(this.project, dt, store.inputCaptured || this.pan ? null : this.target, p, progress);
    this.ui.healthBars(
      this.project,
      zone.zombies
        .filter(
          (z) =>
            z.hp > 0 &&
            z.hp < z.maxHp &&
            zone.time - z.damagedAt < 4 &&
            (devTools.fovOff || isVisible(this.rt, z.x, z.y)),
        )
        .map((z) => ({ id: z.id, x: z.x, y: z.y, frac: z.hp / z.maxHp, boss: z.maxHp > 200 })),
    );
    this.ui.npcNames(
      this.project,
      zone.npcs
        .filter((n) => Math.hypot(n.x - p.x, n.y - p.y) < 6 && isVisible(this.rt, n.x, n.y))
        .map((n) => ({
          id: n.id,
          name: store.content.npcs[n.npcId]?.name?.split(' ')[0] ?? n.npcId,
          x: n.x,
          y: n.y,
        })),
    );
    this.markerIn -= dt;
    if (this.pan) {
      this.ui.setMarker(null);
      this.markerIn = 0;
    } else if (this.markerIn <= 0) {
      this.markerIn = 0.25;
      this.ui.setMarker(objectiveMarker(store.ctx));
    }
    this.drawDebug();

    this.fpsAcc.t += dtMs;
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
    debugInfo.playerTile = `${Math.floor(p.x)},${Math.floor(p.y)}`;
    debugInfo.noise = p.noise;
  }

  /** Start the buffered pan: resolve its target, reveal what's there, and letterbox the view. */
  private startPan(): void {
    const req = cinematics.pending!;
    cinematics.pending = null;
    let x = req.x;
    let y = req.y;
    if (req.objectId) {
      const layout = getLayout(this.store.content, this.zone.zoneId);
      const o =
        layout.objects.find((q) => q.id === req.objectId) ??
        layout.containers.find((q) => q.id === req.objectId) ??
        layout.stations.find((q) => q.id === req.objectId) ??
        layout.exits.find((q) => q.id === req.objectId);
      if (o) {
        x = o.x + o.w / 2;
        y = o.y + o.h / 2;
      }
    }
    if (x === undefined || y === undefined) return;
    this.pan = { x, y, t: 0, dur: req.seconds, caption: req.caption ?? null };
    this.store.cinematic = true;
    this.store.notify();
    revealAround(this.rt, x, y, 6);
  }

  private updatePan(dt: number): void {
    const pan = this.pan!;
    pan.t += dt;
    this.rig.panTo(dt, pan.x, pan.y, this.zone.w, this.zone.h);
    const k = Math.min(1, pan.t / 0.35, Math.max(0, (pan.dur - pan.t) / 0.35));
    this.ui.cinematic(k, pan.caption);
    if (pan.t >= pan.dur) {
      this.pan = null;
      this.store.cinematic = false;
      this.store.notify();
      this.ui.cinematic(0, null);
      this.rt.fovKey = '';
    }
  }

  private drawDebug(): void {
    for (const l of this.debugLines) {
      this.scene.remove(l);
      l.geometry.dispose();
    }
    this.debugLines = [];
    const on = devTools.enabled && devTools.overlay;
    if (!on) {
      this.ui.debugLabels(this.project, []);
      return;
    }
    const labels: { id: string; text: string; x: number; y: number }[] = [];
    for (const n of this.zone.noises) {
      const pts: number[] = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        pts.push(n.x + Math.cos(a) * n.radius, 0.05, n.y + Math.sin(a) * n.radius);
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pts, 3));
      const loop = new LineLoop(g, this.debugMat);
      this.scene.add(loop);
      this.debugLines.push(loop);
    }
    for (const z of this.zone.zombies) {
      if (z.hp <= 0) continue;
      labels.push({
        id: z.id,
        text: `${z.type} ${z.mode}${z.awake ? '' : ' zz'} ${Math.ceil(z.hp)}`,
        x: z.x,
        y: z.y,
      });
      if (!z.path) continue;
      const pts: number[] = [z.x, 0.1, z.y];
      for (let i = z.pathIndex; i < z.path.length; i++) pts.push(z.path[i]!.x, 0.1, z.path[i]!.y);
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pts, 3));
      const line = new Line(g, this.debugMat);
      this.scene.add(line);
      this.debugLines.push(line);
    }
    this.ui.debugLabels(this.project, labels);
  }

  dispose(): void {
    if (this.store.cinematic) {
      this.store.cinematic = false;
      this.store.notify();
    }
    this.offs.forEach((o) => o());
    this.offs = [];
    this.input.destroy();
    this.ui.destroy();
    this.world.dispose();
    this.props.dispose();
    this.player.dispose();
    this.npcs.dispose();
    this.zombies.dispose();
    this.fx.dispose();
    this.lights.dispose();
    this.fog.dispose();
    this.debugMat.dispose();
    for (const l of this.debugLines) l.geometry.dispose();
  }
}

const TMP2 = new Vector2();
