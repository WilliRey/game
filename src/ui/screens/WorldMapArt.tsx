import { Rng } from '@/core/rng';

/** The river: the city's north edge. Northgate lies beyond it. Map units are kilometres. */
const RIVER = 'M0,1.75 C2.5,1.25 4.5,2.05 7.2,1.45 S11.5,0.55 14,0.95';

interface Street {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Placeholder city: a jittered street grid south of the river, parks, the highway and district names. */
function buildStreets(): {
  streets: Street[];
  blocks: { x: number; y: number; w: number; h: number; shade: number }[];
} {
  const rng = Rng.fromSeed('harrow-map');
  const streets: Street[] = [];
  const blocks: { x: number; y: number; w: number; h: number; shade: number }[] = [];
  const xs: number[] = [];
  for (let x = 0.3; x < 14; x += 0.75 + rng.range(-0.12, 0.18)) xs.push(x);
  const ys: number[] = [];
  for (let y = 2.3; y < 9; y += 0.7 + rng.range(-0.1, 0.16)) ys.push(y);
  for (const x of xs) {
    const top = 2.1 + (x > 7 ? -0.5 : 0) + rng.range(0, 0.2);
    streets.push({ x1: x, y1: top, x2: x + rng.range(-0.15, 0.15), y2: 9 });
  }
  for (const y of ys) streets.push({ x1: 0, y1: y, x2: 14, y2: y + rng.range(-0.12, 0.12) });
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      if (rng.chance(0.25)) continue;
      const x = xs[i]! + 0.08;
      const y = ys[j]! + 0.08;
      blocks.push({
        x,
        y,
        w: xs[i + 1]! - xs[i]! - 0.16,
        h: ys[j + 1]! - ys[j]! - 0.16,
        shade: rng.int(0, 2),
      });
    }
  }
  return { streets, blocks };
}

const CITY = buildStreets();
const BLOCK_FILL = ['#1d2022', '#202326', '#1a1c1e'];

export function WorldMapArt() {
  return (
    <g class="map-art" pointer-events="none">
      <rect x="0" y="0" width="14" height="9" fill="#141618" />
      {CITY.blocks.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={Math.max(0.05, b.w)}
          height={Math.max(0.05, b.h)}
          fill={BLOCK_FILL[b.shade]}
        />
      ))}
      {/* parks */}
      <ellipse cx="2.9" cy="3.1" rx="0.55" ry="0.35" fill="#1c2a1d" />
      <ellipse cx="8.6" cy="6.4" rx="0.9" ry="0.55" fill="#1c2a1d" />
      <ellipse cx="11.6" cy="4.6" rx="0.6" ry="0.4" fill="#1c2a1d" />
      {CITY.streets.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#2b2f32" stroke-width="0.035" />
      ))}
      {/* north bank: Northgate */}
      <path d={`${RIVER} L14,0 L0,0 Z`} fill="#17191b" />
      <path d={RIVER} fill="none" stroke="#1f3242" stroke-width="0.62" />
      <path d={RIVER} fill="none" stroke="#284256" stroke-width="0.34" />
      {/* the Northgate bridge */}
      <line x1="11.7" y1="0.62" x2="11.7" y2="1.38" stroke="#5a4a3a" stroke-width="0.12" />
      {/* Route 17 */}
      <path
        d="M0,5.05 C2.5,4.7 4.6,4.15 6.6,3.9 S11,3.25 14,3.05"
        fill="none"
        stroke="#3b3a35"
        stroke-width="0.2"
      />
      <path
        d="M0,5.05 C2.5,4.7 4.6,4.15 6.6,3.9 S11,3.25 14,3.05"
        fill="none"
        stroke="#6a6450"
        stroke-width="0.02"
        stroke-dasharray="0.15 0.12"
      />
      <g class="district" fill="#4a4f53">
        <text x="12.3" y="0.42" text-anchor="middle">
          NORTHGATE
        </text>
        <text x="1.2" y="2.75" text-anchor="middle">
          WESTSIDE
        </text>
        <text x="2.0" y="8.35" text-anchor="middle">
          DEPOT DISTRICT
        </text>
        <text x="5.7" y="7.6" text-anchor="middle">
          KESSLER
        </text>
        <text x="9.4" y="3.2" text-anchor="middle">
          ROUTE 17
        </text>
        <text x="12.7" y="3.6" text-anchor="middle">
          ST. AGNES HILL
        </text>
        <text x="4.9" y="2.15" text-anchor="middle">
          RIVER HARROW
        </text>
      </g>
    </g>
  );
}
