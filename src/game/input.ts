/**
 * Keyboard and mouse from DOM events (never stealing keys from the console's text input). `read()` builds
 * one frame of PlayerInput with edge flags; the aim point comes from the view (a raycast onto the ground in
 * 3D, or straight pixel maths in the 2D fallback).
 */
import { Vector2 } from 'three';
import type { WeaponSlot } from '@/core/types';
import { emptyInput, type PlayerInput } from '@/sim/player';

const SLOT_KEYS: Record<string, WeaponSlot> = {
  Digit1: 'firearm1',
  Digit2: 'firearm2',
  Digit3: 'melee',
  Digit4: 'throwable',
};
const QUICK_KEYS: Record<string, number> = { Digit5: 0, Digit6: 1, Digit7: 2, Digit8: 3 };

function isTyping(): boolean {
  const el = document.activeElement;
  return (
    !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)
  );
}

export class InputTracker {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private wheel = 0;
  private lmb = false;
  private rmb = false;
  private lmbWas = false;
  /** A left press since the last read: a click that goes down and up between two frames still counts. */
  private clicked = false;
  /** Cursor in normalised device coordinates of the game view (−1..1). */
  readonly ndc = new Vector2();
  private offs: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private captured: () => boolean,
  ) {
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement,
      type: K,
      fn: (e: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(type, fn as EventListener, opts);
      this.offs.push(() => target.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e) => {
      if (isTyping()) return;
      // A key that closes a UI screen must not also act in the world on the next frame.
      if (!e.repeat && !this.captured()) this.pressed.add(e.code);
      this.down.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    on(window, 'keyup', (e) => this.down.delete(e.code));
    on(window, 'blur', () => {
      this.down.clear();
      this.pressed.clear();
      this.lmb = false;
      this.rmb = false;
    });
    on(window, 'mousemove', (e) => this.track(e));
    // Buttons are taken from the game view only, so clicks on UI panels never swing a weapon.
    on(canvas, 'mousedown', (e) => {
      this.track(e);
      if (e.button === 0) this.lmb = this.clicked = true;
      if (e.button === 2) this.rmb = true;
    });
    on(window, 'mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
      if (e.button === 2) this.rmb = false;
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    on(
      canvas,
      'wheel',
      (e) => {
        this.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      },
      { passive: false },
    );
  }

  private track(e: MouseEvent): void {
    const r = this.canvas.getBoundingClientRect();
    if (r.width === 0) return;
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  }

  /** The cursor in logical pixels (1280×720). */
  cursorPx(w: number, h: number): { x: number; y: number } {
    return { x: ((this.ndc.x + 1) / 2) * w, y: ((1 - this.ndc.y) / 2) * h };
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs = [];
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Was the key pressed since the last read? Consumes the edge. */
  consume(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  get aiming(): boolean {
    return this.rmb;
  }

  /** Build this frame's input. `captured` = a UI screen is open: movement and actions are ignored. */
  read(aim: { x: number; y: number }, captured: boolean): PlayerInput {
    const inp = emptyInput();
    inp.aimX = aim.x;
    inp.aimY = aim.y;
    const lmb = this.lmb;
    const clicked = this.clicked;
    this.clicked = false;
    if (captured) {
      this.pressed.clear();
      this.wheel = 0;
      this.lmbWas = lmb;
      return inp;
    }
    const d = (c: string) => this.down.has(c);
    inp.moveX = (d('KeyD') ? 1 : 0) - (d('KeyA') ? 1 : 0);
    inp.moveY = (d('KeyS') ? 1 : 0) - (d('KeyW') ? 1 : 0);
    inp.sprint = d('ShiftLeft') || d('ShiftRight');
    inp.force = inp.sprint;
    inp.aim = this.rmb;
    inp.attack = lmb || clicked;
    inp.attackPressed = (lmb && !this.lmbWas) || clicked;
    this.lmbWas = lmb;
    inp.interactHeld = d('KeyE');
    inp.interactPressed = this.consume('KeyE');
    inp.reloadPressed = this.consume('KeyR');
    inp.shovePressed = this.consume('Space');
    inp.throwPressed = this.consume('KeyG');
    inp.crouchToggle = this.consume('KeyC');
    inp.flashlightToggle = this.consume('KeyF');
    inp.abilityPressed = this.consume('KeyQ');
    for (const [code, slot] of Object.entries(SLOT_KEYS)) if (this.consume(code)) inp.slot = slot;
    for (const [code, q] of Object.entries(QUICK_KEYS)) if (this.consume(code)) inp.quick = q;
    inp.wheel = this.wheel;
    this.wheel = 0;
    return inp;
  }
}
