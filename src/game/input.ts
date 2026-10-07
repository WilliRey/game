/**
 * Keyboard state from DOM events (so we never steal keys from the console's text input) plus mouse state
 * from Phaser's pointer. `read()` produces one frame of PlayerInput with edge flags.
 */
import type Phaser from 'phaser';
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
  private lmbWas = false;
  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping()) return;
    // A key that closes a UI screen must not also act in the world on the next frame.
    if (!e.repeat && !this.captured()) this.pressed.add(e.code);
    this.down.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };
  private onBlur = () => {
    this.down.clear();
    this.pressed.clear();
  };

  constructor(
    private scene: Phaser.Scene,
    private captured: () => boolean,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      this.wheel += Math.sign(dy);
    });
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
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

  /** Build this frame's input. `captured` = a UI screen is open: movement and actions are ignored. */
  read(tileSize: number, captured: boolean): PlayerInput {
    const inp = emptyInput();
    const ptr = this.scene.input.activePointer;
    const cam = this.scene.cameras.main;
    const world = cam.getWorldPoint(ptr.x, ptr.y);
    inp.aimX = world.x / tileSize;
    inp.aimY = world.y / tileSize;
    const lmb = ptr.leftButtonDown();
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
    inp.aim = ptr.rightButtonDown();
    inp.attack = lmb;
    inp.attackPressed = lmb && !this.lmbWas;
    this.lmbWas = lmb;
    inp.interactHeld = d('KeyE');
    inp.interactPressed = this.consume('KeyE');
    inp.reloadPressed = this.consume('KeyR');
    inp.shovePressed = this.consume('Space');
    inp.throwPressed = this.consume('KeyG');
    inp.crouchToggle = this.consume('KeyC');
    inp.flashlightToggle = this.consume('KeyF');
    for (const [code, slot] of Object.entries(SLOT_KEYS)) if (this.consume(code)) inp.slot = slot;
    for (const [code, q] of Object.entries(QUICK_KEYS)) if (this.consume(code)) inp.quick = q;
    inp.wheel = this.wheel;
    this.wheel = 0;
    return inp;
  }
}
