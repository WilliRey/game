# HOLDOUT — Roadmap & status

Keep this accurate at every push. Legend: `[x]` done, `[~]` in progress / partial, `[ ]` not started.
Anything stubbed or faked is listed under **Stubs** at the bottom.

## STATUS

**Session 2 (current):** M0 and M1 complete. New Game drops Sam into a real Maple Court map with
movement, collision, shadowcast FOV, day/night, flashlight, HUD, debug overlay (F3) and console (`).
Working through M2 (combat, zombie AI, noise, stealth) next.

## M0 — Scaffold & CI (boots to a menu)
- [x] package.json with pinned Phaser 4.2.1, Vite, Vitest, Playwright, ESLint, Prettier, zod, Preact
- [x] strict tsconfig, Vite base `/game/` for Pages, CI + Pages deploy workflows
- [x] docs/DESIGN.md, docs/ROADMAP.md
- [x] boot → main menu with placeholder art + Preact overlay mounted
- [x] Playwright smoke test skeleton
- [x] content data files for every schema, `npm run validate:content` (references + quest completability)

## M1 — Zone, movement, camera, FOV, day/night, HUD shell, debug overlay
- [x] GameState types, EventBus, RNG, store
- [x] zod schemas + content loader + data files + validate:content
- [x] ASCII zone loader → ZoneLayout/ZoneState (walls, floors, glass, doors, containers, spawns, start, exits,
      objects; multi-tile props merge), remembered zone state (doors, containers, items, explored RLE)
- [x] placeholder texture generation + asset manifest; chunked map renderer with wall faces and contact shadows
- [x] player movement (walk/sprint/crouch/aim speeds, encumbrance), stamina, footstep noise, tile collision with
      sliding, camera look-ahead (further when aiming)
- [x] shadowcasting FOV with 140° cone + rear radius, occluded lamp light; explored/remembered tiles; soft fog
- [x] day/night clock (1 s = 1 min), night vision shrink + tint, indoor darkness, flashlight cone (F)
- [x] HUD shell (needs as icon+bar+number, effects, clock/day, weapon/ammo/durability, slots, quick slots,
      tracked objective, noise meter, weight), toasts, hints, story text cards
- [x] interaction framework: doors, pickups, exits, stations, lock picking/forcing, timed hold actions + prompts
- [x] debug overlay (FPS, entity counts, AI summary, noise radii, paths, FOV toggle) + console (give, heal, god,
      noclip, time, timescale, tp, spawn, kill, quest, rep, xp, skill, flag, fuel, reveal, fov)

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
- Zones other than the ones built so far are placeholder rooms; NPCs, dialogues, traders and most quests are
  stubs until M5/M7.

## Next concrete steps
M1: zone loader, ZoneScene, movement, FOV, day/night, HUD shell, debug overlay.
