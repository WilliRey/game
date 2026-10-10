/**
 * The presentation engine: a three.js WebGL renderer letterboxed to 16:9, a requestAnimationFrame loop,
 * and the active view (the title backdrop or the zone). Browsers without WebGL get the 2D fallback
 * renderer instead (`fallback2d.ts`), which draws the same zone top-down with Canvas 2D.
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
  type Texture,
} from 'three';
import type { GameStore } from '@/core/store';
import type { AudioManager } from './audio/AudioManager';
import { buildTileAtlas, type Atlas } from './art/textures';
import { VIEW_H, VIEW_W } from './constants';
import { installDirector } from './director';
import { createFallback2D } from './fallback2d';
import { HIGH, chooseRenderer, detectQuality, type QualityTier } from './quality';
import { TitleView } from './view/TitleView';
import { ZoneView } from './view/ZoneView';

export { VIEW_H, VIEW_W };

export type ViewKey = 'title' | 'zone';

/** What the rest of the app (UI overlay, tests, console) sees of the renderer. */
export interface GameHandle {
  readonly canvas: HTMLCanvasElement;
  readonly mode: 'webgl' | '2d';
  readonly quality: QualityTier | null;
  /** The view on screen. */
  readonly view: ViewKey | null;
  onResize(fn: () => void): void;
  show(view: ViewKey): void;
}

/** Fit a 16:9 box inside the window, centred. */
export function letterbox(): { w: number; h: number; left: number; top: number } {
  const ww = window.innerWidth;
  const wh = window.innerHeight;
  const scale = Math.min(ww / VIEW_W, wh / VIEW_H);
  const w = Math.max(1, Math.floor(VIEW_W * scale));
  const h = Math.max(1, Math.floor(VIEW_H * scale));
  return { w, h, left: Math.floor((ww - w) / 2), top: Math.floor((wh - h) / 2) };
}

class Engine implements GameHandle {
  readonly mode = 'webgl' as const;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  private current: TitleView | ZoneView | null = null;
  private key: ViewKey | null = null;
  private resizeFns: (() => void)[] = [];
  private last = 0;
  private atlas: { texture: Texture; info: Atlas } | null = null;
  private uiHost: HTMLElement;

  constructor(
    private store: GameStore,
    parent: HTMLElement,
    private audio: AudioManager | undefined,
    readonly quality: QualityTier,
  ) {
    this.renderer = new WebGLRenderer({
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.style.position = 'absolute';
    this.canvas.style.display = 'block';
    parent.appendChild(this.canvas);
    this.uiHost = document.getElementById('world-ui') ?? parent;
    window.addEventListener('resize', () => this.fit());
    this.fit();
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
    this.canvas.style.left = `${b.left}px`;
    this.canvas.style.top = `${b.top}px`;
    this.canvas.style.width = `${b.w}px`;
    this.canvas.style.height = `${b.h}px`;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio));
    this.renderer.setSize(b.w, b.h, false);
    for (const fn of this.resizeFns) fn();
  }

  private tileAtlas(): { texture: Texture; info: Atlas } {
    if (!this.atlas) {
      const info = buildTileAtlas();
      const t = new CanvasTexture(info.canvas);
      t.colorSpace = SRGBColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.atlas = { texture: t, info };
    }
    return this.atlas;
  }

  show(key: ViewKey): void {
    this.current?.dispose();
    this.current = null;
    this.key = null;
    if (key === 'zone') {
      if (!this.store.state?.zone) return;
      const atlas = this.tileAtlas();
      this.current = new ZoneView(this.store, {
        renderer: this.renderer,
        canvas: this.canvas,
        quality: this.quality,
        audio: this.audio,
        uiHost: this.uiHost,
        atlas: atlas.texture,
        atlasInfo: atlas.info,
      });
    } else this.current = new TitleView();
    this.key = key;
  }

  private tick = (now: number): void => {
    requestAnimationFrame(this.tick);
    const dt = this.last ? now - this.last : 16;
    this.last = now;
    const v = this.current;
    if (!v) {
      this.renderer.clear();
      return;
    }
    v.update(dt);
    this.renderer.render(v.scene, v.camera);
  };
}

/** Create the renderer for this browser and install the director that switches views. */
export function createGame(store: GameStore, parent: HTMLElement, audio?: AudioManager): GameHandle {
  let game: GameHandle;
  if (chooseRenderer() === '2d') game = createFallback2D(store, parent, audio);
  else {
    let quality = HIGH;
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
      if (gl) {
        quality = detectQuality(gl);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      /* keep HIGH */
    }
    game = new Engine(store, parent, audio, quality);
  }
  installDirector(game, store);
  return game;
}
