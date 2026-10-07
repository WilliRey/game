import { useEffect, useRef } from 'preact/hooks';
import { getLayout } from '@/sim/layout';
import { TILE_KINDS, TILE_PROPS } from '@/sim/tiles';
import { objectiveMarker } from '@/systems/markers';
import { Modal } from '../components/Modal';
import { useStore } from '../context';

/** The explored part of the current zone: walls, floors, containers (searched or not), exits, people. */
export function ZoneMap() {
  const store = useStore();
  const ref = useRef<HTMLCanvasElement>(null);
  const zone = store.state.zone;
  useEffect(() => {
    const c = ref.current;
    if (!c || !zone) return;
    const layout = getLayout(store.content, zone.zoneId);
    const scale = Math.max(4, Math.min(10, Math.floor(Math.min(880 / zone.w, 520 / zone.h))));
    c.width = zone.w * scale;
    c.height = zone.h * scale;
    const g = c.getContext('2d')!;
    g.fillStyle = '#07080a';
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < zone.h; y++) {
      for (let x = 0; x < zone.w; x++) {
        const i = y * zone.w + x;
        if (!zone.explored[i]) continue;
        const kind = TILE_KINDS[zone.tiles[i]!]!;
        const p = TILE_PROPS[kind];
        g.fillStyle =
          p.opaque && p.solid
            ? '#5a5f66'
            : kind === 'water'
              ? '#22343f'
              : p.solid
                ? '#3c4046'
                : kind === 'road'
                  ? '#24262a'
                  : kind === 'grass'
                    ? '#26301f'
                    : '#2f2b27';
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    const seen = (x: number, y: number) => zone.explored[Math.floor(y) * zone.w + Math.floor(x)] === 1;
    for (const d of Object.values(zone.doors)) {
      if (!seen(d.x, d.y)) continue;
      g.fillStyle = d.broken ? '#6a4a3a' : d.locked ? '#b49a3a' : '#8a6a46';
      g.fillRect(d.x * scale + 1, d.y * scale + 1, scale - 2, scale - 2);
    }
    for (const ct of Object.values(zone.containers)) {
      if (!seen(ct.x, ct.y)) continue;
      g.fillStyle = ct.searched ? (ct.items.length ? '#6a7a5a' : '#3a3a36') : '#d9a441';
      g.fillRect(ct.x * scale + 1, ct.y * scale + 1, ct.w * scale - 2, ct.h * scale - 2);
    }
    for (const s of layout.stations) {
      if (!seen(s.x, s.y)) continue;
      g.fillStyle = '#6f9fc4';
      g.fillRect(s.x * scale + 1, s.y * scale + 1, s.w * scale - 2, s.h * scale - 2);
    }
    for (const e of layout.exits) {
      g.fillStyle = '#5fbf77';
      g.fillRect(e.x * scale, e.y * scale, e.w * scale, e.h * scale);
    }
    for (const n of zone.npcs) {
      if (!seen(n.x, n.y)) continue;
      g.fillStyle = '#9bd0e8';
      g.beginPath();
      g.arc(n.x * scale, n.y * scale, scale * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    const m = objectiveMarker(store.ctx);
    if (m) {
      g.strokeStyle = '#f0c060';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(m.x * scale, m.y * scale, scale * 1.4, 0, Math.PI * 2);
      g.stroke();
    }
    const p = zone.player;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(p.x * scale + Math.cos(p.facing) * scale * 1.4, p.y * scale + Math.sin(p.facing) * scale * 1.4);
    g.lineTo(p.x * scale + Math.cos(p.facing + 2.4) * scale, p.y * scale + Math.sin(p.facing + 2.4) * scale);
    g.lineTo(p.x * scale + Math.cos(p.facing - 2.4) * scale, p.y * scale + Math.sin(p.facing - 2.4) * scale);
    g.closePath();
    g.fill();
  }, [zone]);
  if (!zone) return null;
  const name = store.content.zones[zone.zoneId]?.name ?? zone.zoneId;
  const total = Object.keys(zone.containers).length;
  const searched = Object.values(zone.containers).filter((c) => c.searched).length;
  return (
    <Modal id="zoneMap" title={name} width={940}>
      <div class="zone-map-wrap">
        <canvas ref={ref} class="zone-map" />
      </div>
      <div class="map-legend muted small">
        <span>
          <i style={{ background: '#d9a441' }} /> unsearched
        </span>
        <span>
          <i style={{ background: '#6a7a5a' }} /> searched
        </span>
        <span>
          <i style={{ background: '#6f9fc4' }} /> station
        </span>
        <span>
          <i style={{ background: '#5fbf77' }} /> exit
        </span>
        <span>
          <i style={{ background: '#9bd0e8', borderRadius: '50%' }} /> person
        </span>
        <span>
          {searched}/{total} containers searched
        </span>
      </div>
    </Modal>
  );
}
