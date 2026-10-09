# HOLDOUT — Design & Architecture

Companion to `docs/BRIEF.md` (the authoritative requirements) and `docs/BRIEF_V2.md` (the v2 pass: 3D view,
visible melee, melee balance, classes, faster searching). This document records how the game is structured
and the decisions made while building it. `docs/ROADMAP.md` tracks status. `docs/CONTENT_GUIDE.md` explains
how to add content.

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
  main.ts               boot: validate content → create store → start the 3D renderer → mount Preact UI
  config/balance.ts     every tunable number (brief §7) + difficulty presets
  core/                 GameState types, EventBus, RNG, store (state + dispatch + bus), clock
  content/              zod schemas, loader/registry, and data/*.json (all game content)
  systems/              pure game rules. No renderer imports. Operate on GameState / ZoneState.
  sim/                  the per-zone simulation (player, zombies, projectiles, noise, FOV) — pure TS
  game/                 three.js: engine, views (title, zone), procedural models + textures, asset
                        manifest/overrides, input, audio, the Canvas2D fallback renderer
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
   the renderer or touch the DOM, so they run in vitest as-is.
3. **Presentation** — the three.js views render the `ZoneState` and translate input into sim actions;
   Preact renders screens from `GameState` and dispatches actions through the store. Neither
   layer holds authoritative game data. (v1 used Phaser here. Swapping it for three.js in v2 changed no
   game rules; the sim only gained a few `fx:*` events for the richer melee feedback.)

### 3.2 Store and event bus
`src/core/store.ts` owns the `GameContext`. It exposes `store.state`, `store.content`,
`store.bus`, `store.rng`, and `store.notify()` which bumps a version counter that the Preact
`useGame()` hook subscribes to. The HUD additionally refreshes on a 10 Hz heartbeat so needs bars
and the clock update without every system calling `notify()`.

`src/core/events.ts` defines `GameEvents` — a map of event name → payload type — and a tiny typed
`EventBus` with `on/off/once/emit`. Quests (`systems/quests.ts`) subscribe to events such as
`enemy:killed`, `item:acquired`, `zone:entered`, `npc:talked`, `interact`, `item:crafted`,
`flag:set` and advance objectives. UI-only events are prefixed `ui:` and in-world feedback
events (`fx:*`) are consumed by the zone view.

### 3.3 Zone simulation (`src/sim/`)
A zone is a `ZoneState` = tile grid (walkable/opaque/noise-material flags) + entities (player,
zombies, projectiles, decals cap, dropped items) + per-object state (doors, containers, nests).
`sim/step.ts` advances the sim by `dt` seconds given a `PlayerInput`. Everything in it is pure:
FOV shadowcasting (`sim/fov.ts`), A* with throttled repathing (`sim/pathfinding.ts`), zombie
AI state machine (`sim/zombieAI.ts`), noise propagation (`sim/noise.ts`), combat resolution
(`sim/combat.ts`). The three.js `ZoneView` is a thin renderer + input mapper over this, so the
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
pause the clock set `ui.clockStopped` via `screens.ts` metadata. The HUD is always DOM. In-world UI
(prompts, progress rings, damage numbers, enemy health bars, NPC names, objective arrows, noise pings) is
HTML too, in a `#world-ui` layer positioned each frame by projecting world points through the 3D camera
(`game/view/worldUi.ts`).

### 3.7 Art and audio
Every model and texture is requested by a key from `game/art/manifest.ts`. `game/art/assets.ts` returns
the procedural placeholder for a key (low-poly vertex-coloured geometry from `game/art/models.ts`,
canvas-painted textures from `game/art/textures.ts`, built once and cached) unless a real asset is listed
for that key in `MODEL_OVERRIDES` / `TEXTURE_OVERRIDES` (glTF / images, loaded at boot). No third-party art
ships. `game/audio/AudioManager.ts` synthesises SFX with WebAudio, keyed by event name, with stereo pan +
distance falloff from the listener (player) position.

### 3.8 The 3D view (v2)
`game/createGame.ts` owns one `WebGLRenderer` letterboxed to 16:9 and a requestAnimationFrame loop that
updates and draws the active view: `TitleView` (the main-menu backdrop) or `ZoneView`. The director
(`game/director.ts`) switches views on session and zone events. The zone view is built from small layers under
`game/view/zone/`:

- **Coordinates.** 1 tile = 1 world unit; sim `(x, y)` maps to world `(x, z)`, `y` is up, and a sim facing
  `θ` is a rotation of `−θ` about `y`.
- **Camera** (`camera.ts`): perspective, pitched 56° down, 21 units away, following the player with a
  look-ahead toward the cursor (further while aiming), screen shake, a spring-back nudge on melee hits, and
  scripted pans. The mouse aims by raycasting onto a plane at chest height.
- **World** (`world.ts`): floors are one merged mesh textured from a tile atlas (with corner AO and
  mirrored UVs to hide repeats); walls, windows, fences, counters, bushes, rubble and trees are
  `InstancedMesh`es. Roofs are never drawn; tree canopies near the player hide.
- **Line of sight** (`worldMaterial.ts`): a per-tile RGBA `DataTexture` (visible, explored, brightness)
  written from the sim's FOV every frame. Every world material is patched (`onBeforeCompile`) to sample it:
  visible surfaces are lit by the real lights plus a small fill, remembered surfaces are dim and
  desaturated with no live light, unseen ones are black. The same patch cuts walls between the camera and
  the player down to stubs in the vertex shader.
- **Lights** (`lights.ts`): hemisphere + sun/moon by darkness, the flashlight as a shadow-casting spotlight
  from Sam's hand, and a fixed pool of point lights shared by lamps, fire barrels, fires, muzzle flashes,
  explosions and flashbangs (nearest/most important first). Night adds a soft glow around Sam.
- **Characters** (`rig.ts`, `player.ts`, `zombies.ts`, `npcs.ts`): low-poly part rigs posed procedurally
  (walk cycle, idle sway, wind-up, swing, flinch, stagger, death fall). Sam holds the equipped weapon;
  zombies are instanced per body part per type, so fifty cost the same draw calls as one.
- **Props and effects** (`props.ts`, `fx.ts`, `particles.ts`): instanced props by model key (searched
  containers dim), doors that swing, item glints, decals (blood, glass, scorch), a CPU particle system
  (sparks, blood, flames, smoke, gas, dust), tracers, muzzle flashes, thrown objects in flight, hazards,
  scout rings.
- **Quality** (`quality.ts`): HIGH or LOW chosen from the WebGL renderer string, `?quality=` overrides it;
  `?renderer=2d` (or no WebGL) uses `fallback2d.ts`, a Canvas2D top-down renderer of the same zone.

## 4. Systems summary
- **Time**: `state.time.minutes` (game minutes since day 0 00:00). 1 real s = 1 game min while the
  clock runs. Night 21:00–05:00. Clock stops for dialogue, trade, crafting, maps, pause (and the
  inventory if the setting says so).
- **Needs**: hunger/thirst drain per minute from `balance.needs`; multipliers for sprinting/fighting/
  sleeping. Debuffs below 25; HP loss at 0.
- **Status effects**: bleeding, infection (progress 0–100 over 72h), food poisoning, encumbered,
  well-fed. `systems/survival.ts`.
- **Combat**: melee arcs with wind-up/recovery, sneak ×3; firearms with magazine/reserve by ammo type,
  bloom, wall-blocking raycast, jam chance on crude guns; shove; throwables; durability. Zombie swings are
  telegraphed and every melee hit interrupts them (v2, decisions 53–56).
- **Classes** (v2): Mechanic, Paramedic, Ex-cop, Scavenger from `classes.json` — kit, skill ranks, a
  passive perk read through `perk(ctx)`, a Q ability with a cooldown, class-only recipes, class-specific
  dialogue options and story text. `systems/classes.ts`, `sim/abilities.ts`.
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
| 1 | ~~Phaser **4.2.1** (latest stable on npm at build time), pinned exactly.~~ Superseded by 57. | Brief asks for latest stable. The Phaser 3 scene/graphics API we use is unchanged in 4. |
| 2 | TypeScript **5.9.3** rather than 7.x. | typescript-eslint 8 doesn't support the TS 7 native compiler yet; 5.9 is the stable toolchain. |
| 3 | Preact 10 without `@preact/preset-vite`; JSX configured via esbuild `jsxImportSource`. | Avoids a preset with uncertain Vite 8 compatibility; nothing else from the preset is needed. |
| 4 | Content as **JSON** files (ASCII maps as arrays of row strings). | Editable by humans and agents without a TS toolchain; imports natively via Vite and Node. |
| 5 | The zone sim is pure TS (`src/sim`) and the presentation layer (Phaser in v1, three.js in v2) only renders it. | Lets the whole zone (AI, FOV, combat) run in vitest, and lets saves snapshot a zone mid-visit. |
| 6 | One `GameState` object, mutated in place by systems; UI re-renders from a version counter. | Simplicity. Immutable updates would cost a lot of code for no gameplay benefit. |
| 7 | sfc32 RNG with derived streams per `(seed, zoneId, containerId)` for loot. | Loot is deterministic per save even if the player searches containers in a different order. |
| 8 | The hub (Firehouse 9) is just a zone with `safe: true`: no spawns, weapons holstered, stations as objects. | One zone pipeline, no special hub scene. |
| 9 | Vehicle travel is unlocked by a flag set when the ambulance is repaired; fuel is a number in `state.vehicle`. | Keeps trunk storage/upgrades (not in v1) possible later as more fields. |
| 10 | Difficulty is a multiplier table applied by `balance.ts` getters. | Brief §5 asks for presets as multipliers; no content duplication. |
| 11 | Dying reloads the most recent save (autosave or manual, whichever is newest). | Brief: no permadeath. |
| 12 | Dev tools gated on `import.meta.env.DEV || location.search.includes('debug=1')`. | Brief §5. |
| 13 | ~~Searching uses a hold-E progress bar; the loot window opens only on completion; interrupted by damage or movement.~~ Superseded by 58. | Brief. |
| 14 | Playwright pinned to 1.56.1 to match the browsers preinstalled in the build container. | CI installs its own; local runs don't redownload. |
| 15 | Vite 8 transforms with Oxc, so JSX is configured with `oxc.jsx` (automatic runtime, `preact`), not the deprecated `esbuild` option. `vite preview` also uses base `/game/` so the e2e test exercises the Pages build. | The esbuild option is deprecated in Vite 8; previewing at `/` served HTML for every asset. |
| 16 | The inventory, loot window and journal do **not** stop the clock in the field (the `inventoryPausesClock` setting changes that); dialogue, trade, crafting, maps, pause, sleep, stash and story cards do. | Brief §5 lists what stops the clock; looting and reading are part of the tension. |
| 17 | Sam's starting kit and starting needs live in `balance.ts` (`BALANCE.start`), not in code. | Tunable like every other number; the validator reads the same list. |
| 18 | Containers drawn as several adjacent identical legend chars merge into one container (a 2×3 car wreck is one trunk, a row of `s` is one shelf). | Lets ASCII maps draw big props without spawning a container per tile. |
| 19 | Notes are inventory items (weight 0) that are read automatically on pickup and stay in the journal; their effects (reveal a location, a stash code, a recipe) run once. | Brief lists notes as an item type and as story delivery. |
| 20 | Locked doors/containers: hold **E** uses the quietest method you have (key → lockpick → crowbar); hold **Shift+E** forces it with a crowbar. Codes from notes act as keys (`key:<id>` flags). | Keeps "hold E to pick locks" from the brief while letting the player choose loud-and-fast. |
| 21 | Firearms are hitscan (with a short tracer) rather than simulated projectiles; walls and closed doors stop them. | Reliable hits at 60 fps and trivially testable; thrown objects are the only projectiles. |
| 22 | The ×3 sneak multiplier applies to melee and the crossbow (silent weapons) on zombies that aren't hunting you, hit from outside their vision cone. Guns don't get it. | Matches the stealth pillar: loud weapons shouldn't be assassination tools. |
| 23 | At night zombies move ×1.2, but runners are capped just under sprint speed. | Brief: nights are faster and deadlier, runners stay "just under sprint" so escape is still possible. |
| 24 | Zombie population per zone = density × spawn points × 0.6 (×1.6 at night, × difficulty), rolled on first entry; nests (`nest` objects) are fixed groups whose clearing is remembered; a night trickle adds one zombie per real minute from an unseen spawn point up to the zone cap. | Brief §5 persistence + "nights are more dangerous" while staying in a zone. |
| 25 | Overlay tiles (broken glass, doors, fences, trees, bushes, counters, rubble) are drawn over the most common neighbouring ground. | Glass on asphalt looks like asphalt with glass, without extra legend chars. |
| 26 | At the safehouse, crafting, repairs and upgrades draw materials from the pack first, then the stash. | Saves a stash shuffle every craft; the stash is "at home" anyway. |
| 27 | Crafted gear quality = 0.88 + 0.08 per bench tier above 1 + 0.04 per Crafting rank (max 1.25); it scales damage and max durability. | Brief: quality depends on bench tier and skill. |
| 28 | Marker chars in maps (P, Z/z, E/e, lamps) take the ground tile of their surroundings. | Lets a designer drop a spawn or start anywhere without a wooden patch on the road. |
| 29 | Dialogue choices whose conditions the player can work towards (an item, a skill rank, reputation) are shown disabled with the requirement in brackets; choices gated on story state, flags or cooldowns are hidden. | Shows what's possible without spoiling branches the player can't influence. |
| 30 | Repeatable offers (Ruth's daily ration, Kitchen Duty) use a `stamp` effect that records the game minute under a key and a `cooldown` condition that checks it. | One generic mechanism for "once a day" instead of per-quest timers. |
| 31 | Talking to an NPC emits `npc:talked` **before** the conversation's start node is chosen. | A `talk` objective completes first, so the NPC opens with the follow-up line instead of repeating the request. |
| 32 | Trade prices: they charge `ceil(value × 1.4 × (1 − discount))`; they pay `floor(value × 0.55 × category × (1 + discount/2))`, capped at their charge − 1. Discount = reputation/100 × 15% + 2% per Barter rank. Condition scales value (30% floor), so does crafted quality. | Brief: barter with prices from reputation, skill and wants. The cap makes buy-low/sell-high loops impossible for every item at every discount (unit-tested over all items). |
| 33 | Overpaying in a barter leaves **credit** with that trader (per trader, not shared); credit can't be withdrawn as goods without a new deal. | Barter rarely balances to zero; credit keeps small surpluses from being wasted without making traders a bank. |
| 34 | Trader stock is rerolled every `restockDays` from a seed per (save, trader, restock #); entries can need reputation or a flag. Firearms come with an empty magazine. | Deterministic per save; later stock grows with progress. |
| 35 | Quest markers: the tracked quest's objective is ringed on the zone map and pointed at by an edge arrow in the field; item and enemy objectives only show once that spot has been explored. The world map highlights zones the objective lives in. | Brief §5 Journal: markers on the world map and in-zone, without turning scavenging into a waypoint chase. |
| 36 | Objects can require a key only (`keyOnly`) — the generator room at St. Agnes can't be picked or forced. | Lets quests gate a space on a found key/code without the crowbar bypass. |
| 37 | The vehicle travels with the player: once repaired it's available from any world-map exit, and fuel cans can be poured in from the map, the inventory or at the ambulance in the firehouse garage. | Brief: driving costs fuel; tracking where the car is parked adds walking-back chores without a real decision. |
| 38 | Travel: on foot 25 game-min/km (sneaking and detours) with needs draining ×1.5; by vehicle 2 min/km and 0.8 L/km. Event chance = base (35% foot, 10% vehicle) × distance factor (km/3, clamped 0.5–1.5) × 1.4 at night. Walking is capped at 6 km, so St. Agnes needs the ambulance. | Brief: on foot costs time and so food/water, vehicle is faster with fewer events, some places are too far to walk. |
| 39 | If no known place is reachable (no fuel, everything too far), the map offers a "walk anyway" forced march (×1.5 time, ×1.5 event chance). St. Agnes also has 15 L to siphon and a fuel can. | The 6 km rule must never strand the player at the hospital. |
| 40 | Saves store the whole GameState; the live zone is a snapshot (tiles rebuilt from the layout, explored bitmap RLE, tracers/noise/half-done actions/zombie paths dropped). Missing fields are filled from a fresh state on load; renames/reshapes go through `MIGRATIONS` keyed by source version. Each slot also stores a small meta record for fast listing. | Brief: versioned saves with a migration hook; "resume exactly where they were" mid-zone. |
| 41 | Autosave triggers: entering a zone, quest start/step/completion (at most every 8 s), sleeping in the bunk. Requests wait until it's safe: not hunted (no chasing zombie within 30 tiles), not mid-action and above 25 HP outside the safehouse. Manual saves are refused only while hunted or travelling. | Avoids death loops from an autosave taken mid-fight, without blocking saving in general. |
| 42 | The world map opened at a zone exit plans travel; opened from the zone map (M → World map) it's view-only. | Brief key table: M is the zone map, the world map is reached at exits; planning from inside a zone is still useful. |
| 43 | Death offers "Load last save": the newest of the autosave and the manual slots. Imported saves keep their original timestamp. | Brief: death screen, then load the last save. |
| 44 | An untreated bleed clots after 40 game minutes (0.5 HP/min, so at most ~20 HP); a bandage stops it at once. Retuned by 56. | Before, one scratch was a death sentence on any long walk or time skip, with nothing the player could do mid-travel. |
| 45 | The world map forecasts health lost on the way (bleeding, food poisoning, running out of food or water) and warns when the trip would kill you; it doesn't forbid it. | Travel skips time in one go, so the risk must be visible before committing. |
| 46 | First-visit ambient zombies use a per-save shuffle of the zone's spawn points (seeded by save + zone). | Filling points in map order always crowded the top of every map (the prologue depot got 5 walkers). |
| 47 | Scripted moments include camera pans (`pan` effect): the sim pauses, the HUD steps aside, letterbox + caption, and the target area is lit for the shot. Pans requested while the zone scene is (re)starting are buffered and wait for open text cards to close. | Brief §5 story delivery: "text cards and camera pans". |
| 48 | Placeholder textures and map chunks are painted into CPU-backed canvases (`willReadFrequently`). | GPU-backed 2D canvases forced a GPU readback per texture upload: 20+ s to the main menu under software WebGL. |
| 49 | NPC presence conditions are re-checked on every quest and flag change. | Pike should walk into camp the moment he's saved, not on the next zone visit. |
| 50 | Autosaves show a small HUD indicator; only manual saves toast. | Autosaves happen often (every zone entry and quest step); toasts were noise. |
| 51 | The overlay subscribes to the store in a layout effect and re-renders once if the store changed since its first render. | A notify flushed before the subscription was lost — the main menu sometimes never appeared on fast (cached) boots. |
| 52 | Every zone has a reachability test (BFS from the start; doors and blockers count as passable). | Generated maps had a sealed hospital wing that made Act 1 unwinnable; this class of bug is now caught by `npm test`. |

### v2 decisions (BRIEF_V2)
| # | Decision | Why |
|---|----------|-----|
| 53 | Zombie swings are telegraphed: a wind-up (walker 0.45 s, runner 0.4, bloater 0.6, boss 0.7) with raised arms, a red flush and a red fan on the ground out to the zombie's reach. Every melee hit interrupts a wind-up and stuns for 0.3 s; tough types resist by their stagger resistance (a bloater 60% of the time, the boss 90%), so with them you step out of the fan instead. | v1 melee was a trade of hits. Reading the tell and hitting first (or stepping out of the fan) is now the skill. |
| 54 | Zombie reach is 0.75 tiles past its body (enemies can override; a wind-up that started in reach still lands within +0.3). Every melee weapon reaches clearly further. | In v1 a walker's swing landed from 1.83 tiles while the wrench reached 1.68: you couldn't hit one without being hit. |
| 55 | 0.5 s of invulnerability after any zombie hit lands. | Crowds stacked several hits within a frame or two; three walkers took 25–54 HP from a player trading hits. |
| 56 | Walkers hit for 5–8 (were 8–12; other types scaled to match). Bleeding: 12% per hit (was 20%), 0.4 HP/min, clots after 30 min (was 0.5 for 40). | Targets from BRIEF_V2: a lone walker with a bat or crowbar usually costs 0–10 HP; three at once are dangerous but survivable with shove and footwork. `tests/unit/meleeBalance.test.ts` pins this with scripted fights in the real sim (bots with reaction delay and aim error). |
| 57 | three.js (0.186.1, pinned) replaces Phaser as the presentation layer. The sim stays the source of truth and tile-based; the swap itself needed no save or content changes. | BRIEF_V2 asks for a 3D angled view in the style of Last Stand: Aftermath. three.js is a rendering library, not an engine, which fits a game whose rules already live outside the renderer. |
| 58 | Searching is a tap: E starts a short search (0.4 / 0.7 / 1.0 s by container size, −8% per Scavenging rank, Scavenger −35%) that runs on its own, makes a little noise when it starts and every second, and is cancelled by moving or being hit. The loot window opens the moment it finishes. Locks keep their hold actions. | BRIEF_V2 §5: searching felt slow. Holding E also let key repeat close the loot window as it opened. |
| 59 | Line of sight in 3D comes from the sim's FOV as a per-tile texture sampled by every world material: visible surfaces are really lit, remembered ones dim and desaturated, unseen ones black; zombies and NPCs outside line of sight aren't drawn. | Keeps v1's LOS rules exact (the sim decides what you see) while real lights do the lighting. One texture upload per frame, no extra passes. |
| 60 | Walls, doors and windows in a wedge between the camera and the player (or a pan's target) are pushed down to stubs in the vertex shader; roofs are never drawn. | No CPU work per frame, no transparency sorting, and the player is never hidden. Stubs keep the room's outline readable. |
| 61 | A fixed pool of point lights (6 on HIGH, 2 on LOW) is handed each frame to the most important sources: flashes first (muzzle, explosion, flashbang), then the nearest lamps and fires. The flashlight is a separate shadow-casting spotlight. | A constant light count means shaders never recompile mid-game. |
| 62 | At night the scene gets a soft cool "eyes adjusted" glow around Sam (a shader term, not a light) and unlit particles (smoke, dust, blood mist) dim with the scene. | Night scenes were black in linear space: the character and arm's reach must stay readable while unseen tiles stay dark. |
| 63 | Characters are procedural low-poly part rigs (torso, head, arms, legs, held weapon) posed in code. Zombies render as one `InstancedMesh` per body part per type: each is posed on a shared rig and its part matrices copied into the instances. | No animation assets needed; 62 zombies cost ~80 draw calls and ~60k triangles. |
| 64 | Every model/texture is requested by manifest key; `MODEL_OVERRIDES` / `TEXTURE_OVERRIDES` map keys to glTF/image URLs loaded at boot (rigged characters need nodes named after the rig parts). No third-party assets ship in v2. | Real art (e.g. CC0 packs) drops in without code changes; nothing to license or credit beyond three.js itself. |
| 65 | Two quality tiers chosen from the WebGL renderer string (SwiftShader/llvmpipe → LOW): HIGH = pixel ratio ≤ 1.75, MSAA, 1024² flashlight shadows, 6 point lights; LOW = 0.7, no AA, no shadows, 2 lights. `?quality=high|low` overrides; `?renderer=2d` or no WebGL uses a Canvas2D top-down fallback that draws the same zone and keeps every screen working. | CI and headless browsers run on software GL; the e2e tests and screenshots must still run. |
| 66 | Melee feel: a weapon in Sam's hand, a cocked wind-up, a fast sweep and recovery (alternating sides; the fire axe chops overhead), a slash trail sampled along the arc that flares on a hit, blood and sparks, a hit star, white hit flash, 45 ms hit-stop (75 ms heavy), a camera nudge along the swing, zombie flinch and knockback. Misses swing too. | BRIEF_V2 §2. Sampling the trail along the arc keeps it a curve even at low frame rates. |
| 67 | Classes live in `classes.json` (zod-validated): kit, skill ranks, a perk as named multipliers read through `perk(ctx)`, a Q ability (`decoy`, `adrenaline`, `flashbang`, `scout`) with a cooldown and HUD chip, class-only recipes, and `{token}` names that dialogue, notes and cards use for Sam's job. The validator checks every class can finish every quest. Saves (v2) store `classId`; v1 saves migrate to Mechanic. | BRIEF_V2 §4. Content can add a class without code unless it needs a new ability kind. |
| 68 | Abilities are refused in the safehouse. Gadget abilities throw a free copy of the class gadget; the same gadget can be crafted from the class recipe and thrown with G. | The camp is a safe space; one code path for every thrown gadget. |
| 69 | A left click that goes down and up between two rendered frames still counts as a press. | At low frame rates quick clicks were lost; found by the scripted keyboard-and-mouse playthrough. |
