/**
 * `npm run validate:content` — parses every data file with its zod schema, then runs the cross-reference
 * and completability checks in `src/content/validate.ts`. Exits non-zero on any error.
 */
import { ContentError, loadContent } from '../src/content';
import { validateContent } from '../src/content/validate';

function main(): number {
  let content;
  try {
    content = loadContent();
  } catch (e) {
    console.error(e instanceof ContentError ? e.message : e);
    return 1;
  }
  const { errors, warnings } = validateContent(content);
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const e of errors) console.error(`error: ${e}`);
  const c = content.lists;
  console.info(
    `content: ${c.items.length} items, ${c.recipes.length} recipes, ${c.enemies.length} enemies, ${c.npcs.length} npcs, ` +
      `${Object.keys(content.dialogues).length} dialogues, ${c.quests.length} quests, ${c.traders.length} traders, ` +
      `${c.zones.length} zones, ${c.worldNodes.length} world nodes, ${content.travelEvents.length} travel events, ` +
      `${c.notes.length} notes`,
  );
  if (errors.length) {
    console.error(`✗ ${errors.length} error(s)`);
    return 1;
  }
  console.info('✓ content valid');
  return 0;
}

process.exit(main());
