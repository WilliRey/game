import { debugInfo, devTools } from '@/dev/devtools';
import { useHeartbeat, useStore } from '../context';

/** F3 debug overlay: FPS, entity counts and AI summary. World-space parts are drawn by the zone scene. */
export function DebugPanel() {
  const store = useStore();
  useHeartbeat(4);
  if (!devTools.enabled || !devTools.overlay || !store.state?.zone) return null;
  const z = store.state.zone;
  const modes: Record<string, number> = {};
  for (const zz of z.zombies) modes[zz.mode] = (modes[zz.mode] ?? 0) + 1;
  return (
    <div class="debug-panel" data-debug>
      <div>
        <b>{debugInfo.fps}</b> fps · frame {debugInfo.frameMs.toFixed(1)} ms · sim{' '}
        {debugInfo.simMs.toFixed(1)} ms
      </div>
      <div>
        zombies {debugInfo.zombies} (awake {debugInfo.awake}, hunting {debugInfo.chasing}) · entities{' '}
        {debugInfo.entities}
      </div>
      <div>
        AI:{' '}
        {Object.entries(modes)
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ') || '—'}
      </div>
      <div>
        tile {debugInfo.playerTile} · noise {debugInfo.noise.toFixed(1)} · zone {z.zoneId} · danger {z.danger}
      </div>
      <div class="muted">F3 overlay · ` console · fog {devTools.fovOff ? 'OFF' : 'on'} (console: fov)</div>
    </div>
  );
}
