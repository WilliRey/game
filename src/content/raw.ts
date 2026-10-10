/** Explicit imports of every data file so both Vite (browser) and tsx (Node validator) can load them. */
import names from './data/names.json';
import items from './data/items.json';
import recipes from './data/recipes.json';
import lootTables from './data/lootTables.json';
import containerTypes from './data/containerTypes.json';
import enemies from './data/enemies.json';
import npcs from './data/npcs.json';
import dialogues from './data/dialogues.json';
import quests from './data/quests.json';
import traders from './data/traders.json';
import legend from './data/legend.json';
import worldNodes from './data/worldNodes.json';
import travelEvents from './data/travelEvents.json';
import notes from './data/notes.json';
import broadcasts from './data/broadcasts.json';
import hints from './data/hints.json';
import stationUpgrades from './data/stationUpgrades.json';
import skills from './data/skills.json';
import classes from './data/classes.json';
import zoneMapleCourt from './data/zones/maple_court.json';
import zoneFirehouse from './data/zones/firehouse9.json';
import zoneKessler from './data/zones/kessler_auto.json';
import zoneOverpass from './data/zones/route17.json';
import zoneWestside from './data/zones/westside_mall.json';
import zoneStAgnes from './data/zones/st_agnes.json';
import zoneStAgnesBasement from './data/zones/st_agnes_basement.json';

export const RAW_CONTENT = {
  names,
  items,
  recipes,
  lootTables,
  containerTypes,
  enemies,
  npcs,
  dialogues,
  quests,
  traders,
  legend,
  worldNodes,
  travelEvents,
  notes,
  broadcasts,
  hints,
  stationUpgrades,
  skills,
  classes,
  zones: [
    zoneMapleCourt,
    zoneFirehouse,
    zoneKessler,
    zoneOverpass,
    zoneWestside,
    zoneStAgnes,
    zoneStAgnesBasement,
  ],
};
