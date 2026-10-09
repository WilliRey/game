# HOLDOUT — Content guide

Everything the player meets is data: JSON files in `src/content/data/`, validated with zod at boot and by
`npm run validate:content`. Adding an item, weapon, recipe, enemy, NPC, quest, trader or zone is a data edit,
not a code change. This guide walks through each one with real examples from the shipped content.

- **Schemas** (the source of truth for every field and its default): `src/content/schemas.ts`.
- **Cross-reference checks** (unknown ids, unreachable quests, impossible recipes...): `src/content/validate.ts`.
- **Balance numbers** (needs, combat, prices, travel, difficulty multipliers): `src/config/balance.ts`.

## The workflow

1. Edit the JSON. Ids are `snake_case` and unique within their file.
2. `npm run validate:content` — schema errors name the file and path; reference errors name what's missing
   (`quest act1 stage 2 objective fuel: item 'fuel_cann' unknown`). It also proves every quest can be
   completed: each item a quest needs must be obtainable (loot, a fixed container, a pickup, a trader, a
   recipe or an effect), and every zone, NPC and object it points at must exist.
3. `npm run check` — typecheck, lint, unit tests (including the scripted quest playthrough and a map
   reachability test for every zone) and content validation.
4. Try it in the game with the debug console (backtick, in `npm run dev` or with `?debug=1`):
   `give <itemId>`, `tp <zoneId>`, `quest <id> <stage>`, `flag <key> <value>`, `spawn <enemy>`,
   `travel <nodeId>`, `reveal`.

Text can use `{name}` tokens from `names.json` (`{city}`, `{sam_short}`, `{jo_short}`, `{ruth}`...), so
renaming a character or place is one edit. NPC, zone and world-node display names also default to their
`names.json` entry when the file doesn't set `name`.

**Item matchers.** Anywhere a quest or condition takes an item, you can write an item id (`antibiotics`),
a category (`cat:food`, `cat:drink`) or a tag (`tag:medicine`).

---

## Add an item

`src/content/data/items.json`

```json
{
  "id": "canned_peaches",
  "name": "Canned Peaches",
  "description": "Syrup counts as water, right?",
  "category": "food",
  "weight": 0.45,
  "value": 12,
  "stack": 10,
  "use": { "hunger": 25, "thirst": 5 }
}
```

| Field | Notes |
|---|---|
| `category` | `food drink medical material tool ammo weapon mod armor backpack blueprint note quest throwable fuel junk`. Traders' `wants`/`junk` lists use these. |
| `rarity` | `common` (default) `uncommon` `rare` `epic` — sets the name color. |
| `weight` (kg), `value` | Value drives barter prices (see *Add a trader*). |
| `stack` | Max stack size (default 1). |
| `use` | Eat/drink/medicine: `hunger`, `thirst`, `hp`, `stamina`, `cureBleeding`, `antibiotic`, `cureFoodPoisoning`, `foodPoisonChance`, `raw`. Raw food and dirty water should have a poison chance and a cooking recipe. |
| `tool` | `lockpick`, `crowbar`, `hose` (siphoning), `cutter` (chains), `flashlight`, `keyFor: ["door_key_id"]`. |
| `armor` | `{ "slot": "head"|"torso", "damageReduction": 0.15, "infectionReduction": 0.2, "noisePenalty": 0 }` |
| `backpack` | `{ "capacityBonus": 10 }` |
| `blueprint` | `{ "recipeId": "..." }` — reading it teaches the recipe. |
| `note` | `{ "noteId": "..." }` — read on pickup, kept in the journal (weight 0). |
| `fuel` | `{ "liters": 5 }` — can be poured into the vehicle. |
| `durability`, `dismantle`, `repair` | Wear, what dismantling returns, and repair materials (defaults per weapon kind in `balance.crafting.repairCost`). |

**Getting it into the world:** add it to a loot table (`lootTables.json`), a fixed container or pickup in a
zone, a trader's stock, a recipe output or a quest reward (`giveItem`). If nothing can produce it, the
validator will say so when a quest needs it.

```json
// lootTables.json → "fridge" → entries
{ "itemId": "canned_peaches", "weight": 4, "qty": [1, 2], "minTier": 1 }
```

Each container type (`containerTypes.json`: fridge, cabinet, toolbox, car_trunk, corpse, ...) names its loot
table. A table has `rollsByTier` (rolls per zone danger tier), an `emptyChance`, and weighted `entries` that
can be limited to tiers with `minTier`/`maxTier`.

## Add a weapon

Weapons are items with a `weapon` block. Melee:

```json
{
  "id": "nail_bat",
  "name": "Nail Bat",
  "description": "A bat with opinions.",
  "category": "weapon",
  "weight": 1.2,
  "value": 35,
  "rarity": "uncommon",
  "durability": 70,
  "weapon": {
    "kind": "melee",
    "damage": 25,
    "melee": { "arcDeg": 100, "range": 1.5, "windupMs": 180, "recoveryMs": 330, "stamina": 12,
               "knockback": 1.0, "staggerChance": 0.45 },
    "modSlots": ["grip"]
  },
  "dismantle": [{ "itemId": "wood_plank", "qty": 1 }, { "itemId": "nails", "qty": 1 }]
}
```

`melee` also takes `cleave` (hits everything in the arc) and `heavy` (hit-stop and bigger knockback).

Firearm:

```json
"weapon": {
  "kind": "firearm",
  "damage": 18,
  "firearm": { "ammoType": "scrap", "magSize": 2, "reloadMs": 1800, "spreadBaseDeg": 5, "spreadMaxDeg": 18,
               "range": 14, "noise": 28, "fireIntervalMs": 400, "jamChance": 0.12 },
  "modSlots": [],
  "crude": true
}
```

| Firearm field | Notes |
|---|---|
| `ammoType` | `9mm shell rifle bolt scrap` — ammo items declare `"ammo": { "type": "9mm" }`. |
| `pellets` | > 1 for shotguns; `shellByShell: true` loads one at a time. |
| `noise` | Radius in tiles that zombies hear. `suppressedNoise` overrides it with a suppressor. |
| `jamChance` | Crude guns jam; R clears it. |
| `recoverable` | Crossbow bolts can be picked up again. |
| `auto` | Hold to fire. |

Throwables use `"kind": "throwable"` with `"throwable": { "effect": "noise"|"fire"|"explosion", "radius",
"noise", "durationSec", "fuseMs", "throwRange" }`.

**Mods** are items with a `mod` block. `slot` is `muzzle sight magazine stock` (firearms) or `head grip`
(melee); `stats` are multipliers (`damage`, `spread`, `noise`, `range`, `knockback`, `durability`,
`stamina`, `jamChance`, `recoilBloom`), `magSize` is additive, and `suppressed`/`cleave` are flags.
`ammoTypes` limits which guns accept it:

```json
{ "id": "suppressor", "name": "Suppressor", "category": "mod", "weight": 0.3, "value": 60, "rarity": "rare",
  "mod": { "slot": "muzzle", "appliesTo": "firearm", "stats": { "suppressed": true, "damage": 0.95 },
           "ammoTypes": ["9mm", "rifle"] } }
```

A weapon only accepts mods for slots listed in its `modSlots`. The workbench's Mods tab shows the
before/after stats.

## Add a recipe

`src/content/data/recipes.json`

```json
{
  "id": "nail_bat",
  "station": "workbench",
  "tier": 1,
  "inputs": [{ "itemId": "bat", "qty": 1 }, { "itemId": "nails", "qty": 2 }],
  "output": { "itemId": "nail_bat", "qty": 1 },
  "requiresBlueprint": true,
  "timeMinutes": 15,
  "xp": 12,
  "category": "weapon"
}
```

- `station`: `inventory` (anywhere), `workbench`, `stove` (cooking and boiling; campfires count) or
  `reloading`. `tier` is the minimum station tier (the hub's workbench upgrades to 2 and 3 through
  `stationUpgrades.json`; field workbenches have a fixed `tier` on their zone object).
- `tool`: an item id that must be in the pack (not consumed).
- `requiresBlueprint: true` hides the recipe until it's learned — from a blueprint item
  (`"blueprint": { "recipeId": "nail_bat" }`), a note's `unlockRecipe` effect, or a quest/dialogue
  `unlockRecipe` effect. Recipes without it are known from the start.
- Crafted weapons, tools and armor get a quality multiplier from the bench tier and the Crafting skill.
- At the safehouse, crafting also draws materials from the stash.
- `class`: only that class can craft it (class gadgets like the Mechanic's noise-maker). It's known from the
  start by that class and never shows for the others. List it in the class's `recipes` too.

## Add an enemy

`src/content/data/enemies.json`

```json
{
  "id": "walker",
  "name": "Walker",
  "hp": 40,
  "speed": 1.5,
  "damage": [5, 8],
  "radius": 0.38,
  "attackCooldown": 1.2,
  "xp": 10,
  "dayWeight": 1,
  "nightWeight": 1
}
```

| Field | Notes |
|---|---|
| `speed` | Tiles per second (the player walks 3.5 and sprints 5.5). Night multiplies it (`balance.zombies`). |
| `windupSec` | The telegraphed wind-up before each swing (default `balance.zombies.windupSeconds`, 0.45). Every melee hit interrupts it, so slower wind-ups make a type easier to fight. |
| `reach` | How far past its body the swing lands, in tiles (default `balance.zombies.attackReach`, 0.75). Keep it below the shortest melee weapon's reach or melee becomes a trade of hits. |
| `damage`, `attackCooldown` | Damage range per landed swing and the pause between swings. After any hit the player is invulnerable for `balance.health.hitInvulnerabilitySeconds`. |
| `sightMultiplier`, `hearingMultiplier` | Scale the base senses. |
| `special` | `burst` (bloater: a gas cloud on death, with `burst: { damage, radius, durationSec }`) or `scream` (alerts everything nearby on sight). |
| `boss`, `staggerResist`, `infectionChance` | Bosses get a big health bar; infection chance overrides the default per hit. |
| `dayWeight`, `nightWeight` | Relative odds when a zone picks ambient types (runners are more common at night). |
| `corpseLoot` | A loot table rolled into a corpse container when it dies. |

`xp` is the kill reward (`balance.progression.killXp` overrides it per type). The 3D model is built per enemy id;
give a new type a look in `src/game/art/models.ts` (`ZOMBIE_COLORS` for the palette, `BODY` for proportions)
and list it in `ZOMBIE_TYPES` in `src/game/art/manifest.ts`, or it falls back to the walker's look.

**Putting it in the world:** list it in a zone's `spawns.types` (weights for ambient spawns), place a `nest`
object (a fixed group that stays dead once cleared) or a `spawn` object, or use a `spawn` effect from a quest
or trigger.

## Add an NPC with dialogue

1. **The NPC** — `npcs.json`:

   ```json
   { "id": "gus", "dialogue": "gus", "trader": "gus", "color": "#8fae6f", "role": "General goods" }
   ```

   The display name comes from `names.json` (`"gus": "Gus Pruitt"`) unless you set `name`.

2. **The dialogue** — `dialogues.json` (Gus's, abridged). `start` entries are checked top to bottom; the first whose
   conditions pass picks the opening node. Each node has `text`, optional `speaker` and `effects` (run on
   entering), and `choices`. A choice has `text`, `if` conditions, `effects` and `next` (a node id, or
   `null` to end the conversation). `once: true` hides a choice after it's been picked.

   ```json
   {
     "id": "gus",
     "start": [
       { "node": "rain_done", "if": [{ "type": "quest", "questId": "rain_check", "status": "completed" },
                                     { "type": "not", "cond": { "type": "flag", "key": "gus_thanked" } }] },
       { "node": "hub" }
     ],
     "nodes": {
       "hub": {
         "text": "Gus wipes his hands on a rag that makes them dirtier. \"{sam_short}! Buying, selling, or just admiring?\"",
         "choices": [
           { "text": "Let's trade.", "effects": [{ "type": "openTrade", "traderId": "gus" }] },
           { "text": "You look like a man with a project.", "next": "rain_offer",
             "if": [{ "type": "quest", "questId": "rain_check", "status": "notStarted" }] },
           { "text": "Later, Gus." }
         ]
       },
       "rain_offer": {
         "text": "Water, {sam_short}. Everyone's out looking for food, but water's what kills you. ...",
         "choices": [
           { "text": "Show me the plans.", "next": "rain_given",
             "effects": [{ "type": "startQuest", "questId": "rain_check" }] },
           { "text": "Not right now.", "next": "hub" }
         ]
       }
     }
   }
   ```

   Choices that fail an **item, skill or reputation** condition are shown disabled with the requirement
   (`[Needs Antibiotics]`), because the player can do something about them; choices gated on story state are
   hidden. For "once a day" offers, pair a `stamp` effect with a `cooldown` condition (see Ruth's ration).
   Talking to an NPC fires `npc:talked` *before* the start node is chosen, so a `talk` objective completes
   first and the NPC can open with the follow-up line.

3. **Place them** in a zone's `objects`:

   ```json
   { "id": "fh_gus", "type": "npc", "x": 15, "y": 34, "npcId": "gus" }
   ```

   Add `if` conditions to make an NPC appear only in some story states (Pike shows up at the camp only after
   he's saved: `"if": [{ "type": "quest", "questId": "missing_scout", "outcome": "saved" }]`). Presence
   updates as soon as quests or flags change.

## Add a quest

`src/content/data/quests.json`

```json
{
  "id": "medicine_run",
  "name": "Medicine Run",
  "type": "side",
  "giver": "doc_ama",
  "description": "Doc Ama needs antibiotics. The Westside pharmacy locked its controlled stock in a back room.",
  "stages": [
    {
      "id": "fetch",
      "text": "Get antibiotics from the locked back room of the Westside pharmacy.",
      "objectives": [
        { "id": "get", "type": "collect", "target": "antibiotics", "text": "Get antibiotics from the Westside pharmacy" }
      ],
      "onEnter": [{ "type": "unlockNode", "nodeId": "westside_mall" }]
    },
    {
      "id": "deliver",
      "text": "Bring them to Doc Ama.",
      "objectives": [
        { "id": "give", "type": "deliver", "target": "antibiotics", "npcId": "doc_ama", "consume": true,
          "text": "Bring the antibiotics to Doc Ama" }
      ]
    }
  ],
  "outcomes": {},
  "rewards": [
    { "type": "unlockTrader", "traderId": "doc" },
    { "type": "unlockRecipe", "recipeId": "first_aid_kit" },
    { "type": "reputation", "delta": 10 },
    { "type": "xp", "amount": 120 },
    { "type": "giveItem", "itemId": "first_aid_kit", "qty": 1 }
  ]
}
```

- `type`: `main`, `side` or `repeatable` (with `cooldownMinutes` before it can be taken again).
- Start it with a `startQuest` effect (dialogue, note, trigger, another quest's rewards) or `autoStart`.
- A stage completes when all its non-`optional` objectives are done; then the next stage's `onEnter` runs.
  Set `manualAdvance: true` when a dialogue choice should advance it (`advanceQuest`/`completeQuest`).
- **Objectives** (`target` meaning in brackets): `talk` [npcId], `collect` [item matcher, with `count`],
  `deliver` [item matcher + `npcId`, `consume`], `kill` [enemy id or `any`, optional `zoneId`, `count`],
  `reach` [`zoneId`, or `zoneId:triggerId` for a trigger area inside it], `interact` [object or
  container id], `craft` [item id], `flag` [flag key], `use` [item matcher].
- **Markers:** the tracked objective shows on the HUD, on the zone map and as an in-world marker (items and
  enemies only once the spot is explored). `marker: { "zoneId", "objectId" }` on a stage points it at a
  specific object; the world map highlights the zones the objective lives in.
- **Outcomes** give quests real choices: `"outcomes": { "saved": { "text": "...", "rewards": [...] },
  "abandoned": {...} }`, chosen by `{ "type": "completeQuest", "questId": "...", "outcome": "saved" }`.
  `rewards` at the quest level apply to every outcome.

The validator checks every quest can be finished with the content that exists. Extend
`tests/unit/quests.test.ts` (it plays the shipped quests through the same events and dialogue the game
uses) when you add something important.

## Add a trader

`src/content/data/traders.json`

```json
{
  "id": "gus",
  "npcId": "gus",
  "name": "Gus",
  "wants": ["food", "drink", "material"],
  "junk": ["junk"],
  "restockDays": 2,
  "startUnlocked": true,
  "stock": [
    { "itemId": "water_bottle", "qty": [2, 4] },
    { "itemId": "bolt_cutters", "qty": [1, 1] },
    { "itemId": "spring", "qty": [1, 2], "chance": 0.6, "minRep": 10 },
    { "itemId": "fuel_can", "qty": [1, 1], "chance": 0.6, "minRep": 15 },
    { "itemId": "hiking_pack", "qty": [1, 1], "chance": 0.5, "minRep": 30 }
  ]
}
```

- Give the NPC `"trader": "gus"` and a dialogue choice with `{ "type": "openTrade", "traderId": "gus" }`.
- Barter only. They charge `value × 1.4`, pay `value × 0.55`, ×1.4 for categories in `wants` and ×0.6 for
  `junk`; reputation and the Barter skill improve both sides; condition and crafted quality scale value.
  What they pay is always capped below what they charge, so no loop makes value from nothing (unit-tested
  over every item). Tune the rates in `balance.trade`.
- Stock is rerolled every `restockDays` from a seed per save. Entries can require reputation (`minRep`) or
  a story flag (`flag`), so stock grows with progress. `startUnlocked: false` plus an `unlockTrader` effect
  hides a trader until a quest says otherwise.

## Add a zone

A zone is one JSON file in `src/content/data/zones/`: an ASCII `map`, an optional per-zone `legend`, and
`objects` for anything that needs parameters.

```json
{
  "id": "corner_store",
  "danger": 1,
  "indoorDarkness": 0.4,
  "description": "A looted corner store and its back lot.",
  "lootTypes": ["food", "junk"],
  "exitNode": "corner_store",
  "spawns": { "density": 1, "types": { "walker": 1, "runner": 0.3 }, "max": 14 },
  "map": [
    "##################",
    "#;;;;;;;;;;;;;;;;#",
    "#;######+#######;#",
    "#;#ssss.....kk.#;E",
    "#;#........Z...#;E",
    "#;#.r..........#;E",
    "#;######/#######;#",
    "#,,,,,,,P,,,,vvv,#",
    "##################"
  ],
  "objects": [
    { "id": "cs_note", "type": "pickup", "x": 9, "y": 4, "itemId": "note_neighbor" },
    { "id": "cs_back", "type": "door", "x": 8, "y": 2, "locked": true, "keyId": "cs_back_key" }
  ],
  "onFirstEnter": [{ "type": "pan", "objectId": "cs_note", "caption": "Something pinned to the counter." }]
}
```

1. **Register it** — add an import to `src/content/raw.ts` and append it to `zones` (the only code edit:
   explicit imports keep both Vite and the Node validator happy).
2. **Name it** — `names.json` (`"corner_store": "Corner Store"`) or `"name"` in the file.
3. **Put it on the world map** — `worldNodes.json`:
   `{ "id": "corner_store", "zoneId": "corner_store", "x": 4.2, "y": 7.6, "description": "..." }`.
   Coordinates are kilometres on a 14 × 9 km map; walking is limited to `balance.travel.maxFootKm` (6 km).
   `startKnown: true` shows it from the start; otherwise unlock it with an `unlockNode` effect from a note,
   the radio, a dialogue, a quest or a travel event. `lockedText` shows a node that can't be visited yet;
   `entry` names the start object travellers arrive at.
4. `npm run check` — the reachability test fails if a door, container, exit, NPC or object can't be reached
   from the start (doors count as passable).

**Map rules.** All rows must be the same length. Every character must be in `legend.json` or the zone's
`legend`. The shipped legend:

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `#` | wall | `.` `_` `-` | floor / tile / carpet |
| `;` `,` `"` `:` | concrete / road / grass / dirt | `~` | water |
| `g` `%` | broken glass (loud) / rubble | `=` | window |
| `\|` `T` `*` | fence / tree / bush (blocks sight) | `n` | counter |
| `^` | stairs | `+` `/` `L` | door / open door / locked door |
| `f` `k` `m` | fridge / cabinet / medicine cabinet | `t` `d` `o` | toolbox / desk / locker |
| `u` `x` `s` | dumpster / corpse / shelf | `c` `w` `r` | crate / wardrobe / register |
| `p` `a` `h` | pharmacy shelf / gun locker / hospital cart | `v` | car wreck (trunk) |
| `Z` `z` | spawn point (indoor / outdoor) | `P` | player start |
| `E` `e` | exit to the world map (outdoor / indoor) | `l` | lamp |
| `W` `O` `R` | workbench / stove / reloading bench | `H` `B` | stash / bed |
| `C` `Q` `Y` | rain collector / radio / campfire (also a stove) | | |

A per-zone legend can add characters, e.g. `"legend": { "b": { "tile": "concrete", "container": "bus" } }`.
Adjacent identical container characters merge into one container (`vvv` over two rows is one car trunk);
marker characters (`P`, `Z`, `E`, lamps) take the ground of their surroundings.

**Objects** (`x`, `y` are tile coordinates; `w`/`h` default to 1):

| `type` | Use | Key fields |
|---|---|---|
| `door` | parameters for a door tile | `locked`, `keyId`, `keyOnly` (no picking/forcing), `hp` |
| `container` | a container with fixed `items`, a `label`, or overrides | `items`, `lootTable`, `containerType`, `locked`, `keyId`, `alarm` |
| `pickup` | an item on the floor | `itemId`, `qty`, `effects` |
| `npc` | a person | `npcId`, `if` |
| `start` | a named arrival point | (`exit.entry` and `worldNode.entry` refer to it) |
| `exit` | an exit; `toZone` + `entry` walks straight into another zone | `nodeId`, `toZone`, `entry`, `label` |
| `trigger` | an area that fires `zone:reached` (for `reach zone:area`) and effects | `w`, `h`, `text`, `effects`, `if`, `once` |
| `station` | a field station | `station`, `tier` |
| `nest` / `spawn` | fixed enemy groups / spawns | `enemyType`, `count` |
| `interact` | a usable object | `text`, `effects`, `dialogue`, `hold`, `requires`, `if`, `failText`, `once`, `noise`, `solid` |
| `blocker` | something in the way until removed (chained doors) | `requires: "cutter"`, `hold`, `noise`, `failText`, `effects` |
| `siphon` | fuel to siphon with a hose | `siphonLiters` |
| `vehicle` | the camp vehicle | `if`, `effects` (repair) |
| `light` / `label` | a light source / floor text | `radius`, `color`, `flicker` / `text` |

Zone fields: `danger` (0–4: loot tier, lock chance, world-map danger), `safe` (hub: no zombies, weapons
holstered), `indoorDarkness` (0–1), `spawns` (ambient `density`, type weights, `max`), `lootTypes` (shown on
the world map), `exitNode`, `onEnter`/`onFirstEnter` effects, `description`.

---

## Add a class

`src/content/data/classes.json` — Sam's background, picked on the New Game screen after the difficulty.

```json
{
  "id": "mechanic",
  "name": "Mechanic",
  "tagline": "Twelve years keeping Harrow Transit's buses alive.",
  "description": "Twelve years on the night shift at Depot 3. ...",
  "kit": [{ "itemId": "wrench" }, { "itemId": "toolbox" }, { "itemId": "duct_tape", "qty": 3 }, { "itemId": "bp_pipe_pistol" }],
  "skills": { "crafting": 2, "melee": 1 },
  "perk": {
    "name": "Grease Monkey",
    "description": "Repairs cost half the materials and wear the item half as much. ...",
    "mods": { "repairCost": 0.5, "repairWear": 0.5, "craftTime": 0.6, "vehicleRepairTime": 0.33 }
  },
  "ability": {
    "kind": "decoy",
    "name": "Noise-maker",
    "description": "Throw a rattling, beeping decoy at the cursor. ...",
    "cooldownSec": 60,
    "itemId": "noisemaker"
  },
  "recipes": ["noisemaker"],
  "names": { "sam_job": "a city bus mechanic", "ambulance_quip": "Twelve years of buses, and this is the engine that matters." }
}
```

| Field | Notes |
|---|---|
| `kit` | Added on top of `balance.start.items`. Weapons, armor and backpacks are equipped; blueprints in the kit are learned. `mag` fills a firearm's magazine. |
| `skills` | Starting ranks (0–5) for `melee firearms scavenging crafting survival barter stealth`. |
| `perk.mods` | Multipliers (1 = no change): `repairCost`, `repairWear`, `craftTime`, `vehicleRepairTime`, `healing`, `infectionRate`, `firearmDamage`, `reloadSpeed` (higher is faster), `firearmSpread`, `searchTime`, `footstepNoise`; plus `bonusFind` (extra loot-roll chance). Systems read them through `perk(ctx)` in `src/systems/classes.ts`. |
| `ability` | The Q ability. `kind` is one of `decoy` (throws `itemId`'s gadget, not consumed), `flashbang` (same), `adrenaline` (`heal`, `durationSec`) or `scout` (`radius`, `durationSec`). A new kind needs code in `src/sim/abilities.ts`. Abilities can't be used in the safehouse. |
| `recipes` | Known from the start. Mark class-only recipes with `"class": "<id>"` in `recipes.json`. |
| `names` | Overrides for `names.json` tokens, so story text can say `{sam_job}` and get "a city bus mechanic" or "a paramedic". Every class must define the same tokens the story uses (the validator checks). |

Class dialogue options are ordinary choices with a `class` condition:
`{ "text": "A dead battery and a dry tank? That's a Tuesday.", "if": [{ "type": "class", "classId": "mechanic" }], "next": "deal_mechanic" }`.
Choices gated on a class are hidden (not shown disabled) for the other classes.

The validator checks that kit items, skills, recipes and ability gadgets exist, that every `{token}` in
story text resolves for every class, and that every quest can still be completed by every class (starting
items and class recipes count).

## Replace placeholder art

Every model and texture is requested by a key from `src/game/art/manifest.ts`. Without an override the key
gets procedural placeholder art (low-poly vertex-coloured geometry from `src/game/art/models.ts`, canvas
textures from `src/game/art/textures.ts`). To use real assets (for example a CC0 pack), put the files under
`public/` and map keys to URLs in `src/game/art/assets.ts`:

```ts
export const MODEL_OVERRIDES: Record<string, string> = {
  'container.fridge': 'models/fridge.glb',
  'model.body.walker': 'models/walker.glb',
  'model.weapon.bat': 'models/bat.glb',
};
export const TEXTURE_OVERRIDES: Record<string, string> = {
  'tex.wall': 'textures/brick.png',
};
```

| Key | What |
|---|---|
| `container.<type>`, `station.<kind>`, `prop.vehicle`, `prop.blocker`, `prop.siphon`, `prop.board`, `prop.lampPost`, ... | Static props. Placed as their own objects with their own materials and textures. |
| `model.body.player`, `model.body.npc.<npcId>`, `model.body.<zombieType>` | Characters. Need nodes named `torso`, `head`, `armL`, `armR`, `legL`, `legR`; each node's origin is the joint the rig turns it about (hips for the torso, neck, shoulders, hips for the legs). Missing parts stay procedural. |
| `model.weapon.<itemId>`, `model.item.<category>`, `model.door`, `model.flashlight`, `model.corpse.<type>`, ... | Everything else built through `geometry()`. |
| `tex.wall`, `tex.fence`, `tex.decal.<kind>`, `tex.dot`, `tex.muzzle`, `tex.skyline` | Textures. |

- Overrides load at boot, before the renderer starts; a missing or broken file logs a warning and keeps the
  placeholder.
- Scale: 1 world unit = 1 tile (about 1.2 m); walls are 1.6 units tall. Models face +X, with +Y up, and sit on
  y = 0.
- Characters, weapons and other `geometry()` keys are drawn with the game's vertex-coloured materials (so
  they take the line-of-sight shading and instancing): their material colours are baked into vertex
  colours and textures are dropped. Props keep their own materials.
- Floor tiles are painted into one atlas by `drawTile` in `textures.ts`; change floors there.
- Credit any pack you add in `CREDITS.md` with its license.

---

## Other content

- **Travel events** (`travelEvents.json`): `title`, `text`, `weight`, `modes` (`foot`, `vehicle`), `once`,
  `if`, and `choices` with `if` and weighted `outcomes` (`text` + `effects`). At least one choice must have
  no conditions (the event screen can't be closed).
- **Notes** (`notes.json`): `title`, `body`, `effects` (reveal a location, a stash code via `setFlag`, a
  recipe). Make a matching item with `"category": "note"` and `"note": { "noteId": ... }`.
- **Radio** (`broadcasts.json`): played in order at the Firehouse radio when their `if` conditions pass.
- **Hints** (`hints.json`): `{ id, title, text }`, shown once via a `hint` effect or from code for firsts.
- **Station upgrades** (`stationUpgrades.json`): hub station tiers and their material costs.
- **Skills** (`skills.json`): names and the five rank descriptions (the bonuses are in `progression.ts`).

## Conditions

Used by dialogue choices and starts, travel events, broadcasts, zone objects and NPC presence.

| `type` | Fields | True when |
|---|---|---|
| `hasItem` | `itemId` (matcher), `qty` | the pack holds enough |
| `quest` | `questId`, `status` (`active completed failed notStarted started`), `stage`, `minStage`, `outcome` | the quest is in that state |
| `flag` | `key`, `value` | the flag is set (to `value`, if given) |
| `skill` | `skill`, `rank` | the skill is at least that rank |
| `reputation` | `min` | camp reputation ≥ min |
| `time` | `night` | it's night (or day) |
| `day` | `min` | the day count ≥ min |
| `recipeKnown` | `recipeId` | the recipe is known |
| `class` | `classId` | Sam has this background (`mechanic`, `paramedic`, `excop`, `scavenger`) |
| `vehicle` | `owned` | the player owns the vehicle (or not) |
| `cooldown` | `key`, `minutes` | no `stamp` with this key in the last `minutes` |
| `not` / `any` | `cond` / `conds` | negation / at least one |

## Effects

Used by dialogue, quests (stage `onEnter`/`onComplete`, rewards, outcomes), notes, broadcasts, travel
event outcomes, zone `onEnter`/`onFirstEnter` and objects.

| `type` | Fields |
|---|---|
| `giveItem` / `takeItem` | `itemId`, `qty` |
| `startQuest` / `advanceQuest` / `completeQuest` / `failQuest` | `questId` (+ `stage` / `outcome`) |
| `setFlag` | `key`, `value` |
| `reputation` | `delta` |
| `xp` | `amount` |
| `openTrade` / `unlockTrader` | `traderId` |
| `unlockRecipe` / `unlockNode` | `recipeId` / `nodeId` |
| `heal` | `hp`, `cureInfection`, `cureBleeding` |
| `needs` / `damage` | `hunger`, `thirst` / `hp` |
| `fuel` / `vehicle` | `liters` / `owned` |
| `time` | `minutes` (passes time, needs drain) |
| `textCard` / `toast` / `hint` | `title` + `body` / `text` / `hintId` |
| `baseUpgrade` | `station`, `tier` |
| `spawn` | `enemyType`, `count`, `near` |
| `note` / `broadcast` / `dialogue` | `noteId` / `broadcastId` / `dialogueId` |
| `stamp` | `key` (records the time, for `cooldown`) |
| `pan` | `objectId` or `x`,`y`, `seconds`, `caption` — a short scripted camera pan |
| `end` | ends a dialogue |
