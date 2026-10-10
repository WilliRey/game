# Build brief v2: HOLDOUT, the 3D pass

This is the v2 pass on HOLDOUT, the game in this repo. v1 is finished and live on GitHub Pages from `main`. Read `docs/BRIEF.md`, `docs/DESIGN.md` and `docs/ROADMAP.md` first, then save this message as `docs/BRIEF_V2.md`. Work on this branch (`claude/game-v2`), commit and push often, and don't push to `main`. The owner will review the result before it goes live.

The owner played v1 and asked for five changes, in their words:
- "I wanted it to be like at a 3D angle like Last Stand: Aftermath instead of completely top down."
- "I can't really see the melee weapons strike."
- "The zombies seem to do way too much damage to me when I hit them with melee weapons."
- "There should be classes that determine special skills or available gadgets and weapons at the beginning of the game."
- "It takes way too long to open an unlocked chest or storage."

## 1. 3D angled view, like Aftermath
- Replace the 2D presentation layer with a real-time 3D renderer. Three.js is recommended; keep Phaser only if something still benefits from it. The pure-TS simulation in `src/sim` and `src/systems` stays the source of truth: gameplay stays tile-based and the renderer only draws it in 3D. Save format, content data and tests should keep working.
- **Camera:** perspective, pitched roughly 50–60° down, following the player with the existing look-ahead toward the cursor (further when aiming). Aim by raycasting the mouse onto the ground plane.
- **World:**
  - Walls are extruded to real height with low-poly geometry. Floors have textures.
  - Props (containers, cars, stations, furniture) are simple 3D shapes with readable silhouettes.
  - Roofs are hidden.
  - Walls between the camera and the player fade or cut away, so the player is never hidden.
- **Lighting:**
  - Real lights for the flashlight (a spotlight with shadows), lamps, fire barrels, muzzle flashes and molotovs.
  - Day/night drives the ambient light.
  - Keep the existing line-of-sight rules: areas the player can't see are dark, remembered areas are dim, and enemies outside line of sight are hidden.
- **Characters:** low-poly placeholder models built in code: player, each zombie type, NPCs. Give them simple procedural animation (walk bob, attack, hit flinch, death fall).
- **Style:** dark and moody, with readable silhouettes. Keep every visual behind the asset manifest so real models can be dropped in later. If you can download CC0 low-poly packs (Kenney, Quaternius), they're fine; credit them.
- **Performance:** keep 60 fps with ~50 zombies on a normal laptop GPU. Use instancing for repeated geometry. There must be a fallback for CI and headless browsers.
- **Keep working as before:** the HUD, the Preact screens, the zone map and the world map. Move the title screen and any remaining Phaser-only scenes to the new setup.

## 2. Visible melee
- The weapon is visible in the player's hand, and every swing animates through wind-up and follow-through with a visible arc or slash trail.
- On a hit, show impact sparks or blood, a hit flash, a brief hit-stop and a small camera nudge, and play a flinch and knockback on the zombie.
- A miss should still visibly swing.

## 3. Melee damage balance
First reproduce the problem with a scripted sim test: a player with a bat fighting one walker, then three. Find out why trading hits costs so much health, then fix it.
- **Targets:**
  - Killing a lone walker with a bat or crowbar usually costs 0–10 HP.
  - Three walkers at once are dangerous but survivable with good use of shove and positioning.
- **Likely levers:**
  - Zombies telegraph attacks with a visible ~0.45 s wind-up, and every player melee hit interrupts that wind-up and staggers walkers.
  - Melee reach should clearly exceed zombie reach; currently walker reach is 1.1 tiles, about the same as most weapons.
  - Give the player a short invulnerability window after being hit (~0.5 s).
  - Lower walker damage to around 5–8.
- Keep the test in the suite so this stays balanced.

## 4. Classes
- On New Game, after difficulty, the player picks a background for Sam. Make the few story lines that mention Sam's job depend on the class.
- Each class has:
  - a starting kit
  - a starting skill spread
  - one passive perk
  - one active ability on a new key (Q), with a cooldown and a HUD indicator
  - at least one class-only gadget recipe
  - one or two class-specific dialogue options in Act 1
- Classes are data-driven (`classes.json` with a zod schema, covered by content validation).
- Starting set, to tune freely:
  - **Mechanic:** cheaper, better repairs and faster crafting. Starts with a wrench, toolbox, duct tape and the pipe-pistol blueprint. Gadget: noise-maker decoy. Active: deploy the decoy. Faster ambulance repair.
  - **Paramedic:** healing items +50% and infection progresses slower. Starts with a scalpel, first-aid kits, bandages and antibiotics. Active: adrenaline shot (heal + stamina burst). Doc's quest is easier.
  - **Ex-cop:** better firearm damage, reload and spread. Starts with a 9mm pistol with ammo and a police baton. Gadget: flashbang (stuns zombies in a radius). Active: throw a flashbang.
  - **Scavenger:** faster searching, quieter movement and better loot rolls. Starts with a crowbar, lockpicks and a bigger backpack. Gadget: smoke bomb (breaks zombie sight). Active: briefly reveal nearby containers and zombies.
- Show classes on the new-game screen with their kit and abilities. Saves store the class; migrate old saves to Mechanic.

## 5. Faster searching
- Unlocked containers open almost immediately: about 0.4 s small, 0.7 s medium, 1.0 s large, still reduced by Scavenging and the Scavenger perk.
- The loot window opens as soon as the search finishes.
- Locked containers keep their lock actions.
- Searching still makes a little noise.

## Process
- Update `docs/DESIGN.md` (decisions log), `docs/ROADMAP.md` (add a v2 section) and the README (controls, classes, screenshots).
- Before each commit, `npm run check` and `npm run build` must pass. Keep `npm run test:e2e` green, with screenshots of the new 3D view.
- Play the prologue and Act 1 in the browser with real input after the 3D switch, and fix what you find.
- Don't stop to ask questions; make sensible calls and log them.
- When you're done, push and report:
  - what changed
  - how it plays now
  - remaining issues
  - before/after screenshots
