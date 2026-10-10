import type { z } from 'zod';
import {
  ContentFiles,
  type BroadcastDef,
  type ClassDef,
  type ContainerTypeDef,
  type DialogueDef,
  type EnemyDef,
  type HintDef,
  type ItemDef,
  type LegendEntryT,
  type LootTableDef,
  type NoteDef,
  type NpcDef,
  type QuestDef,
  type RecipeDef,
  type SkillDefT,
  type StationUpgradeDef,
  type TraderDef,
  type TravelEventDef,
  type WorldNodeDef,
  type ZoneDef,
} from './schemas';
import { RAW_CONTENT } from './raw';

export interface Content {
  names: Record<string, string>;
  items: Record<string, ItemDef>;
  recipes: Record<string, RecipeDef>;
  lootTables: Record<string, LootTableDef>;
  containerTypes: Record<string, ContainerTypeDef>;
  enemies: Record<string, EnemyDef>;
  npcs: Record<string, NpcDef>;
  dialogues: Record<string, DialogueDef>;
  quests: Record<string, QuestDef>;
  traders: Record<string, TraderDef>;
  zones: Record<string, ZoneDef>;
  legend: Record<string, LegendEntryT>;
  worldNodes: Record<string, WorldNodeDef>;
  travelEvents: TravelEventDef[];
  notes: Record<string, NoteDef>;
  broadcasts: BroadcastDef[];
  hints: Record<string, HintDef>;
  stationUpgrades: StationUpgradeDef[];
  skills: Record<string, SkillDefT>;
  /** Sam's backgrounds (BRIEF_V2 §4). */
  classes: Record<string, ClassDef>;
  /** Ordered lists kept for deterministic iteration. */
  lists: {
    items: ItemDef[];
    recipes: RecipeDef[];
    quests: QuestDef[];
    zones: ZoneDef[];
    worldNodes: WorldNodeDef[];
    enemies: EnemyDef[];
    traders: TraderDef[];
    npcs: NpcDef[];
    notes: NoteDef[];
    hints: HintDef[];
    skills: SkillDefT[];
    classes: ClassDef[];
  };
}

export class ContentError extends Error {}

function byId<T extends { id: string }>(list: T[], what: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const e of list) {
    if (out[e.id]) throw new ContentError(`Duplicate ${what} id: ${e.id}`);
    out[e.id] = e;
  }
  return out;
}

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown, file: string): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issues = r.error.issues
      .slice(0, 12)
      .map((i) => `  ${file}${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`)
      .join('\n');
    throw new ContentError(`Content validation failed in ${file}:\n${issues}`);
  }
  return r.data;
}

/** Validate every data file against its schema and build the typed registry. Throws ContentError. */
export function loadContent(raw: typeof RAW_CONTENT = RAW_CONTENT): Content {
  const names = parse(ContentFiles.names, raw.names, 'names.json');
  const items = parse(ContentFiles.items, raw.items, 'items.json');
  const recipes = parse(ContentFiles.recipes, raw.recipes, 'recipes.json');
  const lootTables = parse(ContentFiles.lootTables, raw.lootTables, 'lootTables.json');
  const containerTypes = parse(ContentFiles.containerTypes, raw.containerTypes, 'containerTypes.json');
  const enemies = parse(ContentFiles.enemies, raw.enemies, 'enemies.json');
  const npcs = parse(ContentFiles.npcs, raw.npcs, 'npcs.json');
  const dialogues = parse(ContentFiles.dialogues, raw.dialogues, 'dialogues.json');
  const quests = parse(ContentFiles.quests, raw.quests, 'quests.json');
  const traders = parse(ContentFiles.traders, raw.traders, 'traders.json');
  const zones = raw.zones.map((zn, i) => parse(ContentFiles.zones.element, zn, `zones[${i}]`));
  const legend = parse(ContentFiles.legend, raw.legend, 'legend.json');
  const worldNodes = parse(ContentFiles.worldNodes, raw.worldNodes, 'worldNodes.json');
  const travelEvents = parse(ContentFiles.travelEvents, raw.travelEvents, 'travelEvents.json');
  const notes = parse(ContentFiles.notes, raw.notes, 'notes.json');
  const broadcasts = parse(ContentFiles.broadcasts, raw.broadcasts, 'broadcasts.json');
  const hints = parse(ContentFiles.hints, raw.hints, 'hints.json');
  const stationUpgrades = parse(ContentFiles.stationUpgrades, raw.stationUpgrades, 'stationUpgrades.json');
  const skills = parse(ContentFiles.skills, raw.skills, 'skills.json');
  const classes = parse(ContentFiles.classes, raw.classes, 'classes.json');

  // Names from names.json fill in display names for npcs/zones/nodes when not set inline.
  for (const n of npcs) n.name ??= names[n.id] ?? n.id;
  for (const zn of zones) zn.name ??= names[zn.id] ?? zn.id;
  for (const w of worldNodes) w.name ??= names[w.id] ?? names[w.zoneId] ?? w.id;

  return {
    names,
    items: byId(items, 'item'),
    recipes: byId(recipes, 'recipe'),
    lootTables: byId(lootTables, 'loot table'),
    containerTypes: byId(containerTypes, 'container type'),
    enemies: byId(enemies, 'enemy'),
    npcs: byId(npcs, 'npc'),
    dialogues: byId(dialogues, 'dialogue'),
    quests: byId(quests, 'quest'),
    traders: byId(traders, 'trader'),
    zones: byId(zones, 'zone'),
    legend,
    worldNodes: byId(worldNodes, 'world node'),
    travelEvents,
    notes: byId(notes, 'note'),
    broadcasts,
    hints: byId(hints, 'hint'),
    stationUpgrades,
    skills: byId(skills, 'skill'),
    classes: byId(classes, 'class'),
    lists: {
      items,
      recipes,
      quests,
      zones,
      worldNodes,
      enemies,
      traders,
      npcs,
      notes,
      hints,
      skills,
      classes,
    },
  };
}

/** Replace `{key}` tokens with names.json entries (so renaming a character is one edit). */
export function fillNames(text: string, names: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => names[k] ?? m);
}
