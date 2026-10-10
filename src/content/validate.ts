/**
 * Cross-reference validation on top of the zod schemas: every id reference resolves, every zone map is
 * well formed, and every quest can actually be completed (required items are obtainable from loot, a
 * trader, a recipe, a pickup or an effect; NPCs to talk to are placed somewhere; enemies to kill spawn).
 * Used by `npm run validate:content` and by the unit tests.
 */
import { BALANCE } from '@/config/balance';
import type { Content } from './index';
import type { ConditionT, EffectT, ZoneDef } from './schemas';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

const STATION_KINDS = new Set([
  'workbench',
  'stove',
  'reloading',
  'stash',
  'bed',
  'rainCollector',
  'campfire',
  'radio',
]);

/** Item matcher used by quest objectives: an item id, `cat:<category>` or `tag:<tag>`. */
export function matcherItems(content: Content, matcher: string): string[] {
  if (matcher.startsWith('cat:')) {
    const cat = matcher.slice(4);
    return content.lists.items.filter((i) => i.category === cat).map((i) => i.id);
  }
  if (matcher.startsWith('tag:')) {
    const tag = matcher.slice(4);
    return content.lists.items.filter((i) => i.tags.includes(tag)).map((i) => i.id);
  }
  return content.items[matcher] ? [matcher] : [];
}

/** All legend entries for a zone (defaults + zone overrides). */
export function zoneLegend(content: Content, zone: ZoneDef) {
  return { ...content.legend, ...zone.legend };
}

export function validateContent(content: Content): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (m: string) => errors.push(m);
  const has = <T>(rec: Record<string, T>, id: string | undefined) =>
    id !== undefined && Object.hasOwn(rec, id);

  const checkCond = (c: ConditionT, where: string): void => {
    switch (c.type) {
      case 'hasItem':
        if (matcherItems(content, c.itemId).length === 0)
          err(`${where}: condition hasItem matches no item '${c.itemId}'`);
        break;
      case 'quest':
        if (!has(content.quests, c.questId)) err(`${where}: condition quest unknown quest '${c.questId}'`);
        break;
      case 'skill':
        if (!has(content.skills, c.skill)) err(`${where}: condition skill unknown skill '${c.skill}'`);
        break;
      case 'recipeKnown':
        if (!has(content.recipes, c.recipeId))
          err(`${where}: condition recipeKnown unknown recipe '${c.recipeId}'`);
        break;
      case 'class':
        if (!has(content.classes, c.classId)) err(`${where}: condition class unknown class '${c.classId}'`);
        break;
      case 'not':
        checkCond(c.cond, where);
        break;
      case 'any':
        c.conds.forEach((cc) => checkCond(cc, where));
        break;
      default:
        break;
    }
  };
  const checkEffect = (e: EffectT, where: string): void => {
    const need = (ok: boolean, what: string) => {
      if (!ok) err(`${where}: effect ${e.type} references unknown ${what}`);
    };
    switch (e.type) {
      case 'giveItem':
        need(has(content.items, e.itemId), `item '${e.itemId}'`);
        break;
      case 'takeItem':
        need(matcherItems(content, e.itemId).length > 0, `item '${e.itemId}'`);
        break;
      case 'startQuest':
      case 'advanceQuest':
      case 'failQuest':
        need(has(content.quests, e.questId), `quest '${e.questId}'`);
        break;
      case 'completeQuest': {
        const q = content.quests[e.questId];
        need(!!q, `quest '${e.questId}'`);
        if (q && e.outcome !== 'default' && !Object.hasOwn(q.outcomes, e.outcome))
          err(`${where}: completeQuest outcome '${e.outcome}' not defined on quest '${e.questId}'`);
        break;
      }
      case 'openTrade':
      case 'unlockTrader':
        need(has(content.traders, e.traderId), `trader '${e.traderId}'`);
        break;
      case 'unlockRecipe':
        need(has(content.recipes, e.recipeId), `recipe '${e.recipeId}'`);
        break;
      case 'unlockNode':
        need(has(content.worldNodes, e.nodeId), `world node '${e.nodeId}'`);
        break;
      case 'hint':
        need(has(content.hints, e.hintId), `hint '${e.hintId}'`);
        break;
      case 'spawn':
        need(has(content.enemies, e.enemyType), `enemy '${e.enemyType}'`);
        break;
      case 'note':
        need(has(content.notes, e.noteId), `note '${e.noteId}'`);
        break;
      case 'broadcast':
        need(
          content.broadcasts.some((b) => b.id === e.broadcastId),
          `broadcast '${e.broadcastId}'`,
        );
        break;
      case 'dialogue':
        need(has(content.dialogues, e.dialogueId), `dialogue '${e.dialogueId}'`);
        break;
      case 'pan':
        if (e.objectId)
          need(
            content.lists.zones.some((z) => z.objects.some((o) => o.id === e.objectId)),
            `object '${e.objectId}'`,
          );
        else if (e.x === undefined || e.y === undefined) err(`${where}: pan needs an objectId or x and y`);
        break;
      default:
        break;
    }
  };
  const checkItem = (id: string, where: string) => {
    if (!has(content.items, id)) err(`${where}: unknown item '${id}'`);
  };

  // ---- items ----
  for (const it of content.lists.items) {
    const w = `item ${it.id}`;
    if (it.blueprint && !has(content.recipes, it.blueprint.recipeId))
      err(`${w}: blueprint recipe '${it.blueprint.recipeId}' missing`);
    if (it.note && !has(content.notes, it.note.noteId)) err(`${w}: note '${it.note.noteId}' missing`);
    it.dismantle?.forEach((d) => checkItem(d.itemId, `${w} dismantle`));
    it.repair?.forEach((d) => checkItem(d.itemId, `${w} repair`));
    if (it.weapon) {
      const k = it.weapon.kind;
      if (k === 'melee' && !it.weapon.melee) err(`${w}: melee weapon without melee stats`);
      if (k === 'firearm' && !it.weapon.firearm) err(`${w}: firearm without firearm stats`);
      if (k === 'throwable' && !it.weapon.throwable) err(`${w}: throwable without throwable stats`);
      if (k !== 'throwable' && it.stack !== 1) err(`${w}: weapons must not stack`);
      if (k !== 'throwable' && it.durability === undefined) err(`${w}: weapon needs a durability`);
    }
    if (it.mod && it.category !== 'mod') err(`${w}: has mod stats but category '${it.category}'`);
    if (it.armor && it.stack !== 1) err(`${w}: armor must not stack`);
  }

  // ---- recipes ----
  for (const r of content.lists.recipes) {
    const w = `recipe ${r.id}`;
    r.inputs.forEach((i) => checkItem(i.itemId, w));
    checkItem(r.output.itemId, `${w} output`);
    if (r.tool) checkItem(r.tool, `${w} tool`);
    if (r.class && !has(content.classes, r.class)) err(`${w}: class '${r.class}' unknown`);
    if (r.class && r.requiresBlueprint)
      err(`${w}: class gadgets are known from the start, not from blueprints`);
  }

  // ---- classes ----
  const skillIds = new Set(Object.keys(content.skills));
  for (const c of content.lists.classes) {
    const w = `class ${c.id}`;
    for (const k of c.kit) {
      checkItem(k.itemId, `${w} kit`);
      const def = content.items[k.itemId];
      if (def?.blueprint && !has(content.recipes, def.blueprint.recipeId))
        err(`${w} kit: blueprint recipe '${def.blueprint.recipeId}' missing`);
      if (k.mag !== undefined && def?.weapon?.kind !== 'firearm')
        err(`${w} kit: '${k.itemId}' has a mag but isn't a firearm`);
    }
    for (const sk of Object.keys(c.skills)) if (!skillIds.has(sk)) err(`${w}: unknown skill '${sk}'`);
    for (const r of c.recipes) {
      const rec = content.recipes[r];
      if (!rec) err(`${w}: recipe '${r}' missing`);
      else if (rec.class && rec.class !== c.id) err(`${w}: recipe '${r}' belongs to class '${rec.class}'`);
    }
    if (!content.lists.recipes.some((r) => r.class === c.id))
      err(`${w}: needs at least one class-only gadget recipe`);
    const ab = c.ability;
    if (ab.kind === 'decoy' || ab.kind === 'flashbang') {
      const t = ab.itemId ? content.items[ab.itemId]?.weapon?.throwable : undefined;
      const want = ab.kind === 'decoy' ? 'decoy' : 'flash';
      if (!t) err(`${w}: ability ${ab.kind} needs itemId of a throwable`);
      else if (t.effect !== want)
        err(`${w}: ability ${ab.kind} item '${ab.itemId}' has effect '${t.effect}', expected '${want}'`);
    }
    for (const key of Object.keys(c.names))
      if (!Object.hasOwn(content.names, key)) err(`${w}: name token '${key}' has no default in names.json`);
  }
  if (!has(content.classes, 'mechanic')) err('classes.json: the default class (mechanic) is missing');

  // ---- {tokens} in story text resolve ----
  const checkTokens = (t: string | undefined, where: string) => {
    for (const m of t?.matchAll(/\{(\w+)\}/g) ?? [])
      if (m[1] !== 'day' && !Object.hasOwn(content.names, m[1]!))
        err(`${where}: unknown name token {${m[1]}}`);
  };
  const tokenEffects = (effects: readonly EffectT[], where: string) => {
    for (const e of effects) {
      if (e.type === 'textCard') {
        checkTokens(e.title, where);
        checkTokens(e.body, where);
      } else if (e.type === 'toast') checkTokens(e.text, where);
    }
  };
  for (const d of Object.values(content.dialogues))
    for (const [nid, n] of Object.entries(d.nodes)) {
      checkTokens(n.text, `dialogue ${d.id}.${nid}`);
      checkTokens(n.speaker, `dialogue ${d.id}.${nid}`);
      tokenEffects(n.effects, `dialogue ${d.id}.${nid}`);
      n.choices.forEach((ch, i) => {
        checkTokens(ch.text, `dialogue ${d.id}.${nid} choice ${i}`);
        tokenEffects(ch.effects, `dialogue ${d.id}.${nid} choice ${i}`);
      });
    }
  for (const n of content.lists.notes) {
    checkTokens(n.title, `note ${n.id}`);
    checkTokens(n.body, `note ${n.id}`);
  }
  for (const b of content.broadcasts) checkTokens(b.text, `broadcast ${b.id}`);
  for (const q of content.lists.quests) {
    checkTokens(q.description, `quest ${q.id}`);
    tokenEffects(q.rewards, `quest ${q.id}`);
    for (const st of q.stages) {
      checkTokens(st.text, `quest ${q.id} stage ${st.id}`);
      tokenEffects(st.onEnter, `quest ${q.id} stage ${st.id}`);
    }
  }
  for (const z of content.lists.zones)
    for (const o of z.objects) tokenEffects(o.effects, `zone ${z.id} object ${o.id}`);

  // ---- loot ----
  for (const t of Object.values(content.lootTables))
    t.entries.forEach((e) => checkItem(e.itemId, `loot table ${t.id}`));
  for (const ct of Object.values(content.containerTypes))
    if (!has(content.lootTables, ct.lootTable))
      err(`container type ${ct.id}: loot table '${ct.lootTable}' missing`);
  for (const en of content.lists.enemies)
    if (en.corpseLoot && !has(content.lootTables, en.corpseLoot))
      err(`enemy ${en.id}: corpse loot '${en.corpseLoot}' missing`);

  // ---- npcs / dialogue ----
  for (const n of content.lists.npcs) {
    if (!has(content.dialogues, n.dialogue)) err(`npc ${n.id}: dialogue '${n.dialogue}' missing`);
    if (n.trader && !has(content.traders, n.trader)) err(`npc ${n.id}: trader '${n.trader}' missing`);
  }
  for (const d of Object.values(content.dialogues)) {
    const w = `dialogue ${d.id}`;
    for (const s of d.start) {
      if (!Object.hasOwn(d.nodes, s.node)) err(`${w}: start node '${s.node}' missing`);
      s.if.forEach((c) => checkCond(c, w));
    }
    for (const [nid, node] of Object.entries(d.nodes)) {
      const nw = `${w}.${nid}`;
      if (node.next && !Object.hasOwn(d.nodes, node.next)) err(`${nw}: next '${node.next}' missing`);
      node.effects.forEach((e) => checkEffect(e, nw));
      node.choices.forEach((ch, i) => {
        if (ch.next && !Object.hasOwn(d.nodes, ch.next)) err(`${nw} choice ${i}: next '${ch.next}' missing`);
        ch.if.forEach((c) => checkCond(c, `${nw} choice ${i}`));
        ch.effects.forEach((e) => checkEffect(e, `${nw} choice ${i}`));
      });
    }
  }

  // ---- traders ----
  for (const t of content.lists.traders) {
    if (!has(content.npcs, t.npcId)) err(`trader ${t.id}: npc '${t.npcId}' missing`);
    t.stock.forEach((s) => checkItem(s.itemId, `trader ${t.id} stock`));
  }

  // ---- zones ----
  const objectIds = new Map<string, string>(); // object id -> zone id
  const zoneEntries = new Map<string, Set<string>>();
  for (const z of content.lists.zones) {
    const w = `zone ${z.id}`;
    const legend = zoneLegend(content, z);
    const width = z.map[0]?.length ?? 0;
    let starts = 0;
    let exits = 0;
    z.map.forEach((row, y) => {
      if (row.length !== width) err(`${w}: row ${y} has width ${row.length}, expected ${width}`);
      for (const ch of row) {
        const le = legend[ch];
        if (!le) {
          err(`${w}: row ${y} uses '${ch}' which is not in the legend`);
          continue;
        }
        if (le.start) starts++;
        if (le.exit) exits++;
        if (le.container && !has(content.containerTypes, le.container))
          err(`${w}: legend '${ch}' container '${le.container}' unknown`);
        if (le.station && !STATION_KINDS.has(le.station))
          err(`${w}: legend '${ch}' station '${le.station}' unknown`);
      }
    });
    const entries = new Set<string>();
    for (const o of z.objects) {
      const ow = `${w} object ${o.id}`;
      if (objectIds.has(o.id)) err(`${ow}: duplicate object id (also in ${objectIds.get(o.id)})`);
      objectIds.set(o.id, z.id);
      if (o.x < 0 || o.y < 0 || o.x + o.w > width || o.y + o.h > z.map.length) err(`${ow}: out of bounds`);
      if (o.type === 'start') {
        starts++;
        entries.add(o.id);
      }
      if (o.type === 'npc' && !has(content.npcs, o.npcId)) err(`${ow}: npc '${o.npcId}' unknown`);
      if (o.containerType && !has(content.containerTypes, o.containerType))
        err(`${ow}: container type '${o.containerType}' unknown`);
      if (o.lootTable && !has(content.lootTables, o.lootTable))
        err(`${ow}: loot table '${o.lootTable}' unknown`);
      o.items?.forEach((i) => checkItem(i.itemId, ow));
      if (o.itemId) checkItem(o.itemId, ow);
      if (o.enemyType && !has(content.enemies, o.enemyType)) err(`${ow}: enemy '${o.enemyType}' unknown`);
      if (o.station && !STATION_KINDS.has(o.station)) err(`${ow}: station '${o.station}' unknown`);
      if (o.dialogue && !has(content.dialogues, o.dialogue)) err(`${ow}: dialogue '${o.dialogue}' unknown`);
      if (o.nodeId && !has(content.worldNodes, o.nodeId)) err(`${ow}: world node '${o.nodeId}' unknown`);
      if (o.type === 'exit') exits++;
      if (o.type === 'pickup' && !o.itemId) err(`${ow}: pickup needs itemId`);
      if (o.type === 'npc' && !o.npcId) err(`${ow}: npc object needs npcId`);
      if (o.type === 'nest' && !o.enemyType) err(`${ow}: nest needs enemyType`);
      o.effects.forEach((e) => checkEffect(e, ow));
      o.if.forEach((c) => checkCond(c, ow));
    }
    zoneEntries.set(z.id, entries);
    if (starts === 0) err(`${w}: no start position ('P' or a start object)`);
    if (exits > 0 && !z.exitNode && !z.objects.some((o) => o.type === 'exit'))
      err(`${w}: has exit tiles but no exitNode`);
    if (z.exitNode && !has(content.worldNodes, z.exitNode)) err(`${w}: exitNode '${z.exitNode}' unknown`);
    for (const t of Object.keys(z.spawns.types))
      if (!has(content.enemies, t)) err(`${w}: spawn type '${t}' unknown`);
    z.onEnter.forEach((e) => checkEffect(e, `${w} onEnter`));
    z.onFirstEnter.forEach((e) => checkEffect(e, `${w} onFirstEnter`));
  }
  for (const z of content.lists.zones) {
    for (const o of z.objects) {
      if (o.toZone) {
        if (!has(content.zones, o.toZone)) err(`zone ${z.id} object ${o.id}: toZone '${o.toZone}' unknown`);
        else if (o.entry && !zoneEntries.get(o.toZone)?.has(o.entry))
          err(`zone ${z.id} object ${o.id}: entry '${o.entry}' is not a start object in '${o.toZone}'`);
      }
    }
  }

  // ---- world ----
  for (const n of content.lists.worldNodes) {
    if (!has(content.zones, n.zoneId)) err(`world node ${n.id}: zone '${n.zoneId}' unknown`);
    else if (n.entry && !zoneEntries.get(n.zoneId)?.has(n.entry))
      err(`world node ${n.id}: entry '${n.entry}' is not a start object in '${n.zoneId}'`);
  }
  if (!content.lists.worldNodes.some((n) => n.startKnown)) err('worldNodes.json: no node is startKnown');
  for (const ev of content.travelEvents) {
    const w = `travel event ${ev.id}`;
    ev.if.forEach((c) => checkCond(c, w));
    // The event screen can't be closed, so one choice must always be available.
    if (!ev.choices.some((ch) => ch.if.length === 0))
      err(`${w}: needs at least one choice without conditions`);
    ev.choices.forEach((ch, i) => {
      ch.if.forEach((c) => checkCond(c, `${w} choice ${i}`));
      ch.outcomes.forEach((o) => o.effects.forEach((e) => checkEffect(e, `${w} choice ${i}`)));
    });
  }
  for (const n of content.lists.notes) n.effects.forEach((e) => checkEffect(e, `note ${n.id}`));
  for (const b of content.broadcasts) {
    b.if.forEach((c) => checkCond(c, `broadcast ${b.id}`));
    b.effects.forEach((e) => checkEffect(e, `broadcast ${b.id}`));
  }
  for (const u of content.stationUpgrades)
    u.cost.forEach((c) => checkItem(c.itemId, `upgrade ${u.station} ${u.tier}`));
  for (const name of Object.keys(content.names))
    if (!/^\w+$/.test(name)) err(`names.json: key '${name}' must be a word`);

  // ---- quests (must be completable whatever class Sam is) ----
  const perClass = content.lists.classes.map((c) => ({
    id: c.id,
    obtainable: obtainableItems(content, startingItems(content, c.id), c.id),
    recipes: obtainableRecipes(content, c.id),
  }));
  const placedNpcs = new Set(
    content.lists.zones.flatMap((z) => z.objects.filter((o) => o.type === 'npc').map((o) => o.npcId!)),
  );
  const spawnable = spawnableEnemies(content);
  const reachableZones = new Set([
    ...content.lists.worldNodes.filter((n) => !n.lockedText).map((n) => n.zoneId),
    ...content.lists.zones.flatMap((z) => z.objects.filter((o) => o.toZone).map((o) => o.toZone!)),
  ]);
  for (const q of content.lists.quests) {
    const w = `quest ${q.id}`;
    if (q.giver && !has(content.npcs, q.giver)) err(`${w}: giver '${q.giver}' unknown`);
    q.rewards.forEach((e) => checkEffect(e, `${w} rewards`));
    for (const [oid, o] of Object.entries(q.outcomes))
      o.rewards.forEach((e) => checkEffect(e, `${w} outcome ${oid}`));
    q.stages.forEach((st, si) => {
      const sw = `${w} stage ${si} (${st.id})`;
      st.onEnter.forEach((e) => checkEffect(e, sw));
      st.onComplete.forEach((e) => checkEffect(e, sw));
      for (const ob of st.objectives) {
        const ow = `${sw} objective ${ob.id}`;
        switch (ob.type) {
          case 'talk':
            if (!has(content.npcs, ob.target)) err(`${ow}: npc '${ob.target}' unknown`);
            else if (!placedNpcs.has(ob.target)) err(`${ow}: npc '${ob.target}' is not placed in any zone`);
            break;
          case 'collect':
          case 'deliver':
          case 'use': {
            const ids = matcherItems(content, ob.target);
            if (ids.length === 0) err(`${ow}: item matcher '${ob.target}' matches nothing`);
            else
              for (const pc of perClass)
                if (!ids.some((id) => pc.obtainable.has(id)))
                  err(`${ow}: no item matching '${ob.target}' is obtainable as a ${pc.id}`);
            if (ob.type === 'deliver' && ob.npcId && !placedNpcs.has(ob.npcId))
              err(`${ow}: deliver npc '${ob.npcId}' not placed`);
            if (ob.type === 'deliver' && !ob.npcId) err(`${ow}: deliver objective needs npcId`);
            break;
          }
          case 'kill':
            if (ob.target !== 'any' && !has(content.enemies, ob.target))
              err(`${ow}: enemy '${ob.target}' unknown`);
            else if (ob.target !== 'any' && !spawnable.has(ob.target))
              err(`${ow}: enemy '${ob.target}' never spawns`);
            break;
          case 'reach': {
            const [zid, area] = ob.target.split(':');
            if (!zid || !has(content.zones, zid)) err(`${ow}: zone '${zid}' unknown`);
            else if (!reachableZones.has(zid)) err(`${ow}: zone '${zid}' is unreachable`);
            if (area && objectIds.get(area) !== zid)
              err(`${ow}: area '${area}' is not an object in zone '${zid}'`);
            break;
          }
          case 'interact':
            if (!objectIds.has(ob.target) && !/^c_\d+_\d+$/.test(ob.target))
              err(`${ow}: object '${ob.target}' not found in any zone`);
            break;
          case 'craft': {
            const ids = matcherItems(content, ob.target);
            for (const pc of perClass) {
              const craftable = content.lists.recipes.some(
                (r) => ids.includes(r.output.itemId) && pc.recipes.has(r.id),
              );
              if (!craftable)
                err(
                  `${ow}: nothing matching '${ob.target}' is craftable from obtainable recipes as a ${pc.id}`,
                );
            }
            break;
          }
          case 'flag':
            break;
        }
      }
    });
  }

  const anyClass = new Set(perClass.flatMap((pc) => [...pc.recipes]));
  for (const r of content.lists.recipes)
    if (!anyClass.has(r.id)) warnings.push(`recipe ${r.id}: requires a blueprint that nothing grants`);
  return { errors, warnings };
}

/** Enemy types that can appear: zone spawn tables, nests, spawn objects and spawn effects. */
export function spawnableEnemies(content: Content): Set<string> {
  const out = new Set<string>();
  for (const z of content.lists.zones) {
    for (const [t, w] of Object.entries(z.spawns.types)) if (w > 0) out.add(t);
    for (const o of z.objects) if (o.enemyType) out.add(o.enemyType);
    const hasSpawnTiles = z.map.some((row) => [...row].some((ch) => zoneLegend(content, z)[ch]?.spawn));
    if (hasSpawnTiles && Object.keys(z.spawns.types).length === 0 && !z.safe)
      for (const e of content.lists.enemies) if (e.dayWeight > 0 || e.nightWeight > 0) out.add(e.id);
  }
  return out;
}

function allEffects(content: Content): EffectT[] {
  const out: EffectT[] = [];
  for (const d of Object.values(content.dialogues))
    for (const n of Object.values(d.nodes)) {
      out.push(...n.effects);
      for (const c of n.choices) out.push(...c.effects);
    }
  for (const q of content.lists.quests) {
    out.push(...q.rewards);
    for (const o of Object.values(q.outcomes)) out.push(...o.rewards);
    for (const s of q.stages) out.push(...s.onEnter, ...s.onComplete);
  }
  for (const ev of content.travelEvents)
    for (const c of ev.choices) for (const o of c.outcomes) out.push(...o.effects);
  for (const z of content.lists.zones) {
    out.push(...z.onEnter, ...z.onFirstEnter);
    for (const o of z.objects) out.push(...o.effects);
  }
  for (const n of content.lists.notes) out.push(...n.effects);
  for (const b of content.broadcasts) out.push(...b.effects);
  return out;
}

/**
 * Recipes the player can come to know as a given class: no blueprint needed, or some blueprint item /
 * effect grants it, or the class starts with it. Other classes' gadgets are never known.
 */
export function obtainableRecipes(content: Content, classId = 'mechanic'): Set<string> {
  const out = new Set<string>();
  const granted = new Set(
    allEffects(content).flatMap((e) => (e.type === 'unlockRecipe' ? [e.recipeId] : [])),
  );
  const cls = content.classes[classId];
  for (const r of cls?.recipes ?? []) granted.add(r);
  const bpItems = new Set(content.lists.items.flatMap((i) => (i.blueprint ? [i.blueprint.recipeId] : [])));
  for (const r of content.lists.recipes) {
    if (r.class && r.class !== classId) continue;
    if (!r.requiresBlueprint || granted.has(r.id) || bpItems.has(r.id)) out.add(r.id);
  }
  return out;
}

/** The common starting kit plus a class's own kit. */
export function startingItems(content: Content, classId = 'mechanic'): string[] {
  return [...STARTING_ITEM_IDS, ...(content.classes[classId]?.kit.map((k) => k.itemId) ?? [])];
}

/**
 * Items the player can get: loot tables used by some placed container, trader stock, pickups and fixed
 * container contents, giveItem effects, the starting kit, and recipe outputs whose inputs are obtainable
 * (iterated to a fixpoint). Blueprint items for unknown recipes still count as obtainable items.
 */
export function obtainableItems(
  content: Content,
  start: string[] = STARTING_ITEM_IDS,
  classId = 'mechanic',
): Set<string> {
  const have = new Set<string>(start);
  const usedTables = new Set<string>();
  for (const z of content.lists.zones) {
    const legend = zoneLegend(content, z);
    for (const row of z.map)
      for (const ch of row) {
        const ct = legend[ch]?.container;
        const def = ct ? content.containerTypes[ct] : undefined;
        if (def) usedTables.add(def.lootTable);
      }
    for (const o of z.objects) {
      if (o.lootTable) usedTables.add(o.lootTable);
      const ct = o.containerType ? content.containerTypes[o.containerType] : undefined;
      if (ct && !o.items) usedTables.add(ct.lootTable);
      o.items?.forEach((i) => have.add(i.itemId));
      if (o.itemId) have.add(o.itemId);
      if (o.type === 'siphon') have.add('fuel_can');
    }
  }
  for (const e of content.lists.enemies) if (e.corpseLoot) usedTables.add(e.corpseLoot);
  for (const t of usedTables) content.lootTables[t]?.entries.forEach((e) => have.add(e.itemId));
  for (const t of content.lists.traders) t.stock.forEach((s) => have.add(s.itemId));
  for (const e of allEffects(content)) if (e.type === 'giveItem') have.add(e.itemId);
  const recipes = obtainableRecipes(content, classId);
  for (const it of content.lists.items)
    if (it.blueprint && have.has(it.id)) {
      const r = content.recipes[it.blueprint.recipeId];
      if (r && (!r.class || r.class === classId)) recipes.add(r.id);
    }
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of content.lists.recipes) {
      if (!recipes.has(r.id) || have.has(r.output.itemId)) continue;
      if (r.inputs.every((i) => have.has(i.itemId)) && (!r.tool || have.has(r.tool))) {
        have.add(r.output.itemId);
        changed = true;
      }
    }
    // dismantling yields components
    for (const id of [...have]) {
      for (const d of content.items[id]?.dismantle ?? []) {
        if (have.has(d.itemId)) continue;
        have.add(d.itemId);
        changed = true;
      }
    }
  }
  return have;
}

const STARTING_ITEM_IDS = BALANCE.start.items.map((i) => i.itemId);
