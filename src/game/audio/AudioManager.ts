/**
 * Placeholder sound effects synthesized with WebAudio and keyed by event name (brief §4). Sounds with a
 * world position are panned left/right and fade with distance from the player, so you can hear what you
 * can't see. Real samples can replace any key later by adding a buffer under the same name.
 */
import type { GameStore } from '@/core/store';

type Recipe = (a: AudioContext, out: AudioNode, t: number, v: number) => void;

function noiseBuffer(a: AudioContext): AudioBuffer {
  const buf = a.createBuffer(1, a.sampleRate * 1.5, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

let NOISE: AudioBuffer | null = null;

function env(
  a: AudioContext,
  out: AudioNode,
  t: number,
  attack: number,
  decay: number,
  peak: number,
): GainNode {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(out);
  return g;
}

function noise(
  a: AudioContext,
  out: AudioNode,
  t: number,
  dur: number,
  peak: number,
  filter: BiquadFilterType,
  freq: number,
  q = 1,
  sweepTo?: number,
): void {
  const src = a.createBufferSource();
  src.buffer = NOISE ??= noiseBuffer(a);
  const f = a.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  src.connect(f);
  f.connect(env(a, out, t, 0.004, dur, peak));
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(
  a: AudioContext,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  f0: number,
  f1: number,
  dur: number,
  peak: number,
  attack = 0.005,
): void {
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  o.connect(env(a, out, t, attack, dur, peak));
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

const gun =
  (body: number, crack: number, tail: number): Recipe =>
  (a, out, t, v) => {
    noise(a, out, t, tail, 0.9 * v, 'lowpass', crack, 0.7, 300);
    tone(a, out, t, 'sine', body, 40, 0.18, 0.8 * v);
    noise(a, out, t, 0.04, 0.6 * v, 'highpass', 3000);
  };

const RECIPES: Record<string, Recipe> = {
  step: (a, o, t, v) => noise(a, o, t, 0.05, 0.25 * v, 'lowpass', 700),
  step_glass: (a, o, t, v) => {
    noise(a, o, t, 0.05, 0.25 * v, 'lowpass', 700);
    noise(a, o, t + 0.01, 0.08, 0.35 * v, 'highpass', 4500, 2);
  },
  swing: (a, o, t, v) => noise(a, o, t, 0.13, 0.35 * v, 'bandpass', 500, 1.5, 1800),
  swing_heavy: (a, o, t, v) => noise(a, o, t, 0.22, 0.45 * v, 'bandpass', 300, 1.2, 1200),
  hit: (a, o, t, v) => {
    tone(a, o, t, 'sine', 160, 60, 0.12, 0.7 * v);
    noise(a, o, t, 0.06, 0.5 * v, 'lowpass', 1500);
  },
  hit_heavy: (a, o, t, v) => {
    tone(a, o, t, 'sine', 110, 40, 0.2, 0.9 * v);
    noise(a, o, t, 0.12, 0.7 * v, 'lowpass', 1200);
  },
  shove_hit: (a, o, t, v) => noise(a, o, t, 0.1, 0.4 * v, 'lowpass', 600),
  shot_pistol_9mm: gun(140, 4000, 0.3),
  shot_pipe_pistol: gun(120, 3000, 0.35),
  shot_pump_shotgun: gun(90, 2500, 0.55),
  shot_hunting_rifle: gun(110, 6000, 0.7),
  shot_crossbow: (a, o, t, v) => {
    tone(a, o, t, 'sawtooth', 240, 120, 0.12, 0.3 * v);
    noise(a, o, t, 0.05, 0.3 * v, 'bandpass', 2000);
  },
  shot_suppressed: (a, o, t, v) => {
    noise(a, o, t, 0.12, 0.5 * v, 'lowpass', 900);
    tone(a, o, t, 'sine', 120, 50, 0.08, 0.4 * v);
  },
  click: (a, o, t, v) => tone(a, o, t, 'square', 1800, 1200, 0.02, 0.2 * v),
  jam: (a, o, t, v) => {
    tone(a, o, t, 'square', 900, 300, 0.06, 0.3 * v);
    noise(a, o, t, 0.05, 0.3 * v, 'highpass', 2000);
  },
  reload: (a, o, t, v) => {
    tone(a, o, t, 'square', 1400, 900, 0.03, 0.2 * v);
    tone(a, o, t + 0.25, 'square', 1100, 700, 0.04, 0.25 * v);
  },
  shell: (a, o, t, v) => tone(a, o, t, 'square', 1600, 1000, 0.03, 0.18 * v),
  unjam: (a, o, t, v) => {
    noise(a, o, t, 0.08, 0.3 * v, 'highpass', 1500);
    tone(a, o, t + 0.15, 'square', 1200, 800, 0.04, 0.2 * v);
  },
  break: (a, o, t, v) => {
    noise(a, o, t, 0.2, 0.6 * v, 'bandpass', 1200, 2);
    tone(a, o, t, 'triangle', 600, 200, 0.2, 0.3 * v);
  },
  groan: (a, o, t, v) => {
    const f = 80 + Math.random() * 40;
    tone(a, o, t, 'sawtooth', f, f * 0.7, 0.9, 0.12 * v, 0.15);
    noise(a, o, t, 0.8, 0.06 * v, 'bandpass', 400, 3);
  },
  boss_groan: (a, o, t, v) => tone(a, o, t, 'sawtooth', 55, 35, 1.4, 0.25 * v, 0.2),
  zombie_alert: (a, o, t, v) => tone(a, o, t, 'sawtooth', 160, 260, 0.35, 0.18 * v, 0.05),
  zombie_attack: (a, o, t, v) => {
    tone(a, o, t, 'sawtooth', 220, 140, 0.3, 0.2 * v, 0.02);
    noise(a, o, t, 0.25, 0.15 * v, 'bandpass', 900, 2);
  },
  zombie_death: (a, o, t, v) => {
    tone(a, o, t, 'sawtooth', 140, 50, 0.6, 0.2 * v, 0.02);
    noise(a, o, t, 0.2, 0.3 * v, 'lowpass', 700);
  },
  boss_death: (a, o, t, v) => {
    tone(a, o, t, 'sawtooth', 80, 25, 1.6, 0.4 * v, 0.05);
    noise(a, o, t, 1.2, 0.5 * v, 'lowpass', 500, 1, 120);
  },
  burst: (a, o, t, v) => {
    noise(a, o, t, 0.15, 0.7 * v, 'lowpass', 900);
    noise(a, o, t + 0.1, 1.2, 0.25 * v, 'highpass', 2500);
  },
  scream: (a, o, t, v) => {
    tone(a, o, t, 'sawtooth', 700, 1400, 0.9, 0.35 * v, 0.05);
    tone(a, o, t, 'square', 720, 1300, 0.9, 0.12 * v, 0.05);
  },
  hurt: (a, o, t, v) => {
    tone(a, o, t, 'sawtooth', 200, 110, 0.18, 0.3 * v);
    noise(a, o, t, 0.08, 0.3 * v, 'lowpass', 1000);
  },
  door_open: (a, o, t, v) => tone(a, o, t, 'sawtooth', 300, 520, 0.25, 0.08 * v, 0.03),
  door_close: (a, o, t, v) => {
    tone(a, o, t, 'sine', 120, 60, 0.12, 0.5 * v);
    noise(a, o, t, 0.08, 0.3 * v, 'lowpass', 800);
  },
  door_bash: (a, o, t, v) => {
    tone(a, o, t, 'sine', 90, 40, 0.18, 0.8 * v);
    noise(a, o, t, 0.12, 0.5 * v, 'lowpass', 900);
  },
  door_break: (a, o, t, v) => {
    noise(a, o, t, 0.5, 0.9 * v, 'lowpass', 1600, 1, 200);
    tone(a, o, t, 'sine', 70, 30, 0.3, 0.8 * v);
  },
  glass_smash: (a, o, t, v) => {
    noise(a, o, t, 0.35, 0.8 * v, 'highpass', 3000);
    for (let i = 0; i < 5; i++)
      tone(a, o, t + i * 0.03, 'sine', 3000 + Math.random() * 2500, 2500, 0.15, 0.12 * v);
  },
  rustle: (a, o, t, v) => noise(a, o, t, 0.3, 0.2 * v, 'bandpass', 1800, 0.8),
  lockpick: (a, o, t, v) => {
    tone(a, o, t, 'square', 3200, 2800, 0.015, 0.06 * v);
    tone(a, o, t + 0.12, 'square', 3000, 2600, 0.015, 0.06 * v);
  },
  unlock: (a, o, t, v) => tone(a, o, t, 'square', 1500, 900, 0.05, 0.25 * v),
  force: (a, o, t, v) => {
    noise(a, o, t, 0.25, 0.7 * v, 'lowpass', 1800);
    tone(a, o, t, 'triangle', 400, 150, 0.2, 0.4 * v);
  },
  pickup: (a, o, t, v) => tone(a, o, t, 'sine', 700, 1100, 0.07, 0.15 * v),
  eat: (a, o, t, v) => {
    for (let i = 0; i < 3; i++) noise(a, o, t + i * 0.12, 0.06, 0.2 * v, 'lowpass', 900);
  },
  drink: (a, o, t, v) => {
    for (let i = 0; i < 3; i++) tone(a, o, t + i * 0.15, 'sine', 350, 250, 0.08, 0.15 * v);
  },
  bandage: (a, o, t, v) => noise(a, o, t, 0.5, 0.2 * v, 'bandpass', 2500, 1),
  throw: (a, o, t, v) => noise(a, o, t, 0.12, 0.25 * v, 'bandpass', 700, 1, 1500),
  molotov: (a, o, t, v) => {
    noise(a, o, t, 0.25, 0.6 * v, 'highpass', 3000);
    noise(a, o, t + 0.05, 1.2, 0.35 * v, 'lowpass', 900);
  },
  explosion: (a, o, t, v) => {
    noise(a, o, t, 1.4, 1.0 * v, 'lowpass', 2000, 0.7, 80);
    tone(a, o, t, 'sine', 70, 25, 0.8, 1.0 * v);
  },
  beep: (a, o, t, v) => tone(a, o, t, 'square', 1700, 1700, 0.06, 0.2 * v),
  alarm: (a, o, t, v) => {
    for (let i = 0; i < 10; i++)
      tone(a, o, t + i * 0.3, 'square', i % 2 ? 1200 : 900, i % 2 ? 1200 : 900, 0.26, 0.2 * v, 0.01);
  },
  radio: (a, o, t, v) => {
    noise(a, o, t, 0.6, 0.25 * v, 'bandpass', 1500, 0.5);
    tone(a, o, t + 0.1, 'sine', 600, 600, 0.3, 0.05 * v);
  },
  siphon: (a, o, t, v) => {
    for (let i = 0; i < 4; i++)
      tone(a, o, t + i * 0.15, 'sine', 200 + Math.random() * 100, 120, 0.12, 0.2 * v);
  },
  craft: (a, o, t, v) => {
    for (let i = 0; i < 3; i++) tone(a, o, t + i * 0.18, 'triangle', 900, 500, 0.06, 0.25 * v);
  },
  ui: (a, o, t, v) => tone(a, o, t, 'sine', 900, 700, 0.04, 0.08 * v),
  trade: (a, o, t, v) => {
    tone(a, o, t, 'sine', 600, 900, 0.08, 0.15 * v);
    tone(a, o, t + 0.09, 'sine', 900, 1200, 0.08, 0.15 * v);
  },
  levelup: (a, o, t, v) => {
    for (let i = 0; i < 3; i++)
      tone(a, o, t + i * 0.1, 'triangle', 500 * (i + 1), 500 * (i + 1), 0.15, 0.2 * v);
  },
  engine: (a, o, t, v) => tone(a, o, t, 'sawtooth', 60, 90, 1.2, 0.2 * v, 0.2),
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private listener = { x: 0, y: 0 };

  constructor(private store: GameStore) {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    store.bus.on('sfx:play', ({ key, x, y, volume }) => this.play(key, x, y, volume));
    store.bus.on('level:up', () => this.play('levelup'));
    store.bus.on('item:crafted', () => this.play('craft'));
    store.bus.on('trade:completed', () => this.play('trade'));
  }

  private ensure(): void {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
  }

  setListener(x: number, y: number): void {
    this.listener.x = x;
    this.listener.y = y;
  }

  play(key: string, x?: number, y?: number, volume = 1): void {
    const a = this.ctx;
    if (!a || !this.master || a.state !== 'running') return;
    const recipe = RECIPES[key] ?? (key.startsWith('shot_') ? RECIPES.shot_pistol_9mm : undefined);
    if (!recipe) return;
    const s = this.store.settings;
    let v = volume * s.masterVolume * s.sfxVolume;
    let pan = 0;
    if (x !== undefined && y !== undefined) {
      const dx = x - this.listener.x;
      const dy = y - this.listener.y;
      const d = Math.hypot(dx, dy);
      if (d > 40) return;
      v *= 1 / (1 + (d / 9) * (d / 9));
      pan = Math.max(-1, Math.min(1, dx / 14));
    }
    if (v < 0.01) return;
    const panner = a.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.master);
    this.master.gain.value = 0.9;
    recipe(a, panner, a.currentTime + 0.005, v);
    setTimeout(() => panner.disconnect(), 4000);
  }
}
