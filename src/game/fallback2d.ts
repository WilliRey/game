/**
 * The no-WebGL fallback (BRIEF_V2 §1 "a fallback for CI and headless browsers"): the same simulation drawn
 * top-down with Canvas 2D — floor tiles from the shared atlas, walls, props as blocks, people as discs,
 * line-of-sight darkness per tile — with the same HTML world UI. Used when WebGL is unavailable or with
 * `?renderer=2d`. Plain, but fully playable.
 */
import type { GameStore } from '@/core/store';
import { debugInfo, devTools } from '@/dev/devtools';
import { isVisible, revealAround } from '@/sim/fov';
import type { Interactable } from '@/sim/interact';
import { getLayout } from '@/sim/layout';
import { getRuntime, type ZoneRuntime } from '@/sim/runtime';
import { stepZone } from '@/sim/step';
import { TILE_KINDS } from '@/sim/tiles';
import type { ZoneState } from '@/sim/types';
import { objectiveMarker } from '@/systems/markers';
import type { AudioManager } from './audio/AudioManager';
import { ITEM_COLORS } from './art/manifest';
import {
  ATLAS_GUTTER,
  OVERLAY_TILES,
  TILE_PX,
  TILE_VARIANTS,
  atlasCell,
  buildTileAtlas,
  type Atlas,
} from './art/textures';
import { VIEW_H, VIEW_W } from './constants';
import type { GameHandle, ViewKey } from './createGame';
import { letterbox } from './createGame';
import { cinematics } from './director';
import { InputTracker } from './input';
import { WorldUi } from './view/worldUi';

const S = 32;

class Fallback2D implements GameHandle {
  readonly mode = '2d' as const;
  readonly quality = null;
  readonly canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private key: ViewKey | null = null;
  private zone: ZoneState | null = null;
  private rt: ZoneRuntime | null = null;
  private input: InputTracker;
  private ui: WorldUi;
  private atlas: Atlas | null = null;
  private floor: HTMLCanvasElement | null = null;
  private camX = 0;
  private camY = 0;
  private last = 0;
  private resizeFns: (() => void)[] = [];
  private target: Interactable | null = null;
  private pan: { x: number; y: number; t: number; dur: number } | null = null;
  private hitStopUntil = 0;
  private markerIn = 0;
  private fps = { t: 0, n: 0 };
  private offs: (() => void)[] = [];

  constructor(
    private store: GameStore,
    parent: HTMLElement,
    private audio: AudioManager | undefined,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W;
    this.canvas.height = VIEW_H;
    this.canvas.style.position = 'absolute';
    parent.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.input = new InputTracker(this.canvas, () => this.store.inputCaptured);
    this.ui = new WorldUi(document.getElementById('world-ui') ?? parent);
    window.addEventListener('resize', () => this.fit());
    this.fit();
    const bus = store.bus;
    this.offs.push(
      bus.on('fx:hitstop', ({ ms }) => {
        this.hitStopUntil = performance.now() + ms;
      }),
      bus.on('fx:damageNumber', ({ x, y, amount, crit }) => {
        if (this.store.settings.damageNumbers) this.ui.damageNumber(x, y, amount, crit);
      }),
    );
    requestAnimationFrame(this.tick);
  }

  get view(): ViewKey | null {
    return this.key;
  }

  onResize(fn: () => void): void {
    this.resizeFns.push(fn);
  }

  private fit(): void {
    const b = letterbox();
    Object.assign(this.canvas.style, {
      left: `${b.left}px`,
      top: `${b.top}px`,
      width: `${b.w}px`,
      height: `${b.h}px`,
    });
    for (const fn of this.resizeFns) fn();
  }

  show(key: ViewKey): void {
    this.key = key;
    this.zone = null;
    this.floor = null;
    if (key !== 'zone' || !this.store.state?.zone) return;
    const zone = (this.zone = this.store.state.zone);
    this.rt = getRuntime(this.store.content, zone);
    this.atlas ??= buildTileAtlas();
    this.floor = this.paintFloor(zone, this.atlas);
    this.camX = zone.player.x * S - VIEW_W / 2;
    this.camY = zone.player.y * S - VIEW_H / 2;
    stepZone(this.store.ctx, this.input.read(this.aim(), true), 0);
  }

  private paintFloor(zone: ZoneState, atlas: Atlas): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = zone.w * S;
    c.height = zone.h * S;
    const g = c.getContext('2d')!;
    const cell = (k: number) => {
      const x = (k % atlas.cols) * atlas.cell + ATLAS_GUTTER;
      const y = Math.floor(k / atlas.cols) * atlas.cell + ATLAS_GUTTER;
      return [x, y] as const;
    };
    for (let y = 0; y < zone.h; y++)
      for (let x = 0; x < zone.w; x++) {
        const kind = TILE_KINDS[zone.tiles[y * zone.w + x]!]!;
        const v = (x * 7 + y * 13) % TILE_VARIANTS;
        if (kind === 'wall' || kind === 'void' || kind === 'window') {
          g.fillStyle = kind === 'window' ? '#3d4a52' : '#55575a';
          g.fillRect(x * S, y * S, S, S);
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x * S, y * S + S - 7, S, 7);
          continue;
        }
        const ground = OVERLAY_TILES.has(kind) ? 'floor' : kind;
        const [sx, sy] = cell(atlasCell(ground, v));
        g.drawImage(atlas.canvas, sx, sy, TILE_PX, TILE_PX, x * S, y * S, S, S);
        if (OVERLAY_TILES.has(kind)) {
          const [ox, oy] = cell(atlasCell(kind, v));
          g.drawImage(atlas.canvas, ox, oy, TILE_PX, TILE_PX, x * S, y * S, S, S);
          if (kind === 'tree' || kind === 'bush') {
            g.fillStyle = kind === 'tree' ? '#2a3a26' : '#32412a';
            g.beginPath();
            g.arc(x * S + S / 2, y * S + S / 2, kind === 'tree' ? 14 : 10, 0, Math.PI * 2);
            g.fill();
          } else if (kind === 'counter') {
            g.fillStyle = '#584a3a';
            g.fillRect(x * S + 2, y * S + 2, S - 4, S - 4);
          } else if (kind === 'fence') {
            g.strokeStyle = 'rgba(160,165,170,0.8)';
            g.strokeRect(x * S + 2, y * S + 2, S - 4, S - 4);
          }
        }
      }
    return c;
  }

  private aim(): { x: number; y: number } {
    const c = this.input.cursorPx(VIEW_W, VIEW_H);
    return { x: (c.x + this.camX) / S, y: (c.y + this.camY) / S };
  }

  private project = (x: number, _y: number, z: number) => ({
    x: x * S - this.camX,
    y: z * S - this.camY - 14,
    behind: false,
  });

  private tick = (now: number): void => {
    requestAnimationFrame(this.tick);
    const dtMs = this.last ? now - this.last : 16;
    this.last = now;
    const g = this.g;
    g.fillStyle = '#050506';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    if (this.key !== 'zone' || !this.zone || !this.rt || !this.floor) {
      this.drawTitle(now);
      return;
    }
    const store = this.store;
    const zone = this.zone;
    if (store.state?.zone !== zone || store.phase !== 'playing') return;
    const dt = Math.min(dtMs, 100) / 1000;
    const input = this.input.read(this.aim(), store.inputCaptured);
    if (!this.pan && cinematics.pending && !store.clockStopped) {
      const req = cinematics.pending;
      cinematics.pending = null;
      const layout = getLayout(store.content, zone.zoneId);
      const o = req.objectId ? layout.objects.find((q) => q.id === req.objectId) : undefined;
      const x = o ? o.x + o.w / 2 : req.x;
      const y = o ? o.y + o.h / 2 : req.y;
      if (x !== undefined && y !== undefined) {
        this.pan = { x, y, t: 0, dur: req.seconds };
        store.cinematic = true;
        store.notify();
        revealAround(this.rt, x, y, 6);
      }
    }
    const frozen = store.clockStopped || !!this.pan || performance.now() < this.hitStopUntil;
    if (!frozen) this.target = stepZone(store.ctx, input, dt).target;
    const p = zone.player;
    this.audio?.setListener(p.x, p.y);
    const fx = this.pan ? this.pan.x : p.x;
    const fy = this.pan ? this.pan.y : p.y;
    if (this.pan) {
      this.pan.t += store.clockStopped ? 0 : dt;
      if (this.pan.t >= this.pan.dur) {
        this.pan = null;
        store.cinematic = false;
        store.notify();
      }
    }
    const f = 1 - Math.exp(-dt * 6);
    this.camX += (fx * S - VIEW_W / 2 - this.camX) * f;
    this.camY += (fy * S - VIEW_H / 2 - this.camY) * f;
    this.draw(zone, this.rt);
    this.ui.update(this.project, dt, store.inputCaptured ? null : this.target, p, null);
    this.markerIn -= dt;
    if (this.markerIn <= 0) {
      this.markerIn = 0.25;
      this.ui.setMarker(objectiveMarker(store.ctx));
    }
    this.fps.t += dtMs;
    this.fps.n++;
    if (this.fps.t > 500) {
      debugInfo.fps = Math.round((this.fps.n * 1000) / this.fps.t);
      this.fps = { t: 0, n: 0 };
    }
    debugInfo.zombies = zone.zombies.length;
  };

  private drawTitle(now: number): void {
    const g = this.g;
    const grad = g.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#07080b');
    grad.addColorStop(1, '#16171a');
    g.fillStyle = grad;
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    g.fillStyle = '#101216';
    for (let i = 0; i < 24; i++) g.fillRect(i * 56, VIEW_H - 140 - ((i * 97) % 220), 50, 400);
    g.fillStyle = `rgba(255,190,110,${0.5 + Math.sin(now / 300) * 0.2})`;
    g.fillRect(900, 420, 6, 8);
  }

  private draw(zone: ZoneState, rt: ZoneRuntime): void {
    const g = this.g;
    const ox = -Math.round(this.camX);
    const oy = -Math.round(this.camY);
    g.save();
    g.translate(ox, oy);
    g.drawImage(this.floor!, 0, 0);
    for (const c of Object.values(zone.containers)) {
      g.fillStyle = c.searched ? '#3a3a36' : '#6a5a3a';
      g.fillRect(c.x * S + 3, c.y * S + 3, c.w * S - 6, c.h * S - 6);
    }
    for (const s of rt.layout.stations) {
      g.fillStyle = '#4f6f8a';
      g.fillRect(s.x * S + 3, s.y * S + 3, s.w * S - 6, s.h * S - 6);
    }
    for (const d of Object.values(zone.doors)) {
      if (d.broken) continue;
      g.fillStyle = d.locked ? '#b49a3a' : d.open ? 'rgba(92,70,48,0.4)' : '#5c4630';
      g.fillRect(d.x * S + 2, d.y * S + 2, S - 4, S - 4);
    }
    for (const it of zone.items) {
      g.fillStyle = ITEM_COLORS[this.store.content.items[it.stack.itemId]?.category ?? 'junk'] ?? '#888';
      g.fillRect(it.x * S - 5, it.y * S - 5, 10, 10);
    }
    for (const h of zone.hazards) {
      g.fillStyle =
        h.kind === 'fire'
          ? 'rgba(255,120,30,0.45)'
          : h.kind === 'smoke'
            ? 'rgba(150,150,150,0.55)'
            : 'rgba(140,170,60,0.4)';
      g.beginPath();
      g.arc(h.x * S, h.y * S, (h.kind === 'fuse' || h.kind === 'decoy' ? 0.3 : h.radius) * S, 0, Math.PI * 2);
      g.fill();
    }
    const disc = (x: number, y: number, r: number, color: string, facing: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x * S, y * S, r * S, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.beginPath();
      g.moveTo(x * S, y * S);
      g.lineTo((x + Math.cos(facing) * r * 1.4) * S, (y + Math.sin(facing) * r * 1.4) * S);
      g.stroke();
    };
    for (const n of zone.npcs)
      if (devTools.fovOff || isVisible(rt, n.x, n.y))
        disc(n.x, n.y, 0.32, this.store.content.npcs[n.npcId]?.color ?? '#9bbcd1', n.facing);
    for (const z of zone.zombies)
      if (z.hp > 0 && (devTools.fovOff || isVisible(rt, z.x, z.y)))
        disc(
          z.x,
          z.y,
          this.store.content.enemies[z.type]?.radius ?? 0.38,
          z.hitFlash > 0 ? '#ffffff' : z.windup > 0 ? '#c07060' : '#55604c',
          z.facing,
        );
    const p = zone.player;
    disc(p.x, p.y, 0.32, p.hurtFlash > 0 ? '#d06050' : '#c9a26b', p.facing);
    g.strokeStyle = 'rgba(255,226,160,0.9)';
    for (const tr of zone.tracers) {
      g.beginPath();
      g.moveTo(tr.x1 * S, tr.y1 * S);
      g.lineTo(tr.x2 * S, tr.y2 * S);
      g.stroke();
    }
    // Line of sight: darkness per tile.
    if (!devTools.fovOff) {
      const x0 = Math.max(0, Math.floor(-ox / S));
      const y0 = Math.max(0, Math.floor(-oy / S));
      const x1 = Math.min(zone.w, x0 + VIEW_W / S + 2);
      const y1 = Math.min(zone.h, y0 + VIEW_H / S + 2);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = y * zone.w + x;
          const a = rt.visible[i] ? 1 - Math.min(1, rt.bright[i]!) : zone.explored[i] ? 0.78 : 1;
          if (a <= 0.02) continue;
          g.fillStyle = `rgba(4,5,9,${a.toFixed(2)})`;
          g.fillRect(x * S, y * S, S, S);
        }
    }
    g.restore();
  }
}

export function createFallback2D(store: GameStore, parent: HTMLElement, audio?: AudioManager): GameHandle {
  return new Fallback2D(store, parent, audio);
}
