/**
 * Debug console commands (brief §5 Dev tools). Each command gets the store and its arguments and returns
 * lines of output. Opened with the backtick key in dev builds or with ?debug=1.
 */
import type { GameStore } from '@/core/store';
import { SKILL_IDS, type SkillId } from '@/core/types';
import { getRuntime, rebuildGrids } from '@/sim/runtime';
import { spawnEnemy } from '@/sim/spawn';
import { addItem } from '@/systems/inventory';
import { grantXp } from '@/systems/progression';
import { setQuestStage } from '@/systems/quests';
import { changeReputation, setFlag, unlockNode } from '@/systems/story';
import { enterZone } from '@/systems/zones';
import { devTools } from './devtools';

type Cmd = { help: string; run: (store: GameStore, args: string[]) => string[] };

function num(s: string | undefined, fallback: number): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

export const COMMANDS: Record<string, Cmd> = {
  help: {
    help: 'help — list commands',
    run: () => Object.values(COMMANDS).map((c) => c.help),
  },
  give: {
    help: 'give <itemId> [qty] — add items to the inventory',
    run: (store, [id, qty]) => {
      if (!id || !store.content.items[id]) return [`unknown item '${id ?? ''}' (try: items ${id ?? ''})`];
      addItem(store.ctx, id, num(qty, 1), 'console');
      return [`gave ${num(qty, 1)} × ${id}`];
    },
  },
  items: {
    help: 'items [filter] — list item ids',
    run: (store, [f]) => {
      const ids = store.content.lists.items.map((i) => i.id).filter((id) => !f || id.includes(f));
      return [ids.join('  ') || 'no match'];
    },
  },
  heal: {
    help: 'heal — full health, stamina, food and water; clear effects',
    run: (store) => {
      const p = store.state.player;
      p.hp = p.maxHp;
      p.stamina = p.maxStamina;
      p.hunger = 100;
      p.thirst = 100;
      p.effects = [];
      p.dead = false;
      return ['healed'];
    },
  },
  god: {
    help: 'god — toggle god mode',
    run: (store) => {
      store.state.player.godMode = !store.state.player.godMode;
      return [`god mode ${store.state.player.godMode ? 'on' : 'off'}`];
    },
  },
  noclip: {
    help: 'noclip — toggle walking through walls',
    run: (store) => {
      store.state.player.noclip = !store.state.player.noclip;
      return [`noclip ${store.state.player.noclip ? 'on' : 'off'}`];
    },
  },
  time: {
    help: 'time <HH:MM> | time +<minutes> — set or advance the clock',
    run: (store, [t]) => {
      const tm = store.state.time;
      if (!t) return [`minutes=${tm.minutes.toFixed(1)}`];
      if (t.startsWith('+')) {
        tm.minutes += num(t.slice(1), 0);
        return [`advanced ${t.slice(1)} min`];
      }
      const [h, m] = t.split(':').map((x) => Number(x));
      if (!Number.isFinite(h)) return ['usage: time 21:30'];
      const day = Math.floor(tm.minutes / 1440);
      let target = day * 1440 + (h ?? 0) * 60 + (m ?? 0);
      if (target < tm.minutes) target += 1440;
      tm.minutes = target;
      return [`time set to ${t}`];
    },
  },
  timescale: {
    help: 'timescale <x> — game clock speed multiplier (1 = 1 min per second)',
    run: (store, [x]) => {
      store.state.time.scale = Math.max(0, num(x, 1));
      return [`time scale ${store.state.time.scale}`];
    },
  },
  tp: {
    help: 'tp <zoneId> [entry] — teleport to a zone',
    run: (store, [z, entry]) => {
      if (!z || !store.content.zones[z])
        return [`unknown zone; zones: ${Object.keys(store.content.zones).join(', ')}`];
      setTimeout(() => enterZone(store.ctx, z, entry), 0);
      return [`teleporting to ${z}`];
    },
  },
  zones: {
    help: 'zones — list zone ids',
    run: (store) => [Object.keys(store.content.zones).join('  ')],
  },
  spawn: {
    help: 'spawn <enemyType> [n] — spawn enemies near the cursor-facing side of the player',
    run: (store, [type, n]) => {
      const zone = store.state.zone;
      if (!zone) return ['no zone'];
      if (!type || !store.content.enemies[type])
        return [`unknown enemy; types: ${Object.keys(store.content.enemies).join(', ')}`];
      const p = zone.player;
      let made = 0;
      for (let i = 0; i < num(n, 1); i++) {
        const a = p.facing + (Math.random() - 0.5) * 1.2;
        const d = 4 + Math.random() * 3;
        if (spawnEnemy(store.ctx, zone, type, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d)) made++;
      }
      return [`spawned ${made} ${type}`];
    },
  },
  kill: {
    help: 'kill — kill every zombie in the zone',
    run: (store) => {
      const zone = store.state.zone;
      if (!zone) return ['no zone'];
      const n = zone.zombies.length;
      zone.zombies = [];
      return [`removed ${n} zombies`];
    },
  },
  quest: {
    help: 'quest <id> <stage> — start a quest / jump to a stage',
    run: (store, [id, stage]) => {
      if (!id || !store.content.quests[id])
        return [`unknown quest; quests: ${Object.keys(store.content.quests).join(', ')}`];
      return [
        setQuestStage(store.ctx, id, num(stage, 0)) ? `quest ${id} → stage ${num(stage, 0)}` : 'bad stage',
      ];
    },
  },
  rep: {
    help: 'rep <n> — set camp reputation (0–100)',
    run: (store, [n]) => {
      changeReputation(store.ctx, num(n, 50) - store.state.reputation);
      return [`reputation ${store.state.reputation}`];
    },
  },
  xp: {
    help: 'xp <n> — grant XP',
    run: (store, [n]) => {
      grantXp(store.ctx, num(n, 100), 'console');
      return [
        `level ${store.state.player.level}, xp ${store.state.player.xp}, skill points ${store.state.player.skillPoints}`,
      ];
    },
  },
  skill: {
    help: 'skill <id> <rank> — set a skill rank',
    run: (store, [id, r]) => {
      if (!id || !SKILL_IDS.includes(id as SkillId)) return [`skills: ${SKILL_IDS.join(', ')}`];
      store.state.player.skills[id as SkillId] = Math.max(0, Math.min(5, num(r, 1)));
      return [`${id} = ${store.state.player.skills[id as SkillId]}`];
    },
  },
  flag: {
    help: 'flag <key> [value] — set a story flag',
    run: (store, [k, v]) => {
      if (!k)
        return [
          Object.entries(store.state.flags)
            .map(([a, b]) => `${a}=${b}`)
            .join('  ') || 'no flags',
        ];
      setFlag(
        store.ctx,
        k,
        v === undefined ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v,
      );
      return [`${k} = ${store.state.flags[k]}`];
    },
  },
  fuel: {
    help: 'fuel <liters> — set vehicle fuel (and give the vehicle)',
    run: (store, [l]) => {
      store.state.vehicle.owned = true;
      store.state.vehicle.fuel = Math.min(store.state.vehicle.maxFuel, num(l, 20));
      return [`vehicle fuel ${store.state.vehicle.fuel} L`];
    },
  },
  reveal: {
    help: 'reveal — reveal every world-map location and the current zone map',
    run: (store) => {
      for (const n of store.content.lists.worldNodes) unlockNode(store.ctx, n.id);
      const zone = store.state.zone;
      if (zone) {
        zone.explored.fill(1);
        rebuildGrids(getRuntime(store.content, zone), store.content);
      }
      return ['map revealed'];
    },
  },
  fov: {
    help: 'fov — toggle fog of war (debug)',
    run: () => {
      devTools.fovOff = !devTools.fovOff;
      return [`fog of war ${devTools.fovOff ? 'off' : 'on'}`];
    },
  },
  debug: {
    help: 'debug — toggle the debug overlay (also F3)',
    run: () => {
      devTools.overlay = !devTools.overlay;
      return [`overlay ${devTools.overlay ? 'on' : 'off'}`];
    },
  },
};

export function runCommand(store: GameStore, line: string): string[] {
  const [name, ...args] = line.trim().split(/\s+/);
  if (!name) return [];
  const cmd = COMMANDS[name.toLowerCase()];
  if (!cmd) return [`unknown command '${name}' — try help`];
  if (!store.hasGame && name !== 'help') return ['no game running'];
  try {
    const out = cmd.run(store, args);
    store.notify();
    return out;
  } catch (e) {
    return [`error: ${e instanceof Error ? e.message : String(e)}`];
  }
}
