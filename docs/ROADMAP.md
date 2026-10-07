# HOLDOUT — Roadmap & status

Keep this accurate at every push. Legend: `[x]` done, `[~]` in progress / partial, `[ ]` not started.
Anything stubbed or faked is listed under **Stubs** at the bottom.

## STATUS (session 1 stopped here, budget reached)

**Does the project build?** No. `src/content/raw.ts` imports 25 JSON data files that do not exist yet, and
there is no `index.html`, `src/main.ts`, sim, Phaser scene, UI or test file. `npm install` works.

**Done (committed):**
- Toolchain: `package.json` (pinned versions, all brief scripts), `tsconfig.json` (strict), `vite.config.ts`
  (base `/game/` on build), `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, Prettier,
  `.github/workflows/ci.yml` and `deploy.yml`.
- `docs/DESIGN.md`: architecture, layers, decisions log. Read it before writing code.
- `src/config/balance.ts`: every brief §7 number + difficulty multiplier presets.
- `src/core/rng.ts` (sfc32, serializable, derived streams), `src/core/events.ts` (typed `GameEvents` + `EventBus`),
  `src/core/types.ts` (full `GameState`, `ItemStack`, `RememberedZone`, `QuestState`, `TraderState`, `BaseState`…),
  `src/core/time.ts` (clock helpers, night/darkness), `src/core/store.ts` (`GameStore`: context, screen stack,
  clock-stopping screens, change notification, settings persistence, `newUid`).
- `src/content/schemas.ts`: zod schemas for items/weapons/mods/recipes/loot/containers/enemies/npcs/dialogue/
  conditions/effects/quests/traders/zones (ASCII map + legend + objects)/world nodes/travel events/notes/
  broadcasts/hints/station upgrades/skills. `src/content/index.ts`: `loadContent()` registry + `fillNames()`.
  `src/content/raw.ts`: the explicit JSON import list (the file names are the contract for the data files).

**Half-finished / missing:** everything below M0's last two boxes.

**Exact next steps (in order):**
1. Create every JSON file listed in `src/content/raw.ts` under `src/content/data/` (start minimal but valid:
   `names.json`, `legend.json` with the brief's legend chars, one zone `zones/maple_court.json`, a handful of
   items; empty arrays elsewhere are fine) so `loadContent()` passes.
2. `scripts/validate-content.ts`: call `loadContent()` then cross-reference checks (see DESIGN §3.4).
3. `src/sim/types.ts` (`ZoneState`: grid flags, entities, doors, containers) referenced by `core/types.ts`;
   `systems/zoneLoader.ts` (ASCII → ZoneState); `sim/fov.ts` (shadowcasting); `sim/step.ts`.
4. `index.html`, `src/main.ts` (loadContent → GameStore → Phaser.Game 1280×720 FIT scale → mount Preact `App`),
   `game/scenes/BootScene.ts` (generate placeholder textures), `game/scenes/ZoneScene.ts`, `ui/App.tsx` with
   main menu + HUD shell. Then `e2e/smoke.spec.ts` and the first unit tests (rng, time, events).
5. Run `npm run check && npm run build && npm run test:e2e`, commit as M0/M1, then continue M2 onward per the
   milestone lists below.


## M0 — Scaffold & CI (boots to a menu)
- [x] package.json with pinned Phaser 4.2.1, Vite, Vitest, Playwright, ESLint, Prettier, zod, Preact
- [x] strict tsconfig, Vite base `/game/` for Pages, CI + Pages deploy workflows
- [x] docs/DESIGN.md, docs/ROADMAP.md
- [ ] boot → main menu with placeholder art + Preact overlay mounted
- [ ] Playwright smoke test skeleton

## M1 — Zone, movement, camera, FOV, day/night, HUD shell, debug overlay
- [x] GameState types, EventBus, RNG, store
- [~] zod schemas + content loader done; data files and validate:content script not yet
- [ ] ASCII zone loader → ZoneState (walls, floors, glass, doors, containers, spawns, start, exit)
- [ ] placeholder texture generation + asset manifest
- [ ] player movement (walk/sprint/crouch/aim speeds), tile collision, camera look-ahead
- [ ] shadowcasting FOV with 140° cone + rear radius; explored/remembered tiles
- [ ] day/night clock, night vision shrink, flashlight cone
- [ ] HUD shell (needs, clock, weapon, quick slots, objective, prompt, noise meter)
- [ ] debug overlay (FPS, entity counts, AI states, noise radii, paths, FOV toggle)

## M2 — Combat, zombies, noise & stealth
- [ ] noise events with radii, directional ping for unseen loud noise
- [ ] zombie types (walker, runner, bloater, boss, screamer), senses, AI state machine
- [ ] A* pathing with throttled repath + separation; door bashing; distant sleep
- [ ] melee (arc, wind-up/recovery, stamina, knockback, stagger, cleave, sneak ×3)
- [ ] firearms (mag/reserve, reload incl. shell-by-shell, bloom, wall-stopping, jams)
- [ ] shove, throwables (bottle, molotov, pipe bomb), durability wear
- [ ] feel: hit flash, hit-stop, shake (toggle), muzzle flash, capped blood decals
- [ ] positional WebAudio SFX behind AudioManager

## M3 — Items, inventory, containers, searching, loot, survival
- [ ] item schema + ~50 items, rarity, tooltips with equipped comparison
- [ ] weight inventory with stacking, equipment + quick slots, backpacks, encumbrance
- [ ] containers + hold-to-search (time by size, interrupted by damage/move, noise) + loot window
- [ ] loot tables per container type × danger tier, rolled once, saved
- [ ] locks: lockpick / crowbar / key
- [ ] needs drain, debuffs, status effects (bleeding, infection, food poisoning, encumbered, well-fed)
- [ ] cooking/boiling at stove or campfire; rain collector

## M4 — Crafting, blueprints, mods, durability, base stations
- [ ] recipes with stations (inventory, workbench tiers, stove, reloading bench) + blueprints
- [ ] weapon building, mod slots, before/after preview, quality from tier + skill
- [ ] repair (lowers max durability) and dismantle
- [ ] safehouse stations: stash, bed (sleep/wait/save/heal), workbench upgrades, stove, rain collector

## M5 — NPCs, dialogue, quests, trading, reputation
- [ ] dialogue graphs with conditions/effects; dialogue screen
- [ ] quest system (main/side/repeatable; talk/collect/deliver/kill/reach/interact/craft/flag; outcomes; rewards)
- [ ] journal + tracked objective on HUD + markers
- [ ] barter trade screen with live totals, pricing rules, credit, restock, no-exploit test
- [ ] radio broadcasts, notes, text cards

## M6 — World map, travel, vehicle & fuel, saves, menus, death
- [ ] world map screen with nodes (danger, loot types, % searched, quest markers), unlocking
- [ ] on-foot travel time/needs cost + travel events; vehicle travel with fuel; siphoning
- [ ] versioned saves, 3 slots + autosave, export/import, migrations
- [ ] main menu / pause / settings / death screens; difficulty presets

## M7 — Slice content, balance, docs, polish
- [ ] Prologue "Empty Cupboards" with hints
- [ ] Act 1 "Firehouse 9" chain (battery, fuel, repair, St. Agnes + boss + "To be continued")
- [ ] side quests: Medicine Run, Rain Check, The Missing Scout, Kitchen Duty
- [ ] 6 zones, 5 NPCs, 3 traders, 10+ notes, 4–5 travel events, 20+ recipes
- [ ] scripted quest test, content validation, Playwright screenshots
- [ ] docs/CONTENT_GUIDE.md, README with run/play instructions, CREDITS.md

## Stubs / known gaps
- Project does not build yet (data files, sim, scenes, UI missing). See STATUS above.

## Next concrete steps
See STATUS at the top.
