# HOLDOUT — Design & Architecture

Companion to `docs/BRIEF.md` (the authoritative requirements). This document records how the
game is structured and the decisions made while building it. `docs/ROADMAP.md` tracks status.
`docs/CONTENT_GUIDE.md` explains how to add content.

## 1. Pillars (from the brief)
1. Every trip outside is a decision: time, noise, weight and supplies are the real currencies.
2. Scarcity breeds resourcefulness: craft, repair, mod and barter more than you find.
3. Tension comes from information: limited vision, darkness and sound.
4. A personal story with a fixed protagonist plus side stories that give the city its people.

## 2. Core loop
Safehouse (eat, craft, trade, quests, save) → World map (pick destination, pay time or fuel) →
Zone (explore top-down, sneak/fight, search, loot under a weight limit) → Get out → Back home.

## 3. Architecture overview

```
src/
  main.ts               boot: validate content → create store → start Phaser → mount Preact UI
  config/balance.ts     every tunable number (brief §7) + difficulty presets
  core/                 GameState types, EventBus, RNG, store (state + dispatch + bus), clock
  content/              zod schemas, loader/registry, and data/*.json (all game content)
  systems/              pure game rules. No Phaser imports. Operate on GameState / ZoneState.
  sim/                  the per-zone simulation (player, zombies, projectiles, noise, FOV) — pure TS
  game/                 Phaser: scenes, placeholder art generation, asset manifest, audio, renderers
  ui/                   Preact: HUD + every screen, rendered as an HTML overlay above the canvas
  dev/                  debug overlay + console (`?debug=1` or dev build only)
scripts/validate-content.ts   `npm run validate:content`
tests/unit/                   vitest
e2e/                          Playwright smoke test
```

### 3.1 The three layers
1. **State** — `GameState` (`src/core/types.ts`) is one serializable plain object. It holds the
   player, inventory, equipment, needs, status effects, skills/XP, time, the current `ZoneState`,
   remembered zone states, quests and flags, traders, base, vehicle, world-map knowledge, RNG seed
   and stream state, hints seen, and settings. The save file is `{ version, state }` and nothing else.
2. **Systems** — plain TS modules in `src/systems/` and `src/sim/`. Each exports functions of the
   shape `fn(ctx, ...args)` where `ctx: GameContext = { state, content, bus, rng }`. They mutate the
   state in place (it's the single owner) and emit typed events through the bus. They never import
   Phaser or touch the DOM, so they run in vitest as-is.
3. **Presentation** — Phaser scenes render the `ZoneState` and translate input into sim actions;
   Preact renders screens from `GameState` and dispatches actions through the store. Neither
   layer holds authoritative game data.

### 3.2 Store and event bus
`src/core/store.ts` owns the `GameContext`. It exposes `store.state`, `store.content`,
`store.bus`, `store.rng`, and `store.notify()` which bumps a version counter that the Preact
`useGame()` hook subscribes to. The HUD additionally refreshes on a 10 Hz heartbeat so needs bars
and the clock update without every system calling `notify()`.

`src/core/events.ts` defines `GameEvents` — a map of event name → payload type — and a tiny typed
`EventBus` with `on/off/once/emit`. Quests (`systems/quests.ts`) subscribe to events such as
`enemy:killed`, `item:acquired`, `zone:entered`, `npc:talked`, `interact`, `item:crafted`,
`flag:set` and advance objectives. UI-only events are prefixed `ui:` and in-world feedback
events (`fx:*`) are consumed by the Phaser scene.

### 3.3 Zone simulation (`src/sim/`)
A zone is a `ZoneState` = tile grid (walkable/opaque/noise-material flags) + entities (player,
zombies, projectiles, decals cap, dropped items) + per-object state (doors, containers, nests).
`sim/step.ts` advances the sim by `dt` seconds given a `PlayerInput`. Everything in it is pure:
FOV shadowcasting (`sim/fov.ts`), A* with throttled repathing (`sim/pathfinding.ts`), zombie
AI state machine (`sim/zombieAI.ts`), noise propagation (`sim/noise.ts`), combat resolution
(`sim/combat.ts`). The Phaser `ZoneScene` is a thin renderer + input mapper over this, so the
whole zone sim is unit-testable and the save can snapshot the zone mid-visit.

When the player leaves, `ZoneState` is persisted into `state.zones[zoneId]` (containers, doors,
dropped items, cleared nests, surviving zombies, last-visit time). On re-entry the sim is rebuilt
from the ASCII map plus that remembered state, and zombies partly regenerate by elapsed days.

### 3.4 Content pipeline
All content lives in `src/content/data/*.json` and is imported through Vite. `src/content/index.ts`
parses each file with its zod schema (`src/content/schemas.ts`) at boot and builds a `Content`
registry (`content.items[id]`, `content.zones[id]`, …). `scripts/validate-content.ts` runs the same
schemas in Node plus cross-reference checks: every id reference resolves, every zone legend char is
known, every quest objective's required items are obtainable (loot table, trader stock, recipe, dialogue
grant or zone object), and every dialogue node link resolves. All display names live in
`data/names.json` so renaming is a single edit.

Zones are ASCII rows + a legend (defaults in `data/legend.json`, overridable per zone) + an `objects`
list for anything that needs parameters (locked door key id, named container, NPC, exit → map node,
trigger areas, loot override). `systems/zoneLoader.ts` turns a `ZoneDef` into a `ZoneState`; a Tiled
importer would just produce the same intermediate structure.

### 3.5 Random numbers
`core/rng.ts` is an sfc32 generator; the stream state (4 uint32s) is in the save. Loot rolls use a
derived stream seeded from `(saveSeed, zoneId, containerId)` so the same container in the same save
always rolls the same, and results are stored once rolled.

### 3.6 UI
Preact components under `src/ui/`. `App.tsx` renders the HUD and the current screen stack
(`state.ui.screens`). Screens: main menu, pause, settings, inventory, loot, crafting, workbench/mods,
trade, dialogue, journal, zone map, world map, sleep/wait, death, text card, console. Screens that
pause the clock set `ui.clockStopped` via `screens.ts` metadata. The HUD is always DOM; prompts,
damage numbers, enemy health bars and pings are drawn in Phaser.

### 3.7 Art and audio
`game/art/placeholders.ts` generates every texture at boot via Phaser graphics into a texture atlas
keyed by the asset manifest in `game/art/manifest.ts`. Replacing a placeholder = loading a real image
under the same key. `game/audio/AudioManager.ts` synthesises SFX with WebAudio, keyed by event name,
with stereo pan + distance falloff from the listener (player) position.

## 4. Systems summary
- **Time**: `state.time.minutes` (game minutes since day 0 00:00). 1 real s = 1 game min while the
  clock runs. Night 21:00–05:00. Clock stops for dialogue, trade, crafting, maps, pause (and the
  inventory if the setting says so).
- **Needs**: hunger/thirst drain per minute from `balance.needs`; multipliers for sprinting/fighting/
  sleeping. Debuffs below 25; HP loss at 0.
- **Status effects**: bleeding, infection (progress 0–100 over 72h), food poisoning, encumbered,
  well-fed. `systems/survival.ts`.
- **Combat**: melee arcs with wind-up/recovery, sneak ×3; firearms with magazine/reserve by ammo type,
  bloom, wall-blocking raycast, jam chance on crude guns; shove; throwables; durability.
- **Zombies**: walker/runner/bloater(+boss)/screamer; senses (hearing radius, vision cone with modifiers);
  states idle → investigate → chase → attack → search → idle; A* grid pathing + separation; door bashing;
  sleep when far from the player.
- **Inventory**: weight-based with stacking; equipment slots; quick slots. `systems/inventory.ts`.
- **Loot**: tables by container type × danger tier; rolled once; `systems/loot.ts`.
- **Crafting**: recipes with station requirements and tiers, blueprints unlock, quality from bench tier
  + Crafting rank; mods on slots; repair/dismantle. `systems/crafting.ts`.
- **Dialogue/Quests**: data-driven graphs with conditions and effects; quests with typed objectives
  and multiple outcomes. `systems/dialogue.ts`, `systems/quests.ts`.
- **Trade**: barter with live totals; pricing invariant sell ≤ buy-back. `systems/trade.ts`.
- **Travel**: world map nodes, foot/vehicle cost, travel events. `systems/travel.ts`.
- **Progression**: XP → levels → skill points; 7 skills rank 0–5. `systems/progression.ts`.
- **Save**: versioned JSON in localStorage; 3 slots + autosave; export/import; migrations. `systems/save.ts`.

## 5. Decisions log
| # | Decision | Why |
|---|----------|-----|
| 1 | Phaser **4.2.1** (latest stable on npm at build time), pinned exactly. | Brief asks for latest stable. The Phaser 3 scene/graphics API we use is unchanged in 4. |
| 2 | TypeScript **5.9.3** rather than 7.x. | typescript-eslint 8 doesn't support the TS 7 native compiler yet; 5.9 is the stable toolchain. |
| 3 | Preact 10 without `@preact/preset-vite`; JSX configured via esbuild `jsxImportSource`. | Avoids a preset with uncertain Vite 8 compatibility; nothing else from the preset is needed. |
| 4 | Content as **JSON** files (ASCII maps as arrays of row strings). | Editable by humans and agents without a TS toolchain; imports natively via Vite and Node. |
| 5 | The zone sim is pure TS (`src/sim`) and Phaser only renders it. | Lets the whole zone (AI, FOV, combat) run in vitest, and lets saves snapshot a zone mid-visit. |
| 6 | One `GameState` object, mutated in place by systems; UI re-renders from a version counter. | Simplicity. Immutable updates would cost a lot of code for no gameplay benefit. |
| 7 | sfc32 RNG with derived streams per `(seed, zoneId, containerId)` for loot. | Loot is deterministic per save even if the player searches containers in a different order. |
| 8 | The hub (Firehouse 9) is just a zone with `safe: true`: no spawns, weapons holstered, stations as objects. | One zone pipeline, no special hub scene. |
| 9 | Vehicle travel is unlocked by a flag set when the ambulance is repaired; fuel is a number in `state.vehicle`. | Keeps trunk storage/upgrades (not in v1) possible later as more fields. |
| 10 | Difficulty is a multiplier table applied by `balance.ts` getters. | Brief §5 asks for presets as multipliers; no content duplication. |
| 11 | Dying reloads the most recent save (autosave or manual, whichever is newest). | Brief: no permadeath. |
| 12 | Dev tools gated on `import.meta.env.DEV || location.search.includes('debug=1')`. | Brief §5. |
| 13 | Searching uses a hold-E progress bar; the loot window opens only on completion; interrupted by damage or movement. | Brief. |
| 14 | Playwright pinned to 1.56.1 to match the browsers preinstalled in the build container. | CI installs its own; local runs don't redownload. |
| 15 | Vite 8 transforms with Oxc, so JSX is configured with `oxc.jsx` (automatic runtime, `preact`), not the deprecated `esbuild` option. `vite preview` also uses base `/game/` so the e2e test exercises the Pages build. | The esbuild option is deprecated in Vite 8; previewing at `/` served HTML for every asset. |
| 16 | The inventory, loot window and journal do **not** stop the clock in the field (the `inventoryPausesClock` setting changes that); dialogue, trade, crafting, maps, pause, sleep, stash and story cards do. | Brief §5 lists what stops the clock; looting and reading are part of the tension. |
| 17 | Sam's starting kit and starting needs live in `balance.ts` (`BALANCE.start`), not in code. | Tunable like every other number; the validator reads the same list. |
| 18 | Containers drawn as several adjacent identical legend chars merge into one container (a 2×3 car wreck is one trunk, a row of `s` is one shelf). | Lets ASCII maps draw big props without spawning a container per tile. |
| 19 | Notes are inventory items (weight 0) that are read automatically on pickup and stay in the journal; their effects (reveal a location, a stash code, a recipe) run once. | Brief lists notes as an item type and as story delivery. |
| 21 | Firearms are hitscan (with a short tracer) rather than simulated projectiles; walls and closed doors stop them. | Reliable hits at 60 fps and trivially testable; thrown objects are the only projectiles. |
| 22 | The ×3 sneak multiplier applies to melee and the crossbow (silent weapons) on zombies that aren't hunting you, hit from outside their vision cone. Guns don't get it. | Matches the stealth pillar: loud weapons shouldn't be assassination tools. |
| 23 | At night zombies move ×1.2, but runners are capped just under sprint speed. | Brief: nights are faster and deadlier, runners stay "just under sprint" so escape is still possible. |
| 24 | Zombie population per zone = density × spawn points × 0.6 (×1.6 at night, × difficulty), rolled on first entry; nests (`nest` objects) are fixed groups whose clearing is remembered; a night trickle adds one zombie per real minute from an unseen spawn point up to the zone cap. | Brief §5 persistence + "nights are more dangerous" while staying in a zone. |
| 25 | Overlay tiles (broken glass, doors, fences, trees, bushes, counters, rubble) are drawn over the most common neighbouring ground. | Glass on asphalt looks like asphalt with glass, without extra legend chars. |
| 26 | At the safehouse, crafting, repairs and upgrades draw materials from the pack first, then the stash. | Saves a stash shuffle every craft; the stash is "at home" anyway. |
| 27 | Crafted gear quality = 0.88 + 0.08 per bench tier above 1 + 0.04 per Crafting rank (max 1.25); it scales damage and max durability. | Brief: quality depends on bench tier and skill. |
| 28 | Marker chars in maps (P, Z/z, E/e, lamps) take the ground tile of their surroundings. | Lets a designer drop a spawn or start anywhere without a wooden patch on the road. |
| 20 | Locked doors/containers: hold **E** uses the quietest method you have (key → lockpick → crowbar); hold **Shift+E** forces it with a crowbar. Codes from notes act as keys (`key:<id>` flags). | Keeps "hold E to pick locks" from the brief while letting the player choose loud-and-fast. |
