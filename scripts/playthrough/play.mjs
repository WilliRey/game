// Play the prologue and Act 1 with real keyboard and mouse input, on the 3D view. Start a preview first
// (`npm run build && npm run preview`), then:
//   node scripts/playthrough/play.mjs <outDir> [query, e.g. '&quality=low'] [class] [stop after stage]
// It logs every stage, fight, trade and death to <outDir>/log.txt and saves screenshots along the way.
import { launch, sleep } from './bot.mjs';

const out = process.argv[2];
const query = process.argv[3] ?? '&quality=low';
const classId = process.argv[4] ?? 'mechanic';
const until = process.argv[5] ?? 'end';

const { browser, page, bot, log, problems } = await launch({ out, query });
const q = (s, id) => s.quests?.[id] ?? { stage: -1, status: 'none' };
const has = (s, id, n = 1) => (s.inv ?? []).filter(([i]) => i === id).reduce((a, [, k]) => a + k, 0) >= n;

async function newGame() {
  await page.click('[data-action="new-game"]');
  await sleep(300);
  await bot.shot('new-game-difficulty');
  await page.click('[data-action="next"]');
  await sleep(300);
  await page.click(`[data-class="${classId}"]`);
  await sleep(200);
  await bot.shot('new-game-class');
  await page.click('[data-action="start"]');
  await page.waitForSelector('[data-hud]', { timeout: 60000 });
  await bot.init();
  for (let i = 0; i < 10; i++) {
    const s = await bot.snap();
    if (!s.screens?.length) break;
    await bot.handleScreens(s);
  }
  await sleep(800);
  await bot.shot('start');
}

async function stage(name, fn) {
  const s = await bot.snap();
  log(
    `== ${name}  (zone ${s.zoneId}, hp ${Math.round(s.hp)}, prologue ${q(s, 'prologue').stage}/${q(s, 'prologue').status}, act1 ${q(s, 'act1').stage}/${q(s, 'act1').status})`,
  );
  const t0 = Date.now();
  for (let attempt = 0; attempt < 3; attempt++) {
    const d0 = bot.deaths;
    await fn();
    // A death can land just as the stage ends: give the death screen a moment to show.
    for (let k = 0; k < 8; k++) {
      const s2 = await bot.snap();
      if (s2.screens?.includes('death') || s2.dead) {
        if (s2.screens?.includes('death')) await bot.handleScreens(s2);
        else await sleep(300);
        continue;
      }
      if (k > 2) break;
      await sleep(200);
    }
    if (bot.deaths === d0) break;
    log(`== ${name}: died during the stage, retrying from the last save (attempt ${attempt + 2})`);
    await sleep(1500);
  }
  const e = await bot.snap();
  log(
    `== ${name} done in ${((Date.now() - t0) / 1000).toFixed(0)}s (hp ${Math.round(e.hp)}, deaths ${bot.deaths})`,
  );
  await bot.shot(name);
  if (until === name) {
    finish();
  }
}

async function finish() {
  const s = await bot.snap();
  log('STATS', JSON.stringify(bot.stats), 'deaths', bot.deaths);
  log('QUESTS', JSON.stringify(s.quests));
  log('INV', JSON.stringify(s.inv));
  log('PROBLEMS', problems.length ? problems.join('\n') : 'none');
  await browser.close();
  process.exit(0);
}

async function keepUp() {
  const s = await bot.snap();
  if (!s.screens?.length && !s.zombies?.some((z) => z.vis && z.d < 8)) await bot.upkeep(s);
}

process.on('unhandledRejection', async (e) => {
  log('ERROR', e?.stack ?? e);
  await bot.shot('error').catch(() => {});
  await finish();
});

try {
  await newGame();

  // ---------------------------------------------------------------- prologue
  await stage('p1-cupboards', async () => {
    await bot.loot('mc_sam_cabinet');
    await bot.loot('mc_sam_fridge');
  });

  await stage('p2-teodor', async () => {
    await bot.loot('mc_sam_meds');
    await bot.loot('mc_sam_toolbox');
    await bot.loot('mc_3b_cabinet');
    await bot.loot('mc_3b_fridge');
    const s = await bot.snap();
    for (const id of ['canned_beans', 'crackers'])
      if (has(s, id)) {
        await bot.useItem(id);
        break;
      }
  });

  await stage('p3-stairwell', async () => {
    // Down the hall and into the lobby; the walker in the stairwell comes to us.
    await bot.goto({ x: 15, y: 20, w: 12, h: 5 }, { label: 'lobby' });
    for (let k = 0; k < 30; k++) {
      const s = await bot.snap();
      if (q(s, 'prologue').stage >= 3 || !s.zombies.some((z) => z.d < 12)) break;
      const z = s.zombies[0];
      if (!(await bot.fight(s, { radius: 12 })))
        await bot.goto(
          { x: Math.floor(z.x), y: Math.floor(z.y), w: 1, h: 1 },
          { pad: 1, label: 'walker', maxMs: 4000 },
        );
    }
    await bot.goto({ x: 16, y: 26, w: 9, h: 3 }, { label: 'street' });
  });

  await stage('p4-depot', async () => {
    await keepUp();
    await bot.goto({ x: 40, y: 18, w: 12, h: 6 }, { label: 'depot' });
  });

  await stage('p5-nail-bat', async () => {
    await bot.loot('mc_depot_toolbox');
    await bot.use('mc_note_doodle');
    await sleep(400);
    for (let k = 0; k < 5; k++) {
      const s = await bot.snap();
      if (!s.screens?.length) break;
      await bot.handleScreens(s);
    }
    await bot.loot('mc_depot_locker');
    await keepUp();
    const t = await bot.use('mc_depot_bench', { expectScreen: 'workbench' });
    await sleep(400);
    const r = page.locator('[data-recipe="nail_bat"]');
    if (await r.count()) {
      await r.first().click();
      await sleep(200);
      await bot.shot('workbench');
      const c = page.locator('[data-action="craft"]');
      if (await c.isEnabled()) await c.click();
      else log('craft button disabled for nail_bat');
      await sleep(400);
    } else
      log(
        'no nail_bat recipe row; screens',
        JSON.stringify((await bot.snap()).screens),
        t ? '' : '(bench not used)',
      );
    await bot.tap('Escape');
    await sleep(300);
    // Equip it in the melee slot if the game didn't.
    if (has(await bot.snap(), 'nail_bat')) await bot.equip('nail_bat');
  });

  await stage('p6-to-firehouse', async () => {
    await keepUp();
    await bot.travel('firehouse9', 'walk');
  });

  // ---------------------------------------------------------------- act 1
  async function closeAll() {
    for (let k = 0; k < 6; k++) {
      const s = await bot.snap();
      if (!s.screens?.length) return;
      await bot.tap('Escape');
      await sleep(250);
    }
  }

  /** Barter with a trader: ask for `want`, pay with items from `sell` (in order) until the deal is fair. */
  async function trade(npc, want, sell) {
    await bot.talk(npc, [/generator/i, /let's trade|trade/i]);
    let s = await bot.snap();
    if (!s.screens?.includes('trade')) {
      log('trade: no trade screen with', npc, JSON.stringify(s.screens));
      await closeAll();
      return false;
    }
    await bot.shotOnce(`trade-${npc}`);
    for (const [id, n] of want) {
      for (let k = 0; k < n; k++) {
        const row = page.locator(`[data-trade-row="theirs:${id}"]`).first();
        if (!(await row.count())) {
          log('trade: they have no', id);
          break;
        }
        await row.click();
        await sleep(120);
      }
    }
    const deal = page.locator('[data-screen="trade"] [data-action="deal"]');
    for (const id of sell) {
      if (await deal.isEnabled()) break;
      s = await bot.snap();
      const have = (s.inv ?? []).filter(([i]) => i === id).reduce((a, [, q]) => a + q, 0);
      const keep = id === 'duct_tape' ? 2 : id === 'lockpick' ? 1 : 0;
      for (let k = 0; k < have - keep; k++) {
        if (await deal.isEnabled()) break;
        const row = page.locator(`[data-trade-row="mine:${id}"]`).first();
        if (!(await row.count())) break;
        await row.click();
        await sleep(100);
      }
    }
    const totals = await page.locator('.trade-totals').innerText();
    log('trade totals:', totals.replace(/\s+/g, ' '));
    await bot.shot(`trade-${npc}-offer`);
    if (await deal.isEnabled()) {
      await deal.click();
      await sleep(300);
      log('trade: deal done');
    } else log('trade: could not afford it');
    await closeAll();
    return true;
  }

  async function craftAt(stationKind, recipeId) {
    const w = await page.evaluate((k) => window.__bot.where(k), stationKind);
    if (!w) return log('craft: no', stationKind, 'here');
    await bot.use(stationKind, { expectScreen: 'workbench', verbRe: /use/i });
    await sleep(400);
    const r = page.locator(`[data-recipe="${recipeId}"]`).first();
    if (!(await r.count())) {
      log('craft: no row for', recipeId, JSON.stringify((await bot.snap()).screens));
      return closeAll();
    }
    await r.click();
    await sleep(200);
    const c = page.locator('[data-action="craft"]');
    if (await c.isEnabled()) {
      await c.click();
      log('crafted', recipeId);
    } else
      log(
        'craft: button disabled for',
        recipeId,
        (await page.locator('.craft-detail').innerText()).replace(/\s+/g, ' ').slice(0, 300),
      );
    await sleep(400);
    await closeAll();
  }

  const SELL = [
    'wrench',
    'painkillers',
    'bp_pipe_pistol',
    'lockpick',
    'glass_bottle',
    'dirty_water',
    'energy_bar',
    'soda',
    'scrap_metal',
    'nails',
    'cloth',
    'duct_tape',
    'crackers',
    'bandage',
    'toolbox',
    // Other classes' kits: spare ammo, a spare weapon, medicine.
    'ammo_9mm',
    'crowbar',
    'antibiotics',
    'first_aid_kit',
  ];

  await stage('a1-ruth', async () => {
    await bot.talk('fh_ruth', [
      /dead battery|drove one|keep it off|batteries and gas/i,
      /what do you need/i,
      /get it done/i,
    ]);
    await closeAll();
  });

  await stage('a2-supplies', async () => {
    await bot.loot('fh_tools');
    await bot.loot('fh_crate');
    const s = await bot.snap();
    const tubes = (s.inv ?? []).filter(([i]) => i === 'rubber_tube').reduce((a, [, q]) => a + q, 0);
    await trade(
      'fh_gus',
      [
        ['bolt_cutters', 1],
        ['rubber_tube', Math.max(0, 2 - tubes)],
      ],
      SELL,
    );
    await craftAt('workbench', 'siphon_hose');
  });

  await stage('a3-kessler', async () => {
    await keepUp();
    if (!(await bot.travel('kessler_auto', 'walk'))) throw new Error('could not travel to Kessler Auto');
    await bot.use('ka_chain', { hold: true });
    await bot.loot('ka_battery');
    await bot.loot('ka_toolbox');
    await bot.loot('ka_office_desk');
  });

  await stage('a4-route17', async () => {
    await keepUp();
    if (!(await bot.travel('route17', 'walk'))) throw new Error('could not travel to Route 17');
    for (const cap of ['r17_fuel_0', 'r17_fuel_2', 'r17_fuel_4']) {
      const s = await bot.snap();
      if (has(s, 'fuel_can', 2)) break;
      await bot.use(cap, { hold: true });
      const s2 = await bot.snap();
      if (!has(s2, 'fuel_can', 2) && cap === 'r17_fuel_0') await bot.use(cap, { hold: true });
    }
  });

  await stage('a5-repair', async () => {
    await keepUp();
    if (!(await bot.travel('firehouse9', 'walk'))) throw new Error('could not travel back to Firehouse 9');
    await bot.use('ambulance', { hold: true, pad: 1 });
    await sleep(500);
    await closeAll();
  });

  await stage('a6-drive', async () => {
    await keepUp();
    if (!(await bot.travel('st_agnes', 'drive'))) throw new Error('could not drive to St. Agnes');
  });

  await stage('a7-keycard', async () => {
    await bot.loot('sa_doctor');
    await bot.use('sa_basement_door');
    await bot.use('sa_stairs', { pad: 0 });
    for (let k = 0; k < 40; k++) {
      const s = await bot.snap();
      if (s.zoneId === 'st_agnes_basement') break;
      if (s.screens?.length) await bot.handleScreens(s);
      await sleep(200);
    }
  });

  await stage('a8-boss', async () => {
    for (let k = 0; k < 60; k++) {
      const s = await bot.snap();
      if (q(s, 'act1').stage >= 7 || s.dead) break;
      if (await bot.fight(s, { radius: 14 })) continue;
      // Go find it: the boss sits in the ward until something draws it out.
      const boss = s.zombies.find((z) => z.type === 'bloater_boss');
      const at = boss
        ? { x: Math.floor(boss.x) - 1, y: Math.floor(boss.y) - 1, w: 3, h: 3 }
        : { x: 27, y: 28, w: 5, h: 5 };
      await bot.goto(at, { pad: 2, label: 'boss', maxMs: 8000 });
      await sleep(200);
    }
  });

  await stage('a9-recorder', async () => {
    await bot.use('sb_recorder');
    await sleep(500);
    await closeAll();
  });

  await stage('a10-return', async () => {
    await bot.use('sb_stairs', { pad: 0 });
    for (let k = 0; k < 40 && (await bot.snap()).zoneId !== 'st_agnes'; k++) await sleep(200);
    await keepUp();
    // The drive here used most of the tank: take the can by the ambulance bay and siphon the wreck.
    await bot.use('sa_fuel_can');
    await bot.use('sa_fuel_ambulance', { hold: true });
    await bot.use('sa_fuel_ambulance', { hold: true });
    if (!(await bot.travel('firehouse9', 'drive'))) throw new Error('could not drive home');
    await bot.talk('fh_ruth', [/plan it/i]);
    await closeAll();
  });

  await finish();
} catch (e) {
  log('ERROR', e?.stack ?? e);
  await bot.shot('error').catch(() => {});
  await finish();
}
