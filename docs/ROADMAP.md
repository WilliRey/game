# HOLDOUT — Roadmap & status

Keep this accurate at every push. Legend: `[x]` done, `[~]` in progress / partial, `[ ]` not started.
Anything stubbed or faked is listed under **Stubs** at the bottom.

## STATUS

**Session 3 (current): v2 pass (`docs/BRIEF_V2.md`)** on branch `claude/game-v2`. The presentation moved
from Phaser to a three.js 3D angled view; melee is visible and rebalanced; four classes with abilities;
faster searching. The prologue and Act 1 were played in the browser with real keyboard and mouse input on
the 3D view (a scripted player, see **v2** below). v1 (sessions 1–2, M0–M7) is merged on `main`.

## v2 — BRIEF_V2
- [x] **3D view (three.js 0.186.1 replaces Phaser).** Sim stays the source of truth (tile-based); saves,
      content and tests unchanged. Perspective camera pitched 56° with look-ahead (further when aiming) and
      mouse aim by raycast onto the ground; extruded textured walls, textured floors (atlas, corner AO),
      3D props, no roofs, walls between camera and player cut down in the vertex shader; tree canopies near
      the player hide
- [x] lighting: hemisphere + sun/moon by time of day, flashlight spotlight with shadows from Sam's hand, a
      fixed pool of point lights for lamps, fire barrels, molotov fires, muzzle flashes, explosions and
      flashbangs; LOS rules kept exactly (sim FOV → per-tile texture: unseen black, remembered dim and
      desaturated, zombies/NPCs out of sight hidden); a soft personal glow at night
- [x] low-poly procedural characters (Sam per class, each zombie type, NPCs) with procedural animation
      (walk cycle, idle sway, wind-up, swing, hit flinch, stagger wobble, death fall, corpses stay)
- [x] particles (sparks, blood, flames, smoke, gas, dust), decals, tracers, muzzle flashes, thrown objects,
      decoy/flashbang/smoke/scout visuals; HTML world UI (prompts, progress, damage numbers, health bars,
      NPC names, objective arrow) projected from 3D
- [x] everything behind the asset manifest: model/texture overrides by key (props with their own
      materials, characters per rig part, any geometry key), loaded before the renderer starts; no
      third-party assets ship
- [x] performance: zombies instanced per body part per type (62 zombies ≈ 80 draw calls, ~60k triangles);
      HIGH/LOW quality tiers chosen from the GPU (`?quality=`), Canvas2D fallback for no-WebGL (`?renderer=2d`)
- [x] title screen in three.js (rainy street, sparse lit windows, flickering lamp); HUD, every Preact screen,
      zone map and world map unchanged
- [x] **visible melee:** weapon in hand, cocked wind-up, sweep and recovery (alternating sides, overhead
      chop for the axe), slash trail sampled along the arc, sparks/blood/hit star, hit flash, hit-stop,
      camera nudge, zombie flinch and knockback; misses swing too; zombies show a red wind-up fan
- [x] **melee balance:** reproduced with a scripted fight harness in the real sim (lone walker cost >10 HP in
      up to a third of fights; three walkers 25–54 HP), fixed (decisions 53–56), pinned by
      `tests/unit/meleeBalance.test.ts`
- [x] **classes:** Mechanic, Paramedic, Ex-cop, Scavenger in `classes.json` (zod + validator incl.
      per-class quest completability); picked after difficulty with kit, skills, perk and ability shown; Q
      abilities with cooldown + HUD chip; class-only gadget recipes; class dialogue options in Act 1 and
      class-specific story lines (`{sam_job}`...); saves v2 store the class, v1 saves migrate to Mechanic
- [x] **faster searching:** tap E, 0.4 / 0.7 / 1.0 s by size (Scavenging and the Scavenger perk shorten it),
      loot window opens the moment it finishes, locks keep their hold actions, searching still makes noise
- [x] e2e: smoke + key screens + 3D view screenshots (`e2e/view3d.spec.ts`: interior, wind-up, swing, night,
      50-zombie horde under 250 draw calls, camp, 2D fallback)
- [x] prologue + Act 1 played in the browser with real input on the 3D view (see the playthrough notes below)

### v2 playthrough notes
`scripts/playthrough/play.mjs` plays the prologue and the whole Act 1 chain with keyboard and mouse only
(WASD, mouse aim and clicks, E / Space / Tab / Q / Esc, clicks on UI buttons; it reads the game state to
decide where to go, the way a player reads the screen, and uses no debug commands). Last full run, as the
Mechanic on the LOW tier under software WebGL: the prologue and Act 1 completed (Ruth hears Jo's recording,
"To be continued") in about 12½ minutes of wall time without dying — 22 kills over 16 fights, 69 HP lost to
zombies (49 of it in the basement, where the boss caught Sam on the way to the recorder), no console errors.
The run before it lost 13 HP over 25 kills; the Kessler garage (four walkers and a runner woken by the bolt
cutters) cost 5 HP there with the noise-maker and 14 HP in the last run. The same script as the **Ex-cop**
(baton, flashbang): Act 1 completed without dying, 28 kills, 29 HP lost (the flashbang cleared the Kessler
garage for 0 HP; the boss cost 20), no console errors.

Found and fixed while checking the 3D view and playing:
- quick clicks were lost when a frame took longer than the click (decision 69);
- night scenes were nearly black and smoke glowed white at night (decision 62);
- the Scavenger's scout rings scaled with the container (a bus got a 7-tile ring) — now a sonar ping plus
  small markers;
- an NPC's floating name sat on top of the "[E] Talk" prompt;
- an empty barter said "Short by 0" in red;
- the title skyline was lit like a working city on day 23;
- a bot playing like a turret (standing still, wrench, no ability) died to the Kessler garage (4 walkers and
  a runner woken by the chain cutter); with footwork, the nail bat and the noise-maker the same fight cost
  5 HP. That is the intended curve, so the encounter is unchanged.

Not bugs: the drive to St. Agnes leaves about 2 L in the tank, so the way home needs the fuel at the hospital
(a can by the ambulance bay and a siphonable wreck, decision 39) or a forced march.

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
- All art is procedural placeholder: low-poly vertex-coloured models and canvas-painted textures built in code;
  all sound is synthesized WebAudio. Real models/textures can be dropped in by asset key (CONTENT_GUIDE).
- Performance was measured only on software WebGL in this environment: SwiftShader runs the LOW tier at
  ~25–30 fps (HIGH at ~5) with dozens of zombies; with 62 zombies a frame is ~80 draw calls and ~60k
  triangles, comfortably inside a real GPU's 60 fps budget, but it hasn't been profiled on one.
- Characters are rigid-part rigs (no skinning); animation is procedural.
- The world map background is a generated street grid, not a drawn map.
- Act 2 (the Northgate bridge and the Tollmen) is a locked teaser node; the Tollmen appear only in a travel event.
- Vehicle trunk storage and upgrades (brief: later) are not in v1; the vehicle travels with the player.
- No controller support, no rebinding, no localization (all brief non-goals for v1).

## Next concrete steps
1. Real art through the overrides: a CC0 character pack (rigged per part), props, and floor textures (the
   floor atlas is painted in code today).
2. Profile on real GPUs (integrated and discrete) and tune the HIGH tier (shadow map size, light count).
3. Act 2: the Northgate bridge zone, the Tollmen faction (reputation, a toll/bribe/fight choice), the train.
4. More locations per district so the world map has meaningful route choices; random travel ambushes that
   drop the player into a small encounter zone.
5. Vehicle depth: trunk storage, upgrades (armor plating, bigger tank), breakdowns.
6. Balance with playtest telemetry: loot density per tier, trader prices, needs drain over a multi-day run.
