/** sfc32 seeded PRNG. The full stream state is serializable and stored in the save. */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export class Rng {
  state: RngState;

  constructor(state: RngState) {
    this.state = state;
  }

  static fromSeed(seed: number | string): Rng {
    const h = hashString(String(seed));
    const r = new Rng({ a: h ^ 0x9e3779b9, b: (h * 0x85ebca6b) >>> 0, c: (h ^ 0xc2b2ae35) >>> 0, d: 1 });
    for (let i = 0; i < 12; i++) r.next();
    return r;
  }

  /** A derived, independent stream (used for per-container loot so order of searching doesn't matter). */
  derive(...parts: (string | number)[]): Rng {
    return Rng.fromSeed(`${this.state.a}:${parts.join(':')}`);
  }

  /** Float in [0, 1). */
  next(): number {
    const s = this.state;
    s.a >>>= 0;
    s.b >>>= 0;
    s.c >>>= 0;
    s.d >>>= 0;
    let t = (s.a + s.b) | 0;
    s.a = s.b ^ (s.b >>> 9);
    s.b = (s.c + (s.c << 3)) | 0;
    s.c = (s.c << 21) | (s.c >>> 11);
    s.d = (s.d + 1) | 0;
    t = (t + s.d) | 0;
    s.c = (s.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  weighted<T>(entries: readonly { weight: number; value: T }[]): T {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= e.weight;
      if (roll < 0) return e.value;
    }
    return entries[entries.length - 1]!.value;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
    }
    return arr;
  }
}

export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
