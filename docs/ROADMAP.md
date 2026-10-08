# HOLDOUT — Roadmap & status

Keep this accurate at every push. Legend: `[x]` done, `[~]` in progress / partial, `[ ]` not started.
Anything stubbed or faked is listed under **Stubs** at the bottom.

## STATUS

**Session 2 (current):** M0–M7 complete — the v1 vertical slice is playable end to end. The prologue, the
whole Act 1 chain (through the St. Agnes basement boss and "To be continued") and all four side quests have
been played in the browser with real input; every system in the brief works end to end. Placeholder art and
synthesized sound throughout. See **Stubs / known gaps** and **Next concrete steps** below.

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
- [x] noise events with radii (footsteps by surface, weapons, searching, forcing locks, bottles, alarms,
      door bashing, explosions), walls dampen hearing, directional ping for unseen loud noise
- [x] zombie types (walker, runner, bloater + burst, boss variant, screamer), sight cone with night /
      crouch / flashlight modifiers, AI state machine idle/wander → investigate → chase → attack → search
- [x] A* pathing (no corner cutting) with throttled repath budget + crowd separation; door bashing with door
      HP; distant zombies sleep, far ones sense less often; population: first-visit roll, nests, regen per
      day (cleared nests stay cleared), night trickle; night speed-up
- [x] melee (arc, wind-up/recovery, stamina, knockback, stagger, cleave, ×3 sneak from behind, fists)
- [x] firearms (mag/reserve by ammo type, reload incl. shell-by-shell, bloom/aim, wall-stopping hitscan,
      crude-gun jams cleared by R, pellets, crossbow bolt recovery, suppressor noise)
- [x] shove, throwables (bottle noise lure, molotov fire area, pipe bomb fuse + explosion), durability wear
- [x] feel: hit flash, hit-stop on heavy melee, screen shake (toggle), muzzle flash + light, sparks,
      explosions, capped blood/gore decals, damage numbers (toggle), enemy health bars
- [x] positional WebAudio SFX behind AudioManager (pan + distance falloff), ~60 synthesized sounds

## M3 — Items, inventory, containers, searching, loot, survival
- [x] item schema + 109 items (incl. 13 notes), rarity colors, tooltips with stat comparison vs equipped
- [x] weight inventory with stacking, equipment + quick slots (5–8), backpacks, encumbrance (slow, no
      sprint); inventory screen (filters, equip, use, quick-assign, drop)
- [x] containers + hold-to-search (time by size and Scavenging, interrupted by moving / damage, noise) +
      loot window (take, take all, store); multi-tile containers; car alarms
- [x] loot tables per container type × danger tier, rolled once per container from a derived seed, saved
- [x] locks: lockpick (quiet, slow, uses picks) / crowbar (fast, loud, breaks the door) / key / note codes
- [x] needs drain (×1.5 exertion, ×0.5 asleep), low-need stamina debuff, HP loss at zero, status effects
      (bleeding, infection over days + antibiotics, food poisoning, encumbered, well-fed regen)
- [x] cooking/boiling at stove or campfire (fire barrels count); rain collector (done with M4's screens)

## M4 — Crafting, blueprints, mods, durability, base stations
- [x] 29 recipes across stations (by hand, workbench tiers 1–3, stove, reloading bench) + blueprint items,
      notes and quest rewards that unlock recipes; crafting screen with have/need, tools, time, XP
- [x] weapon building from blueprints, mod slots (muzzle/sight/magazine/stock, head/grip), 7 mods, before/
      after stat preview, crafted quality from bench tier + Crafting skill
- [x] repair (costs materials, lowers max durability, Crafting skill softens it) and dismantle (half the
      parts back, plus mods)
- [x] safehouse: stash (no weight limit; crafting at home can use it), bunk (sleep heals + saves / wait),
      workbench tier 2–3 and stove tier 2 upgrades, reloading bench build, rain collector (fills over time);
      Firehouse 9 hub map with all stations; skills screen (spend points)

## M5 — NPCs, dialogue, quests, trading, reputation
- [x] dialogue graphs with conditions (item, quest, flag, skill, reputation, time, day, cooldown, not/any)
      and effects (items, quests, flags, reputation, trade, XP, recipes, nodes, traders, heal, fuel, cards,
      base upgrades, stamps...); dialogue screen with number keys and disabled-with-reason choices
- [x] quest system (main/side/repeatable; talk/collect/deliver/kill/reach/interact/craft/flag objectives,
      optional objectives, multiple outcomes, rewards incl. reputation and recipes); scripted chain test
- [x] journal (active/completed/notes) + tracked objective on HUD + zone-map ring + in-field edge arrow
- [x] barter trade screen with live totals, pricing rules (wants/junk/condition/quality/rep/Barter), credit,
      restock; no-exploit unit test over every item and discount
- [x] radio broadcasts (Firehouse radio), notes, text cards; 5 NPCs (Ruth, Gus, Dr. Imani Hale, Tomas,
      Junie) with dialogue; zone map (M) of explored tiles, containers searched, exits, people

## M6 — World map, travel, vehicle & fuel, saves, menus, death
- [x] world map screen (stylized city SVG) with nodes: danger, loot types, % searched, quest markers, visited
      state, locked teaser; unlocking through story/dialogue/notes/radio/events; view-only from the zone map
- [x] on-foot travel (time, needs at exertion rate, event chance, 6 km limit, forced march when stranded);
      vehicle travel (fast, fewer events, fuel); refuel from cans (map, inventory, ambulance); siphoning
- [x] 6 data-driven travel events with conditional choices and weighted outcomes, summary of effects
- [x] versioned saves in localStorage: 3 slots + autosave (zone entry, quest steps, sleep; waits until safe),
      export/import files, migration hook + default filling; unit tests for round-trip, RNG, migrations
- [x] main menu (Continue/New/Load/Settings), pause (save/load/settings/quit confirm), settings, death →
      load last save; difficulty presets; e2e test saves, reloads the page and continues

## M7 — Slice content, balance, docs, polish
- [x] Prologue "Empty Cupboards" with hints (search, eat, stairwell walker with a camera pan, depot, nail bat
      at the workbench, world map to Firehouse 9) — played in the browser
- [x] Act 1 "Firehouse 9" chain: Ruth's deal → bolt cutters (Gus) → Kessler battery → siphon hose → Route 17
      fuel → ambulance repair → drive to St. Agnes → keycard → basement → bloater boss → Jo's recorder →
      "To be continued" — played in the browser
- [x] side quests: Medicine Run, Rain Check (builds the rain collector), The Missing Scout (save Pike or take
      his rifle: different rewards, reputation, a new trader), Kitchen Duty (repeatable) — played in the browser
- [x] 7 zones (6 locations + the St. Agnes basement), 5 NPCs, 4 traders, 14 notes, 6 travel events, 29 recipes
- [x] scripted quest test, content validation (incl. quest completability), map reachability test for every
      zone, Playwright smoke + key-screen screenshots (`e2e/screenshots`, uploaded by CI)
- [x] docs/CONTENT_GUIDE.md, README with run/play instructions and dev tools, CREDITS.md
- [x] balance and fixes from the playthroughs: bleeding clots, trip health forecast, spawn shuffle, St. Agnes
      connectivity, Pike appears at camp immediately, quiet autosave indicator, CPU-backed canvases (fast boot
      without a GPU), UI subscription race (menu sometimes never appeared)

## Stubs / known gaps
- All art is procedural placeholder (Canvas2D textures generated at boot); all sound is synthesized WebAudio.
- The world map background is a generated street grid, not a drawn map.
- Act 2 (the Northgate bridge and the Tollmen) is a locked teaser node; the Tollmen appear only in a travel event.
- Vehicle trunk storage and upgrades (brief: later) are not in v1; the vehicle travels with the player.
- No controller support, no rebinding, no localization (all brief non-goals for v1).
- Headless/software-rendered browsers run at ~30 fps; real GPUs hold 60 fps with ~50 zombies (sim ~0.7 ms).

## Next concrete steps
1. Real art: replace placeholder keys in `src/game/art/manifest.ts` with sprites (CC0 packs or commissioned).
2. Act 2: the Northgate bridge zone, the Tollmen faction (reputation, a toll/bribe/fight choice), the train.
3. More locations per district so the world map has meaningful route choices; random travel ambushes that
   drop the player into a small encounter zone.
4. Vehicle depth: trunk storage, upgrades (armor plating, bigger tank), breakdowns.
5. Balance with playtest telemetry: loot density per tier, trader prices, needs drain over a multi-day run.
