/**
 * zod schemas for every content file. `Content` types are inferred from these, so a schema change
 * is the single source of truth for data shape. Validated at boot and by `npm run validate:content`.
 */
import { z } from 'zod';

const id = z.string().min(1);
const intRange = z.tuple([z.number().int(), z.number().int()]);

export const ItemCategory = z.enum([
  'food',
  'drink',
  'medical',
  'material',
  'tool',
  'ammo',
  'weapon',
  'mod',
  'armor',
  'backpack',
  'blueprint',
  'note',
  'quest',
  'throwable',
  'fuel',
  'junk',
]);
export type ItemCategory = z.infer<typeof ItemCategory>;

export const Rarity = z.enum(['common', 'uncommon', 'rare', 'epic']);
export type Rarity = z.infer<typeof Rarity>;

export const ModSlotSchema = z.enum(['muzzle', 'sight', 'magazine', 'stock', 'head', 'grip']);
export const AmmoType = z.enum(['9mm', 'shell', 'rifle', 'bolt', 'scrap']);
export type AmmoType = z.infer<typeof AmmoType>;

export const WeaponStatMods = z
  .object({
    damage: z.number().optional(), // multiplier
    spread: z.number().optional(), // multiplier
    magSize: z.number().optional(), // additive
    noise: z.number().optional(), // multiplier
    range: z.number().optional(), // multiplier
    knockback: z.number().optional(), // multiplier
    durability: z.number().optional(), // multiplier
    stamina: z.number().optional(), // multiplier
    jamChance: z.number().optional(), // multiplier
    recoilBloom: z.number().optional(), // multiplier
    suppressed: z.boolean().optional(),
    cleave: z.boolean().optional(),
  })
  .strict();
export type WeaponStatMods = z.infer<typeof WeaponStatMods>;

export const MeleeDef = z
  .object({
    arcDeg: z.number().default(90),
    range: z.number().default(1.4),
    windupMs: z.number().default(150),
    recoveryMs: z.number().default(300),
    stamina: z.number().default(10),
    knockback: z.number().default(0.6),
    staggerChance: z.number().min(0).max(1).default(0.3),
    cleave: z.boolean().default(false),
    heavy: z.boolean().default(false),
  })
  .strict();

export const FirearmDef = z
  .object({
    ammoType: AmmoType,
    magSize: z.number().int().min(1),
    reloadMs: z.number().default(1500),
    shellByShell: z.boolean().default(false),
    spreadBaseDeg: z.number().default(3),
    spreadMaxDeg: z.number().default(14),
    pellets: z.number().int().default(1),
    range: z.number().default(18),
    noise: z.number(),
    fireIntervalMs: z.number().default(250),
    auto: z.boolean().default(false),
    jamChance: z.number().min(0).max(1).default(0),
    recoverable: z.boolean().default(false),
    suppressedNoise: z.number().optional(),
    projectileSpeed: z.number().default(40),
  })
  .strict();

export const ThrowableDef = z
  .object({
    effect: z.enum(['noise', 'fire', 'explosion']),
    radius: z.number().default(2),
    noise: z.number().default(10),
    durationSec: z.number().default(0),
    fuseMs: z.number().default(0),
    throwRange: z.number().default(8),
  })
  .strict();

export const WeaponDef = z
  .object({
    kind: z.enum(['melee', 'firearm', 'throwable']),
    damage: z.number().default(0),
    melee: MeleeDef.optional(),
    firearm: FirearmDef.optional(),
    throwable: ThrowableDef.optional(),
    modSlots: z.array(ModSlotSchema).default([]),
    wearPerUse: z.number().default(1),
    crude: z.boolean().default(false),
  })
  .strict();
export type WeaponDef = z.infer<typeof WeaponDef>;

export const UseDef = z
  .object({
    hunger: z.number().optional(),
    thirst: z.number().optional(),
    hp: z.number().optional(),
    stamina: z.number().optional(),
    cureBleeding: z.boolean().optional(),
    antibiotic: z.boolean().optional(),
    cureFoodPoisoning: z.boolean().optional(),
    foodPoisonChance: z.number().min(0).max(1).optional(),
    raw: z.boolean().optional(),
    useTimeMs: z.number().default(800),
    xp: z.number().optional(),
  })
  .strict();

export const ItemDef = z
  .object({
    id,
    name: z.string(),
    description: z.string().default(''),
    category: ItemCategory,
    rarity: Rarity.default('common'),
    weight: z.number().min(0),
    value: z.number().min(0),
    stack: z.number().int().min(1).default(1),
    tags: z.array(z.string()).default([]),
    durability: z.number().optional(),
    use: UseDef.optional(),
    weapon: WeaponDef.optional(),
    armor: z
      .object({
        slot: z.enum(['head', 'torso']),
        damageReduction: z.number().min(0).max(1),
        infectionReduction: z.number().min(0).max(1).default(0),
        noisePenalty: z.number().default(0),
      })
      .strict()
      .optional(),
    backpack: z.object({ capacityBonus: z.number() }).strict().optional(),
    mod: z
      .object({
        slot: ModSlotSchema,
        appliesTo: z.enum(['firearm', 'melee']),
        stats: WeaponStatMods,
        ammoTypes: z.array(AmmoType).optional(),
      })
      .strict()
      .optional(),
    blueprint: z.object({ recipeId: id }).strict().optional(),
    note: z.object({ noteId: id }).strict().optional(),
    ammo: z.object({ type: AmmoType }).strict().optional(),
    fuel: z.object({ liters: z.number() }).strict().optional(),
    tool: z
      .object({
        lockpick: z.boolean().optional(),
        crowbar: z.boolean().optional(),
        hose: z.boolean().optional(),
        keyFor: z.array(id).optional(),
        cutter: z.boolean().optional(),
        flashlight: z.boolean().optional(),
      })
      .strict()
      .optional(),
    dismantle: z.array(z.object({ itemId: id, qty: z.number().int().min(1) }).strict()).optional(),
    /** Materials per repair; defaults come from balance.crafting.repairCost by weapon kind. */
    repair: z.array(z.object({ itemId: id, qty: z.number().int().min(1) }).strict()).optional(),
  })
  .strict();
export type ItemDef = z.infer<typeof ItemDef>;

export const RecipeDef = z
  .object({
    id,
    station: z.enum(['inventory', 'workbench', 'stove', 'reloading']),
    tier: z.number().int().min(1).default(1),
    inputs: z.array(z.object({ itemId: id, qty: z.number().int().min(1) })),
    output: z.object({ itemId: id, qty: z.number().int().min(1).default(1) }),
    tool: id.optional(),
    requiresBlueprint: z.boolean().default(false),
    timeMinutes: z.number().default(5),
    xp: z.number().default(5),
    category: z.string().default('misc'),
  })
  .strict();
export type RecipeDef = z.infer<typeof RecipeDef>;

export const LootEntry = z
  .object({
    itemId: id,
    weight: z.number().positive(),
    qty: intRange.default([1, 1]),
    minTier: z.number().int().optional(),
    maxTier: z.number().int().optional(),
  })
  .strict();
export const LootTableDef = z
  .object({
    id,
    /** Rolls per danger tier (index 0 = tier 1). */
    rollsByTier: z.array(intRange).min(1),
    emptyChance: z.number().min(0).max(1).default(0.1),
    entries: z.array(LootEntry).min(1),
  })
  .strict();
export type LootTableDef = z.infer<typeof LootTableDef>;

export const ContainerTypeDef = z
  .object({
    id,
    name: z.string(),
    size: z.enum(['small', 'medium', 'large']),
    lootTable: id,
    lockChanceByTier: z.array(z.number().min(0).max(1)).default([0, 0.1, 0.2, 0.3]),
    blocksMovement: z.boolean().default(true),
    blocksSight: z.boolean().default(false),
  })
  .strict();
export type ContainerTypeDef = z.infer<typeof ContainerTypeDef>;

export const EnemyDef = z
  .object({
    id,
    name: z.string(),
    hp: z.number().positive(),
    speed: z.number().positive(),
    damage: intRange,
    radius: z.number().default(0.4),
    sightMultiplier: z.number().default(1),
    hearingMultiplier: z.number().default(1),
    attackCooldown: z.number().default(1.1),
    xp: z.number().default(10),
    special: z.enum(['none', 'burst', 'scream']).default('none'),
    burst: z.object({ damage: z.number(), radius: z.number(), durationSec: z.number() }).strict().optional(),
    boss: z.boolean().default(false),
    corpseLoot: id.optional(),
    nightWeight: z.number().default(1),
    dayWeight: z.number().default(1),
    staggerResist: z.number().min(0).max(1).default(0),
    infectionChance: z.number().optional(),
  })
  .strict();
export type EnemyDef = z.infer<typeof EnemyDef>;

// ---------- conditions & effects (shared by dialogue, quests, travel events, radio) ----------
export const Condition: z.ZodType<ConditionT> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('hasItem'), itemId: id, qty: z.number().int().min(1).default(1) }).strict(),
    z
      .object({
        type: z.literal('quest'),
        questId: id,
        status: z.enum(['active', 'completed', 'failed', 'notStarted', 'started']).optional(),
        stage: z.number().int().optional(),
        minStage: z.number().int().optional(),
        outcome: z.string().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('flag'),
        key: z.string(),
        value: z.union([z.boolean(), z.number(), z.string()]).optional(),
      })
      .strict(),
    z.object({ type: z.literal('skill'), skill: z.string(), rank: z.number().int() }).strict(),
    z.object({ type: z.literal('reputation'), min: z.number() }).strict(),
    z.object({ type: z.literal('time'), night: z.boolean() }).strict(),
    z.object({ type: z.literal('recipeKnown'), recipeId: id }).strict(),
    z.object({ type: z.literal('vehicle'), owned: z.boolean() }).strict(),
    z.object({ type: z.literal('day'), min: z.number() }).strict(),
    z.object({ type: z.literal('not'), cond: Condition }).strict(),
    z.object({ type: z.literal('any'), conds: z.array(Condition) }).strict(),
  ]),
);
export type ConditionT =
  | { type: 'hasItem'; itemId: string; qty: number }
  | {
      type: 'quest';
      questId: string;
      status?: 'active' | 'completed' | 'failed' | 'notStarted' | 'started';
      stage?: number;
      minStage?: number;
      outcome?: string;
    }
  | { type: 'flag'; key: string; value?: boolean | number | string }
  | { type: 'skill'; skill: string; rank: number }
  | { type: 'reputation'; min: number }
  | { type: 'time'; night: boolean }
  | { type: 'recipeKnown'; recipeId: string }
  | { type: 'vehicle'; owned: boolean }
  | { type: 'day'; min: number }
  | { type: 'not'; cond: ConditionT }
  | { type: 'any'; conds: ConditionT[] };

export const Effect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('giveItem'), itemId: id, qty: z.number().int().min(1).default(1) }).strict(),
  z.object({ type: z.literal('takeItem'), itemId: id, qty: z.number().int().min(1).default(1) }).strict(),
  z.object({ type: z.literal('startQuest'), questId: id }).strict(),
  z.object({ type: z.literal('advanceQuest'), questId: id, stage: z.number().int().optional() }).strict(),
  z
    .object({ type: z.literal('completeQuest'), questId: id, outcome: z.string().default('default') })
    .strict(),
  z.object({ type: z.literal('failQuest'), questId: id }).strict(),
  z
    .object({
      type: z.literal('setFlag'),
      key: z.string(),
      value: z.union([z.boolean(), z.number(), z.string()]).default(true),
    })
    .strict(),
  z.object({ type: z.literal('reputation'), delta: z.number() }).strict(),
  z.object({ type: z.literal('openTrade'), traderId: id }).strict(),
  z.object({ type: z.literal('xp'), amount: z.number() }).strict(),
  z.object({ type: z.literal('unlockRecipe'), recipeId: id }).strict(),
  z.object({ type: z.literal('unlockNode'), nodeId: id }).strict(),
  z.object({ type: z.literal('unlockTrader'), traderId: id }).strict(),
  z
    .object({
      type: z.literal('heal'),
      hp: z.number().optional(),
      cureInfection: z.boolean().optional(),
      cureBleeding: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('needs'), hunger: z.number().optional(), thirst: z.number().optional() })
    .strict(),
  z.object({ type: z.literal('damage'), hp: z.number() }).strict(),
  z.object({ type: z.literal('fuel'), liters: z.number() }).strict(),
  z.object({ type: z.literal('time'), minutes: z.number() }).strict(),
  z.object({ type: z.literal('textCard'), title: z.string(), body: z.string() }).strict(),
  z.object({ type: z.literal('toast'), text: z.string() }).strict(),
  z
    .object({
      type: z.literal('baseUpgrade'),
      station: z.enum(['workbench', 'stove', 'reloading', 'rainCollector']),
      tier: z.number().int().default(1),
    })
    .strict(),
  z.object({ type: z.literal('vehicle'), owned: z.boolean() }).strict(),
  z.object({ type: z.literal('hint'), hintId: id }).strict(),
  z
    .object({
      type: z.literal('spawn'),
      enemyType: id,
      count: z.number().int().default(1),
      near: z.string().optional(),
    })
    .strict(),
  z.object({ type: z.literal('note'), noteId: id }).strict(),
  z.object({ type: z.literal('broadcast'), broadcastId: id }).strict(),
  z.object({ type: z.literal('dialogue'), dialogueId: id }).strict(),
  z.object({ type: z.literal('end') }).strict(),
]);
export type EffectT = z.infer<typeof Effect>;

// ---------- dialogue ----------
export const DialogueChoice = z
  .object({
    text: z.string(),
    if: z.array(Condition).default([]),
    effects: z.array(Effect).default([]),
    next: z.string().nullable().default(null),
    once: z.boolean().default(false),
  })
  .strict();
export const DialogueNode = z
  .object({
    speaker: z.string().optional(),
    text: z.string(),
    effects: z.array(Effect).default([]),
    choices: z.array(DialogueChoice).default([]),
    next: z.string().nullable().default(null),
  })
  .strict();
export const DialogueDef = z
  .object({
    id,
    /** Evaluated top to bottom; the first whose conditions pass is the start node. */
    start: z.array(z.object({ if: z.array(Condition).default([]), node: z.string() }).strict()).min(1),
    nodes: z.record(z.string(), DialogueNode),
  })
  .strict();
export type DialogueDef = z.infer<typeof DialogueDef>;
export type DialogueNodeT = z.infer<typeof DialogueNode>;
export type DialogueChoiceT = z.infer<typeof DialogueChoice>;

export const NpcDef = z
  .object({
    id,
    name: z.string().optional(),
    dialogue: id,
    trader: id.optional(),
    color: z.string().default('#9bbcd1'),
    role: z.string().default(''),
  })
  .strict();
export type NpcDef = z.infer<typeof NpcDef>;

// ---------- quests ----------
export const ObjectiveType = z.enum([
  'talk',
  'collect',
  'deliver',
  'kill',
  'reach',
  'interact',
  'craft',
  'flag',
  'use',
]);
export const ObjectiveDef = z
  .object({
    id,
    type: ObjectiveType,
    /** npcId | item matcher (itemId, cat:<category>, tag:<tag>) | enemyType or 'any' | zoneId or zoneId:areaId | objectId | flag key */
    target: z.string(),
    count: z.number().int().min(1).default(1),
    zoneId: id.optional(),
    text: z.string(),
    optional: z.boolean().default(false),
    /** For deliver: items are consumed when the objective completes. */
    consume: z.boolean().default(false),
    /** For deliver: the NPC it's delivered to (talk to them while holding the items). */
    npcId: id.optional(),
  })
  .strict();
export const QuestStage = z
  .object({
    id,
    text: z.string(),
    objectives: z.array(ObjectiveDef).min(1),
    onEnter: z.array(Effect).default([]),
    onComplete: z.array(Effect).default([]),
    marker: z
      .object({ nodeId: id.optional(), zoneId: id.optional(), objectId: z.string().optional() })
      .strict()
      .optional(),
    /** If true, completing the objectives does not auto-advance (a dialogue effect will). */
    manualAdvance: z.boolean().default(false),
  })
  .strict();
export const QuestDef = z
  .object({
    id,
    name: z.string(),
    type: z.enum(['main', 'side', 'repeatable']),
    description: z.string(),
    giver: id.optional(),
    stages: z.array(QuestStage).min(1),
    outcomes: z.record(
      z.string(),
      z.object({ text: z.string(), rewards: z.array(Effect).default([]) }).strict(),
    ),
    rewards: z.array(Effect).default([]),
    autoStart: z.boolean().default(false),
    cooldownMinutes: z.number().default(0),
    /** Effects on the last stage completing: 'default' outcome unless a dialogue chose one. */
    completeOnLastStage: z.boolean().default(true),
  })
  .strict();
export type QuestDef = z.infer<typeof QuestDef>;
export type QuestStageT = z.infer<typeof QuestStage>;
export type ObjectiveT = z.infer<typeof ObjectiveDef>;

// ---------- traders ----------
export const TraderDef = z
  .object({
    id,
    npcId: id,
    name: z.string(),
    wants: z.array(ItemCategory).default([]),
    junk: z.array(ItemCategory).default([]),
    stock: z.array(
      z
        .object({
          itemId: id,
          qty: intRange.default([1, 1]),
          chance: z.number().min(0).max(1).default(1),
          minRep: z.number().default(0),
          flag: z.string().optional(),
        })
        .strict(),
    ),
    restockDays: z.number().default(3),
    startUnlocked: z.boolean().default(true),
  })
  .strict();
export type TraderDef = z.infer<typeof TraderDef>;

// ---------- zones ----------
export const TILE_KIND_LIST = [
  'void',
  'wall',
  'floor',
  'glass',
  'door',
  'lockedDoor',
  'window',
  'rubble',
  'road',
  'grass',
  'water',
  'counter',
  'tile',
  'carpet',
  'concrete',
  'dirt',
  'fence',
  'tree',
  'bush',
  'stairs',
] as const;
export const TileKind = z.enum(TILE_KIND_LIST);
export type TileKind = z.infer<typeof TileKind>;
export const LegendEntry = z
  .object({
    tile: TileKind,
    container: id.optional(),
    spawn: z.boolean().optional(),
    start: z.boolean().optional(),
    exit: z.boolean().optional(),
    light: z.boolean().optional(),
    station: z.string().optional(),
    vehicle: z.boolean().optional(),
    /** Doors only: starts open. */
    open: z.boolean().optional(),
  })
  .strict();
export type LegendEntryT = z.infer<typeof LegendEntry>;

export const ZoneObject = z
  .object({
    id: z.string(),
    type: z.enum([
      'door',
      'container',
      'npc',
      'exit',
      'start',
      'pickup',
      'trigger',
      'station',
      'nest',
      'spawn',
      'light',
      'label',
      'blocker',
      'interact',
      'siphon',
    ]),
    x: z.number().int(),
    y: z.number().int(),
    w: z.number().int().default(1),
    h: z.number().int().default(1),
    locked: z.boolean().optional(),
    keyId: id.optional(),
    containerType: id.optional(),
    lootTable: id.optional(),
    items: z.array(z.object({ itemId: id, qty: z.number().int().min(1).default(1) }).strict()).optional(),
    npcId: id.optional(),
    /** exit: world-map node to travel from (defaults to the zone's exitNode). */
    nodeId: id.optional(),
    /** exit: walk straight into another zone (e.g. a basement) at its `entry` start object. */
    toZone: id.optional(),
    entry: z.string().optional(),
    itemId: id.optional(),
    qty: z.number().int().optional(),
    station: z.string().optional(),
    /** station: fixed tier for field stations (the hub's stations read the base state). */
    tier: z.number().int().optional(),
    enemyType: id.optional(),
    count: z.number().int().optional(),
    text: z.string().optional(),
    /** Shown when an interact/blocker/trigger's conditions or tool requirement aren't met. */
    failText: z.string().optional(),
    once: z.boolean().default(true),
    effects: z.array(Effect).default([]),
    if: z.array(Condition).default([]),
    label: z.string().optional(),
    hp: z.number().optional(),
    /** blocker/interact: a tool flag the player must carry (lockpick, crowbar, hose, cutter). */
    requires: z.string().optional(),
    /** interact/blocker/siphon: seconds to hold E (0 = tap). */
    hold: z.number().optional(),
    /** interact: open this dialogue instead of running effects directly. */
    dialogue: id.optional(),
    siphonLiters: z.number().optional(),
    alarm: z.boolean().optional(),
    radius: z.number().optional(),
    color: z.string().optional(),
    /** Noise radius made when this interaction completes (forcing, cutting chains). */
    noise: z.number().optional(),
  })
  .strict();
export type ZoneObjectT = z.infer<typeof ZoneObject>;

export const ZoneDef = z
  .object({
    id,
    name: z.string().optional(),
    danger: z.number().int().min(0).max(4),
    safe: z.boolean().default(false),
    indoorDarkness: z.number().min(0).max(1).default(0),
    map: z.array(z.string()).min(1),
    legend: z.record(z.string(), LegendEntry).default({}),
    objects: z.array(ZoneObject).default([]),
    spawns: z
      .object({
        density: z.number().default(1),
        types: z.record(z.string(), z.number()).default({}),
        max: z.number().int().default(30),
      })
      .strict()
      .default({ density: 1, types: {}, max: 30 }),
    lootTypes: z.array(z.string()).default([]),
    exitNode: id.optional(),
    onEnter: z.array(Effect).default([]),
    /** Effects run only the first time the player enters. */
    onFirstEnter: z.array(Effect).default([]),
    /** Shown on the world map. */
    description: z.string().default(''),
  })
  .strict();
export type ZoneDef = z.infer<typeof ZoneDef>;

export const WorldNodeDef = z
  .object({
    id,
    name: z.string().optional(),
    zoneId: id,
    x: z.number(),
    y: z.number(),
    startKnown: z.boolean().default(false),
    description: z.string().default(''),
    /** A node that is shown but can't be travelled to yet (story teaser). */
    lockedText: z.string().optional(),
  })
  .strict();
export type WorldNodeDef = z.infer<typeof WorldNodeDef>;

export const TravelEventDef = z
  .object({
    id,
    title: z.string(),
    text: z.string(),
    weight: z.number().positive().default(1),
    modes: z.array(z.enum(['foot', 'vehicle'])).default(['foot', 'vehicle']),
    if: z.array(Condition).default([]),
    choices: z
      .array(
        z
          .object({
            text: z.string(),
            if: z.array(Condition).default([]),
            outcomes: z
              .array(
                z
                  .object({
                    weight: z.number().positive().default(1),
                    text: z.string(),
                    effects: z.array(Effect).default([]),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type TravelEventDef = z.infer<typeof TravelEventDef>;

export const NoteDef = z
  .object({ id, title: z.string(), body: z.string(), effects: z.array(Effect).default([]) })
  .strict();
export type NoteDef = z.infer<typeof NoteDef>;

export const BroadcastDef = z
  .object({
    id,
    if: z.array(Condition).default([]),
    title: z.string(),
    text: z.string(),
    effects: z.array(Effect).default([]),
  })
  .strict();
export type BroadcastDef = z.infer<typeof BroadcastDef>;

export const HintDef = z.object({ id, title: z.string(), text: z.string() }).strict();
export type HintDef = z.infer<typeof HintDef>;

export const StationUpgradeDef = z
  .object({
    station: z.enum(['workbench', 'stove', 'reloading', 'rainCollector']),
    tier: z.number().int().min(1),
    cost: z.array(z.object({ itemId: id, qty: z.number().int().min(1) })),
    requiresFlag: z.string().optional(),
    description: z.string(),
  })
  .strict();
export type StationUpgradeDef = z.infer<typeof StationUpgradeDef>;

export const SkillDef = z
  .object({ id, name: z.string(), description: z.string(), ranks: z.array(z.string()).length(5) })
  .strict();

export const ContentFiles = {
  names: z.record(z.string(), z.string()),
  items: z.array(ItemDef),
  recipes: z.array(RecipeDef),
  lootTables: z.array(LootTableDef),
  containerTypes: z.array(ContainerTypeDef),
  enemies: z.array(EnemyDef),
  npcs: z.array(NpcDef),
  dialogues: z.array(DialogueDef),
  quests: z.array(QuestDef),
  traders: z.array(TraderDef),
  zones: z.array(ZoneDef),
  legend: z.record(z.string(), LegendEntry),
  worldNodes: z.array(WorldNodeDef),
  travelEvents: z.array(TravelEventDef),
  notes: z.array(NoteDef),
  broadcasts: z.array(BroadcastDef),
  hints: z.array(HintDef),
  stationUpgrades: z.array(StationUpgradeDef),
  skills: z.array(SkillDef),
};
export type SkillDefT = z.infer<typeof SkillDef>;
