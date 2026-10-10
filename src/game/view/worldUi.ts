/**
 * In-world feedback as an HTML layer over the 3D view (positions projected from world space each frame):
 * the interaction prompt, the hold-action ring and reload bar, damage numbers, zombie health bars,
 * directional pings for loud sounds out of sight, the objective marker with its edge arrow, names over
 * survivors, the letterbox and caption for scripted pans, and debug labels.
 */
import type { Interactable } from '@/sim/interact';
import { VIEW_H, VIEW_W } from '../constants';

export type Project = (x: number, y: number, z: number) => { x: number; y: number; behind: boolean };

interface Floating {
  el: HTMLDivElement;
  x: number;
  y: number;
  z: number;
  t: number;
  life: number;
  dx: number;
}

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
}

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

export class WorldUi {
  readonly root: HTMLDivElement;
  private prompt: HTMLDivElement;
  private ring: HTMLDivElement;
  private ringArc: SVGCircleElement;
  private bar: HTMLDivElement;
  private barFill: HTMLDivElement;
  private marker: HTMLDivElement;
  private edge: HTMLDivElement;
  private letterTop: HTMLDivElement;
  private letterBottom: HTMLDivElement;
  private caption: HTMLDivElement;
  private flash: HTMLDivElement;
  private numbers: Floating[] = [];
  private bars = new Map<string, HTMLDivElement>();
  private names = new Map<string, HTMLDivElement>();
  private labels = new Map<string, HTMLDivElement>();
  private markerPos: { x: number; y: number } | null = null;
  private t = 0;

  constructor(host: HTMLElement) {
    this.root = div('world-ui', host);
    this.prompt = div('wui-prompt', this.root);
    this.ring = div('wui-ring', this.root);
    this.ring.innerHTML = `<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="${RING_R}" class="bg"/><circle cx="17" cy="17" r="${RING_R}" class="fg" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/></svg>`;
    this.ringArc = this.ring.querySelector('circle.fg') as SVGCircleElement;
    this.bar = div('wui-bar', this.root);
    this.barFill = div('wui-bar-fill', this.bar);
    this.marker = div('wui-marker', this.root);
    this.edge = div('wui-edge', this.root);
    this.letterTop = div('wui-letterbox top', this.root);
    this.letterBottom = div('wui-letterbox bottom', this.root);
    this.caption = div('wui-caption', this.root);
    this.flash = div('wui-flash', this.root);
    for (const el of [this.prompt, this.ring, this.bar, this.marker, this.edge, this.caption])
      el.style.display = 'none';
  }

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }

  /** Prompt over the current interaction target, and progress over the player. */
  update(
    project: Project,
    dt: number,
    target: Interactable | null,
    player: { x: number; y: number },
    progress: { kind: 'timed' | 'reload'; t: number } | null,
  ): void {
    this.t += dt;
    if (target) {
      const s = project(target.x, 1.35, target.y);
      let txt = target.disabled
        ? `${target.label} — ${target.disabled}`
        : `[${target.hold ? 'Hold E' : 'E'}] ${target.verb} ${target.verb === target.label ? '' : target.label}`.trim();
      if (target.alt && !target.disabled) txt += `\n[Shift+E] ${target.alt}`;
      if (this.prompt.textContent !== txt) this.prompt.textContent = txt;
      this.prompt.classList.toggle('disabled', !!target.disabled);
      this.prompt.style.display = '';
      this.place(this.prompt, s.x, s.y);
    } else this.prompt.style.display = 'none';

    const head = project(player.x, 1.55, player.y);
    if (progress?.kind === 'timed') {
      this.ring.style.display = '';
      this.place(this.ring, head.x, head.y);
      this.ringArc.setAttribute('stroke-dashoffset', String(RING_C * (1 - Math.min(1, progress.t))));
      this.bar.style.display = 'none';
    } else if (progress?.kind === 'reload') {
      this.bar.style.display = '';
      this.place(this.bar, head.x, head.y);
      this.barFill.style.width = `${Math.min(1, progress.t) * 100}%`;
      this.ring.style.display = 'none';
    } else {
      this.ring.style.display = 'none';
      this.bar.style.display = 'none';
    }

    // Damage numbers float up and fade.
    for (const n of this.numbers) {
      n.t += dt;
      const k = n.t / n.life;
      const s = project(n.x, n.y, n.z);
      this.place(n.el, s.x + n.dx, s.y - k * 34);
      n.el.style.opacity = String(Math.max(0, 1 - k * k));
    }
    for (const n of this.numbers.filter((q) => q.t >= q.life)) n.el.remove();
    this.numbers = this.numbers.filter((q) => q.t < q.life);

    this.placeMarker(project);
  }

  damageNumber(x: number, y: number, amount: number, crit: boolean): void {
    const el = div(`wui-dmg${crit ? ' crit' : ''}`, this.root);
    el.textContent = String(Math.round(amount));
    this.numbers.push({ el, x, y: 1.25, z: y, t: 0, life: 0.75, dx: (Math.random() - 0.5) * 14 });
    if (this.numbers.length > 30) this.numbers.shift()?.el.remove();
  }

  /** Health bars for damaged zombies (id → {x, y, frac, boss}); others are removed. */
  healthBars(
    project: Project,
    list: { id: string; x: number; y: number; frac: number; boss: boolean }[],
  ): void {
    const seen = new Set<string>();
    for (const b of list) {
      seen.add(b.id);
      let el = this.bars.get(b.id);
      if (!el) {
        el = div(`wui-hp${b.boss ? ' boss' : ''}`, this.root);
        div('wui-hp-fill', el);
        this.bars.set(b.id, el);
      }
      const s = project(b.x, b.boss ? 2.9 : 1.62, b.y);
      this.place(el, s.x, s.y);
      (el.firstChild as HTMLDivElement).style.width = `${Math.max(0, b.frac) * 100}%`;
    }
    for (const [id, el] of this.bars)
      if (!seen.has(id)) {
        el.remove();
        this.bars.delete(id);
      }
  }

  /** Names over nearby survivors. */
  npcNames(project: Project, list: { id: string; name: string; x: number; y: number }[]): void {
    const seen = new Set<string>();
    for (const n of list) {
      seen.add(n.id);
      let el = this.names.get(n.id);
      if (!el) {
        el = div('wui-name', this.root);
        el.textContent = n.name;
        this.names.set(n.id, el);
      }
      const s = project(n.x, 1.6, n.y);
      this.place(el, s.x, s.y);
    }
    for (const [id, el] of this.names)
      if (!seen.has(id)) {
        el.remove();
        this.names.delete(id);
      }
  }

  /** Debug text over things (zombie AI states). */
  debugLabels(project: Project, list: { id: string; text: string; x: number; y: number }[]): void {
    const seen = new Set<string>();
    for (const l of list) {
      seen.add(l.id);
      let el = this.labels.get(l.id);
      if (!el) {
        el = div('wui-debug', this.root);
        this.labels.set(l.id, el);
      }
      if (el.textContent !== l.text) el.textContent = l.text;
      const s = project(l.x, 1.9, l.y);
      this.place(el, s.x, s.y);
    }
    for (const [id, el] of this.labels)
      if (!seen.has(id)) {
        el.remove();
        this.labels.delete(id);
      }
  }

  /** A directional ping at the screen edge toward a loud noise the player can't see. */
  ping(project: Project, fromX: number, fromY: number, toX: number, toY: number, radius: number): void {
    const a = project(fromX, 0.5, fromY);
    const b = project(toX, 0.5, toY);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const r = Math.min(cx, cy) - 40;
    const el = div(`wui-ping${radius >= 30 ? ' loud' : ''}`, this.root);
    el.style.transform = `translate(${cx + Math.cos(angle) * r}px, ${cy + Math.sin(angle) * r}px) rotate(${angle}rad)`;
    setTimeout(() => el.remove(), 1300);
  }

  setMarker(pos: { x: number; y: number } | null): void {
    this.markerPos = pos;
  }

  /** Bobbing marker over the objective; off screen, an arrow at the edge points to it. */
  private placeMarker(project: Project): void {
    const pos = this.markerPos;
    if (!pos) {
      this.marker.style.display = 'none';
      this.edge.style.display = 'none';
      return;
    }
    const s = project(pos.x, 1.4 + Math.sin(this.t * 4.4) * 0.12, pos.y);
    const inset = 60;
    const onScreen =
      !s.behind && s.x >= inset && s.y >= inset && s.x <= VIEW_W - inset && s.y <= VIEW_H - inset;
    this.marker.style.display = s.behind ? 'none' : '';
    this.place(this.marker, s.x, s.y);
    if (onScreen) {
      this.edge.style.display = 'none';
      return;
    }
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const dx = s.x - cx;
    const dy = s.y - cy;
    const t = Math.min(
      (cx - inset) / Math.max(1e-6, Math.abs(dx)),
      (cy - inset) / Math.max(1e-6, Math.abs(dy)),
    );
    this.edge.style.display = '';
    this.edge.style.transform = `translate(${cx + dx * t}px, ${cy + dy * t}px) rotate(${Math.atan2(dy, dx)}rad)`;
  }

  /** Letterbox bars and caption for a scripted pan (k = 0..1 slide-in). */
  cinematic(k: number, caption: string | null): void {
    this.letterTop.style.height = `${64 * k}px`;
    this.letterBottom.style.height = `${64 * k}px`;
    if (caption) {
      this.caption.textContent = caption;
      this.caption.style.display = '';
      this.caption.style.opacity = String(k);
    } else this.caption.style.display = 'none';
  }

  /** A white flash (flashbangs going off near you). */
  whiteFlash(strength: number): void {
    this.flash.style.transition = 'none';
    this.flash.style.opacity = String(Math.min(0.85, strength));
    requestAnimationFrame(() => {
      this.flash.style.transition = 'opacity 0.6s ease-out';
      this.flash.style.opacity = '0';
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
