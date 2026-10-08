# Build brief: top-down zombie survival RPG (working title: HOLDOUT)

You're building the first playable version of an original single-player, top-down zombie survival RPG for desktop browsers (keyboard + mouse), from scratch in this repo (currently just a README). This brief lives at `docs/BRIEF.md` (add it if it isn't there) so later iterations can refer back to it.

**Goal of this pass:** every core system working end-to-end in a small vertical slice, architected so I can keep iterating on it for months. Favor breadth over depth. Content can be thin and systems can be simple, but nothing in the core loop should be faked.

## 1. Inspiration: take the feel, not the IP
- **The Last Stand: Aftermath:** the top-down view, line of sight that leaves everything behind walls in darkness, tense scavenging runs, crafting from scavenged scrap, and spending fuel to travel between map locations.
- **The Last Stand: Union City:** ONE fixed protagonist with a personal, linear main story, survivors around the city who give side quests, and exploring the city location by location while searching buildings for supplies.
- Leave out Aftermath's roguelite survivor-swapping and permadeath runs. Dying reloads a save.
- Everything is original: names, story, characters, art, and audio. Don't use assets, names or text from The Last Stand or any other game.

## 2. Pillars
1. Every trip outside is a decision. Time, noise, weight and supplies are the real currencies.
2. Scarcity breeds resourcefulness. You craft, repair, mod and barter more than you find.
3. Tension comes from information: limited vision, darkness and sound.
4. A personal story with a fixed protagonist, plus side stories that give the city its people.

## 3. Core loop
1. **Safehouse:** eat, drink, craft, repair, trade, take quests, save.
2. **World map:** pick a destination. Going on foot costs time, and therefore food and water. Going by car costs fuel.
3. **Zone:** explore it top-down. Sneak or fight, search containers, loot under a weight limit, find blueprints and notes, complete objectives.
4. **Get out** before health, supplies, ammo or daylight run out.
5. **Back home:** turn the loot into weapons, trades, base upgrades and story progress, which unlocks new locations.

## 4. Tech & architecture
- TypeScript (strict) + Phaser (latest stable; check npm and pin the exact version) + Vite. Use Vitest, Playwright, ESLint and Prettier.
- Use 32-px tiles and a 1280×720 logical resolution scaled to fit the window.
- Build menus and screens (inventory, crafting, trade, dialogue, journal, maps, settings) as an HTML/CSS overlay above the Phaser canvas, in Preact or vanilla TS. Keep in-world feedback (prompts, enemy health bars, damage numbers) in Phaser.
- Game rules go in plain TS modules that don't import Phaser and that operate on one serializable `GameState`. Scenes render that state and dispatch actions. A typed event bus (`enemy:killed`, `item:acquired`, `zone:entered`, …) connects the systems, and quests listen on it.
- **Content is data-driven.** Items, weapons, mods, recipes, loot tables, enemies, NPCs, dialogue, quests, traders, zones, travel events and all balance numbers live in data files that are validated with zod at boot. Adding an item, quest or zone should be a data edit, not a code change.
- **Zones are ASCII maps** plus a legend, plus an object list for anything that needs parameters. Example legend: `#` wall, `.` floor, `g` broken glass, `+` door, `L` locked door, `f` fridge, `m` medicine cabinet, `t` toolbox, `v` car wreck, `Z` spawn, `P` start, `E` exit. Both I and agents can edit these easily. Keep the loader abstract so Tiled maps could be added later.
- Use a seeded RNG, stored in the save, for loot and spawns.
- Generate placeholder art at boot: readable shapes and colors for the player, each zombie type, NPCs, containers and walls. Mood is dark and desaturated with warm light sources. Reference all art through an asset-key manifest so real sprites can drop in later. CC0 packs such as Kenney's are fine if you can download them; list them in `CREDITS.md`.
- Synthesize placeholder SFX with WebAudio, behind an AudioManager keyed by event name. Sounds are positional (stereo pan plus distance falloff), so you can hear what you can't see.
- Don't build a general-purpose engine or a big ECS framework. Keep modules small and readable.

## 5. Systems required in v1

**Player, camera, controls**

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Aim |
| LMB | Attack |
| RMB | Aim mode: tighter spread, slower movement, camera leans toward the cursor |
| R | Reload |
| E | Interact. Tap for doors, talking and pickups; hold to search and pick locks |
| Shift | Sprint |
| C | Crouch / sneak |
| Space | Shove |
| 1–4 or mouse wheel | Weapon slots: 2 firearms, melee, throwable |
| 5–8 | Quick-slot items |
| G | Throw |
| F | Flashlight |
| Tab | Inventory |
| J | Journal |
| M | Zone map (the world map is reached at zone exits) |
| Esc | Pause |

- The camera follows the player with a slight look-ahead toward the cursor.
- The hub is a safe zone: no zombies, and weapons stay holstered.

**Vision, light, time**
- Compute line of sight by shadowcasting on the tile grid. Walls and closed doors block it. Vision has full radius in a ~140° cone toward the aim direction and a reduced radius behind the player.
- Tiles never seen are dark. Explored tiles that aren't currently visible stay dimly remembered, with no enemies shown.
- Run a day/night clock (default: 1 real second = 1 game minute). At night vision shrinks and zombies get more numerous and faster. The flashlight extends vision in a cone but makes the player easier to spot.
- A loud noise outside the player's view shows a brief directional ping, so sound is readable.

**Survival**
- The player has health, stamina, hunger and thirst. Hunger and thirst drain over time, faster while sprinting or fighting. Low values cause debuffs; at zero the player loses health.
- Status effects:
  - Bleeding, fixed with a bandage.
  - Infection from zombie hits. It progresses over days, antibiotics treat it, and untreated it kills.
  - Food poisoning from raw food or unboiled water.
  - Encumbered.
  - Well-fed, which gives slow regen.
- Food and water come from scavenging, from cooking raw food and boiling dirty water at a stove or campfire, from the safehouse rain collector, and from traders. The player must never get soft-locked out of food or water.

**Combat & weapons**
- **Melee:** arc hitbox, wind-up and recovery, stamina cost, knockback and stagger, and cleave on some weapons. Hitting an unaware zombie from behind does heavy bonus damage.
- **Firearms:**
  - Magazine plus reserve ammo, by ammo type.
  - Reloading; the shotgun loads shell by shell.
  - Spread blooms while moving or firing and tightens while aiming.
  - Walls stop bullets, and crude guns can jam.
- **Shove:** pushes zombies back, costs stamina and does no damage. It's the way out when surrounded.
- **Throwables:** glass bottle (noise distraction), molotov (burning area) and pipe bomb.
- **Durability:** weapons wear down. Broken ones can be repaired or dismantled.
- **Feel:** hit flash, knockback, brief hit-stop on heavy melee, screen shake (toggleable), muzzle flash, and blood decals with a cap.

**Zombies, noise & stealth**
- **Noise:** every action emits noise with a radius. That includes footsteps (louder on broken glass), sprinting, gunshots, forcing locks, smashing glass and car alarms.
- **Senses:** zombies hear noise in range and go investigate it. They see the player within a vision cone. The cone is shorter at night, longer when the flashlight is on, and shorter when the player is crouched.
- **AI states:** idle/wander → investigate → chase → attack → search last known position → idle.
- **Pathing:** grid A* with throttled re-pathing, plus separation so crowds don't stack.
- **Doors:** zombies bash closed doors, and doors have HP, so closing one buys time.
- **v1 types:**
  - Walker: slow and common.
  - Runner: fast and fragile, more common at night.
  - Bloater: tanky, bursts into a damaging cloud when killed, and has a boss variant.
  - Screamer, if time allows: alerts everything nearby when it sees the player.
- **Persistence:** zones remember their state. Zombie populations partly regenerate over in-game days, but cleared nests stay cleared.
- **Performance:** distant zombies sleep or run simplified AI.

**Scavenging, loot, inventory**
- **Containers:** fridges, cabinets, desks, lockers, toolboxes, car trunks, dumpsters and corpses.
- **Searching:** hold to search. Search time scales with container size, taking damage or moving interrupts it, and searching makes a little noise. When it finishes, a loot window opens with take and take-all.
- **Loot tables:** one per container type, scaled by the zone's danger tier. Loot is rolled once and saved.
- **Locks:** locked doors and containers open three ways:
  - A lockpick: quiet and slow, and it uses up picks.
  - A crowbar: fast and loud.
  - A key from a quest or a note.
- **Inventory:** weight-based, with stacking. Over capacity, the player moves slower and can't sprint. Backpacks raise capacity.
- **Equipment slots:** head, torso, backpack, 2 firearms, melee, throwable, and 4 quick slots.
- **Item types:** food, drink, medical, materials, tools, ammo, weapons, mods, armor, backpacks, blueprints, notes and quest items. Items have rarity colors, and tooltips compare them against what's equipped.
- **Notes:** some reveal locations, stash codes or blueprints.

**Crafting & weapon building**
- **Stations:** simple items such as bandages and molotovs craft from the inventory. Weapons and mods need the workbench, food and water need the stove, and ammo needs the reloading bench.
- **Blueprints** unlock recipes. They're found, traded for or earned from quests.
- **Weapon building:**
  - Craft base weapons from blueprints.
  - Attach mods to slots: muzzle, sight, magazine and stock on guns; head and grip on melee weapons.
  - The bench shows a before/after stat preview.
  - The quality of crafted gear depends on the workbench tier and the Crafting skill.
- **Repair and dismantle:** each repair lowers max durability a little. Dismantling returns some components.

**Safehouse & base**
- The player's bunk at the hub has:
  - a stash with large storage
  - a bed for sleeping or waiting, which is also a save point and heals slowly
  - a workbench whose upgradable tiers unlock recipes
  - a stove
  - a rain collector, built through a side quest, that produces dirty water over time
- Upgrading stations costs materials.

**NPCs, dialogue, quests**
- **Dialogue** is branching and comes from data files.
  - Choice conditions: item, quest state, flag, skill rank, reputation, time of day.
  - Choice effects: give or take items, start/advance/complete quests, set flags, change reputation, open trade, grant XP.
- **Quests** are main, side or repeatable.
  - Objective types: talk, collect, deliver, kill, reach, interact, craft, flag.
  - Quests can have multiple outcomes.
  - Rewards: items, XP, reputation, and unlocked recipes, locations or trader stock.
- **Journal:** lists active and completed quests. The tracked objective shows on the HUD, with markers on the world map and inside the zone once the location is known.
- **Story delivery:** dialogue, a radio that receives scripted broadcasts, notes, and simple scripted moments such as text cards and camera pans.

**Trading & bartering**
- **Barter only;** money is worthless now. The trade screen has two columns, your offer and their goods, with live value totals. A deal goes through when your offer covers what you're taking, and any overpayment is kept as credit with that trader.
- **Pricing:**
  - Every item has a base value.
  - Traders mark up what they sell and pay less for what they buy.
  - They pay more for categories they want and less for junk.
  - Reputation and the Barter skill improve the rates.
  - Item condition affects value.
- **No-exploit invariant:** you can never sell an item for more than it costs to buy back, so there are no infinite-value loops. Test this.
- **Stock** comes from tables, restocks every few in-game days, and grows with reputation and quests.

**World map & travel**
- **Map:** a stylized city map with location nodes. Locations unlock through the story, dialogue, notes and the radio. Each one shows its danger level, known loot types, % searched and quest markers.
- **On foot:** travel costs game time (and so food and water) and has a chance of triggering a travel event. Some locations are too far to reach on foot.
- **By vehicle:** much faster and a lower event chance, but it costs fuel. Fuel comes from jerry cans, from siphoning wrecks (needs a hose) and from traders.
- **Travel events:** data-driven text events with choices and outcomes, in the style of FTL or Oregon Trail. Ship 4–5.

**Progression**
- XP comes from kills, quests, discoveries and crafting. Each level gives a skill point.
- Skills go from rank 0 to 5: Melee, Firearms, Scavenging, Crafting, Survival, Barter, Stealth. Each rank gives a small, clear bonus.

**Save, death, difficulty**
- **Save format:** versioned JSON saves in localStorage, with a migration hook.
- **Slots:** 3 manual slots plus an autosave that triggers on zone transitions and quest steps. Sleeping in the bed saves. Saves can be exported and imported as files.
- **Save everything:**
  - the player and their inventory
  - the time
  - zone states: containers, doors, dropped items, cleared nests
  - quests and flags
  - traders: stock, credit, reputation
  - the base
  - the vehicle and its fuel
  - the RNG
- **Death:** a death screen, then load the last save.
- **Difficulty:** Story, Survivor and Hardcore presets, implemented as multipliers on the balance config.

**UI / HUD**
- **HUD:**
  - health, stamina, hunger and thirst, each shown as an icon plus a number (not color alone)
  - status icons
  - a clock with the day count
  - the current weapon with ammo and durability
  - quick slots
  - the tracked objective
  - interaction prompts
  - a noise meter showing how loud the player is right now
- **Screens:** main menu, pause, settings (volume, screen shake, damage numbers, hints, UI scale), inventory, loot, crafting, workbench/mods, trade, dialogue, journal, zone map, world map, sleep/wait, death.
- **Clock behavior:** dialogue, trade, crafting, the maps and the pause menu stop the clock. The inventory doesn't stop it in the field; there's a setting to change that.
- **Hints:** contextual tutorial hints for firsts, such as first time hungry, first locked door and first night.

**Dev tools (essential for iteration)**
- **Debug overlay:** FPS, entity counts, AI states, noise radii, paths, and an FOV toggle.
- **Console**, opened with the backtick key:
  - give item, heal, god mode, noclip
  - set time, time scale
  - teleport to zone, spawn enemy
  - set quest step, set reputation, add XP
  - reveal map
- Dev tools are only available in dev builds or with `?debug=1`.

## 6. Vertical-slice content
All names are placeholders. Keep them in one data file so I can rename things.

**Premise:** It's day 23 of the outbreak in Harrow City. Sam Keller, a city bus mechanic, has been barricaded in an apartment above the transit depot, and the food just ran out. Sam's sister Jo, an ER nurse, was at St. Agnes Hospital when the city fell, and Sam hasn't heard from her since. Then the radio picks up talk of a train leaving the city from the Northgate Rail Yard, across the river. Sam isn't leaving without Jo. The tone is grounded and dark, with Sam's dry mechanic humor.

**Main story.** In v1 the Prologue and Act 1 are playable. Acts 2 and 3 are outlined, with hooks planted.
- **Prologue: "Empty Cupboards"** (Maple Court Apartments & Depot Street). It teaches:
  - movement
  - searching
  - eating and drinking
  - melee
  - sneaking and bottle distractions
  - crafting a weapon at the depot workbench

  It ends when Sam reaches Firehouse 9.
- **Act 1: "Firehouse 9."** Camp leader Ruth Okafor makes a deal: get the station's dead ambulance running and Sam can use it. St. Agnes is too far to walk.
  1. **Battery:** get a car battery from Kessler Auto Repair, whose garage is chained shut. Sam can craft bolt cutters from a blueprint or barter for them.
  2. **Fuel:** siphon it from the wrecks on the Route 17 Overpass. This needs a crafted siphon hose.
  3. **Repair:** fix the ambulance in the firehouse garage. The reward is the vehicle, which unlocks driving on the world map.
  4. **St. Agnes Hospital:** a dark, dangerous zone with a Bloater boss in the basement and Jo's recorded message. She got out and headed for Northgate, but the bridge is held by a raider crew called the Tollmen.

  The slice ends on a "To be continued" card, and free roam continues afterward.
- **Act 2 (outline):** cross the bridge by paying the Tollmen a huge barter toll, sneaking through the storm drains, or fighting. Introduces human enemies and factions.
- **Act 3 (outline):** reach Northgate and hold the rail yard against a horde with crafted traps and barricades while the train loads. Ending.

**Side quests.** At least 3, each a different pattern:
- **"Medicine Run"** (Doc Ama): get antibiotics from the locked back room of the Westside pharmacy. Afterward Doc becomes a medical trader and teaches the first-aid kit recipe.
- **"Rain Check"** (Gus): build a rain collector for the camp from a blueprint. The player gets one at their bunk too, which is a sustainable water source.
- **"The Missing Scout":** Pike never came back from the Gas-N-Go. He's bitten and holed up inside. The player can give him their antibiotics, and he lives and opens a trade line later. Or they can leave him and take his gear. Either way the choice has real consequences.
- **"Kitchen Duty"** (repeatable bounty board): deliver food or water for reputation and rewards.

**Zones.** Each has a distinct layout, loot profile and danger tier.
- Maple Court & Depot Street: the tutorial.
- Firehouse 9: the safe hub.
- Kessler Auto & Elm St.
- Route 17 Overpass & Gas-N-Go.
- Westside Strip Mall, with the pharmacy and laundromat.
- St. Agnes Hospital, plus its basement.

**NPCs:**
- Ruth: the camp leader.
- Gus: general goods and materials trader.
- Vera: weapons, ammo and mods trader.
- Doc Ama: medic, later a trader.
- Pike: the scout.

**Content targets:**
- ~50 items.
- 6+ melee weapons: knife, pipe, crowbar, bat, nail bat, machete, fire axe.
- Firearms: crude pipe pistol, 9mm pistol, pump shotgun and hunting rifle, plus a crossbow that is near-silent and has recoverable bolts.
- 3 throwables.
- 6 mods: suppressor, extended mag, scope, choke, spiked head, reinforced grip.
- Light armor and 2 backpacks.
- 20+ recipes.
- 3–4 enemy types.
- 4–5 travel events.
- 10+ notes.

## 7. Starting balance
All of these numbers live in one config file. Tune them freely.

**Time**
- 1 real second = 1 game minute.
- The game starts on day 23 at 08:00.
- Night runs from 21:00 to 05:00.

**Vision**
- Player vision radius: 14 tiles by day, 7 at night, +6 inside the flashlight cone.
- Zombie sight: 10 tiles by day and 6 at night. It's +4 against a lit flashlight and ×0.6 against a crouched player.

**Needs**
- Hunger empties in ~50 game hours and thirst in ~30.
- Both drain ×1.5 while sprinting or fighting and ×0.5 while asleep.
- Below 25, stamina regen drops 30%.
- At 0, hunger costs 5 HP per game hour and thirst costs 8.

**Health, stamina, infection**
- HP is 100.
- Stamina is 100. Sprinting drains 18/s; regen is 22/s after a 0.8 s delay.
- Each zombie hit has a 5% infection chance, reduced by armor.
- Untreated infection kills in ~72 game hours. One dose of antibiotics knocks it back 40%.

**Speeds (tiles/s)**
| Who | Speed |
|---|---|
| Walking | 3.5 |
| Sprinting | 5.5 |
| Crouched | 2 |
| Aiming | 2 |
| Walker | 1.5 |
| Runner | 5 (just under sprint) |
| Bloater | 1 |

**Zombie HP and damage**
| Type | HP |
|---|---|
| Walker | 40 |
| Runner | 25 |
| Bloater | 120 |
| Bloater boss | ~400 |

Zombie hits do 8–12 damage.

**Weapon damage (ballpark)**
| Weapon | Damage |
|---|---|
| Knife | 10, fast |
| Bat | 18 |
| Fire axe | 34, slow |
| Pistol | 20 |
| Shotgun | 9 pellets × 8 |
| Rifle | 70 |
| Crossbow | 55 |

Sneak attacks do ×3.

**Noise radius (tiles)**
| Source | Radius |
|---|---|
| Crouching | 1.5 |
| Walking | 4 |
| Sprinting | 8 |
| Melee hit | 5 |
| Pistol | 28 |
| Suppressed gun | 9 |
| Shotgun | 38 |
| Rifle | 45 |
| Crossbow | 3 |
| Crowbar on a lock | 12 |
| Bottle smash | 14 |
| Car alarm | 50 |

**Search time and carry capacity**
- Search time: small containers 2 s, medium 3.5 s, large 5 s. Each Scavenging rank cuts it by 8%.
- Carry capacity: 20 kg base, +8 or +15 with a backpack.

**Trade**
- Traders sell at value ×1.4 and buy at ×0.55.
- Categories a trader wants sell for ×1.4; junk sells for ×0.6.
- Reputation cuts the markup by up to 15%.

## 8. Not in v1 (but don't design yourself into a corner)
- human enemies and factions (Act 2)
- companions
- weather (rain fills collectors and masks noise)
- fatigue as a need
- farming and hunting
- more zombie types (crawler, armored)
- base defense and hordes
- vehicle trunk storage and upgrades
- remappable keys
- controller and touch controls
- desktop packaging (Tauri or Electron)
- localization

## 9. How to work
- **Start with the docs.** Write `docs/DESIGN.md` (pillars, loop, systems and a decisions log) and `docs/ROADMAP.md` (milestones as checklists). Don't stop to ask me questions. Make sensible calls and record them under "Decisions."
- **Work in milestones.** Commit and push at the end of each one. The game must build and run at every commit.
  - **M0:** scaffold and CI; the game boots to a menu.
  - **M1:** a zone loaded from an ASCII map, movement, camera, collision, FOV, day/night, a HUD shell and the debug overlay.
  - **M2:** combat, zombies, and noise and stealth.
  - **M3:** items, inventory, containers, searching, loot, and survival stats and effects.
  - **M4:** crafting, blueprints, mods, durability and base stations.
  - **M5:** NPCs, dialogue, quests, trading and reputation.
  - **M6:** the world map, travel, the vehicle and fuel, saves, menus and death.
  - **M7:** slice content, a balance pass, docs and polish.
- **Breadth first.** If time runs short, a thin version of every system beats a polished subset. Track anything stubbed in ROADMAP.md.
- **Tests:**
  - **Unit tests** for the pure logic: inventory and weight, crafting, barter pricing invariants, survival decay, quest progression, dialogue conditions, the save/load round-trip, and seeded loot.
  - **A scripted quest test** that completes the main chain and every side quest by firing events through the quest system.
  - **`npm run validate:content`**, which checks that every ID reference resolves and that every quest can be completed, meaning each required item can be obtained from loot, a trader or a recipe.
  - **A Playwright smoke test:** boot, start a new game, confirm there are no console errors, and take a screenshot.
- **Self-verify.** No one will playtest until you're done, so verify with the tests, the debug console, and Playwright screenshots of key screens.
- **Scripts:** `dev`, `build`, `test`, `lint`, `typecheck`, `validate:content`, `test:e2e`.
- **GitHub Actions:** CI on push and PR, and a deploy to GitHub Pages from main. Set Vite's `base` to the repo name, `/game/`. Note in the README that Pages has to be enabled in the repo settings.
- **Before each commit,** typecheck, lint, tests and content validation must pass.
- **Performance target:** 60 fps at 1280×720 with ~50 active zombies.

## 10. Definition of done
After a fresh clone and `npm install && npm run dev`, a player can:
1. Play the prologue with hints and reach Firehouse 9.
2. Search, loot, manage weight, and eat and drink. Get hungry and thirsty, bleed, get infected, and treat it.
3. Fight walkers and runners with melee and guns. Noise pulls zombies in, sneaking and bottles work, the FOV hides what the player can't see, and nights are more dangerous.
4. Craft a weapon from a blueprint, mod it, wear it down and repair it.
5. Talk to NPCs through branching dialogue. Take on the Act 1 main chain and complete it through the hospital boss.
6. Finish 3+ side quests, including the one with a real choice.
7. Barter with 2+ traders at sensible prices.
8. Travel the world map on foot, then by vehicle using fuel.
9. Save, quit, load, and resume exactly where they were. Dying sends them back to the last save.

All checks are green.

## 11. When you're done
Report:
- what's implemented
- how to run and play, including controls and debug commands
- what's stubbed or faked
- known bugs
- screenshots
- your recommended next 5 iterations

Also write `docs/CONTENT_GUIDE.md` showing how to add an item, a weapon, a recipe, an enemy, an NPC with dialogue, a quest, a trader and a zone.
