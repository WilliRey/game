// A keyboard-and-mouse player for HOLDOUT: it reads the game state the way a player reads the screen (where
// am I, where are the zombies, what does the prompt say), plans paths on the tile grid, and acts only through
// real input events: WASD, mouse moves and clicks, E/Space/Tab/Q and clicks on UI buttons. No debug
// commands. Used to play the prologue and Act 1 on the 3D view (see play.mjs).
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.HOLDOUT_URL ?? 'http://localhost:4173/game/';

export async function launch({ out, query = '&quality=low', headless = true }) {
  fs.mkdirSync(out, { recursive: true });
  const T0 = Date.now();
  const log = (...a) => {
    const line = `[${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}s] ${a.join(' ')}`;
    console.info(line);
    fs.appendFileSync(`${out}/log.txt`, line + '\n');
  };
  const browser = await chromium.launch({
    headless,
    args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = `${m.type()}: ${m.text()}`;
      if (!problems.includes(t)) {
        problems.push(t);
        log('CONSOLE', t.slice(0, 300));
      }
    }
  });
  page.on('pageerror', (e) => {
    problems.push('pageerror: ' + e.message);
    log('PAGEERROR', e.message);
  });
  await page.goto(`${BASE}?${query.replace(/^&/, '')}`);
  await page.waitForSelector('[data-screen="mainMenu"]', { timeout: 60000 });
  const bot = new Bot(page, log, out);
  return { browser, page, bot, log, problems };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Installed in the page: state snapshots, projection and path planning.
function install() {
  const H = () => window.holdout;
  const view = () => H().game.current;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  window.__bot = {
    snap() {
      const h = H();
      const s = h.store.state;
      const screens = [...document.querySelectorAll('[data-screen]')].map((e) =>
        e.getAttribute('data-screen'),
      );
      const base = { phase: h.store.phase, screens, captured: h.store.inputCaptured };
      const z = s?.zone;
      if (!z || !s) return base;
      const v = view();
      const rt = v?.rt;
      const p = z.player;
      const vis = (x, y) => (rt ? rt.visible[Math.floor(y) * rt.w + Math.floor(x)] === 1 : false);
      return {
        ...base,
        view: h.game.view,
        zoneId: z.zoneId,
        x: p.x,
        y: p.y,
        facing: p.facing,
        hp: s.player.hp,
        maxHp: s.player.maxHp,
        stamina: s.player.stamina,
        hunger: s.player.hunger,
        thirst: s.player.thirst,
        dead: s.player.dead,
        bleeding: (s.player.effects ?? []).some((e) => e.id === 'bleeding'),
        effects: (s.player.effects ?? []).map((e) => e.id),
        action: p.action
          ? { kind: p.action.kind, verb: p.action.verb, t: p.action.t, d: p.action.duration }
          : null,
        target: v?.target
          ? {
              kind: v.target.kind,
              id: v.target.id,
              verb: v.target.verb,
              hold: v.target.hold,
              timed: !!v.target.timed,
              disabled: v.target.disabled ?? null,
              label: v.target.label,
            }
          : null,
        zombies: z.zombies
          .filter((q) => q.hp > 0)
          .map((q) => ({
            id: q.id,
            x: q.x,
            y: q.y,
            type: q.type,
            mode: q.mode,
            hp: q.hp,
            windup: q.windup,
            d: dist(q.x, q.y, p.x, p.y),
            vis: vis(q.x, q.y),
          }))
          .sort((a, b) => a.d - b.d),
        minutes: s.time.minutes,
        activeSlot: s.player.activeSlot,
        equipment: { ...s.player.equipment },
        quests: Object.fromEntries(
          Object.entries(s.quests).map(([k, q]) => [k, { stage: q.stage, status: q.status }]),
        ),
        inv: s.player.inventory.map((st) => [st.itemId, st.qty]),
        flags: { ...s.flags },
        safe: z.safe,
        vehicle: { owned: s.vehicle.owned, fuel: s.vehicle.fuel },
        ability: {
          kind: h.store.content.classes?.[s.player.classId]?.ability?.kind ?? null,
          ready: (s.player.abilityCooldown ?? 0) <= 0,
        },
      };
    },
    /** Where a world point is on screen (logical px), at aim height by default. */
    screen(x, y, hgt = 0.55) {
      const v = view();
      return v.rig.project(x, hgt, y);
    },
    /** Content lookup for a zone object / container / door / npc position. */
    where(id) {
      const s = H().store.state;
      const z = s.zone;
      const c = z.containers[id];
      if (c) return { kind: 'container', x: c.x, y: c.y, w: c.w, h: c.h };
      const d = z.doors[id];
      if (d) return { kind: 'door', x: d.x, y: d.y, w: 1, h: 1 };
      const n = z.npcs.find((q) => q.id === id || q.npcId === id);
      if (n) return { kind: 'npc', x: n.x - 0.5, y: n.y - 0.5, w: 1, h: 1, cx: n.x, cy: n.y };
      const it = z.items.find((q) => q.stack.itemId === id || q.uid === id);
      if (it) return { kind: 'item', x: it.x - 0.5, y: it.y - 0.5, w: 1, h: 1, cx: it.x, cy: it.y };
      const rt = view().rt;
      const st = rt.layout.stations.find((q) => q.id === id || q.kind === id);
      if (st) return { kind: 'station', x: st.x, y: st.y, w: st.w, h: st.h };
      const ex = rt.layout.exits.find((q) => q.id === id);
      if (ex) return { kind: 'exit', x: ex.x, y: ex.y, w: ex.w, h: ex.h };
      const o = rt.def.objects.find((q) => q.id === id);
      if (o) return { kind: o.type, x: o.x, y: o.y, w: o.w ?? 1, h: o.h ?? 1 };
      return null;
    },
    exits() {
      return view().rt.layout.exits.map((e) => ({
        id: e.id,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        toZone: e.toZone ?? null,
      }));
    },
    /**
     * A* over the tile grid from the player to any passable tile inside the goal rect grown by `pad`.
     * Closed unlocked doors count as passable (the bot opens them). Returns tile centres.
     */
    path(gx, gy, gw = 1, gh = 1, pad = 0) {
      const s = H().store.state;
      const z = s.zone;
      const rt = view().rt;
      const W = rt.w;
      const Hh = rt.h;
      const passable = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= Hh) return false;
        const i = y * W + x;
        const did = rt.doorAt.get(i);
        if (did) {
          const d = z.doors[did];
          return !!d && (d.broken || d.open || !d.locked);
        }
        return rt.solid[i] === 0;
      };
      const inGoal = (x, y) => x >= gx - pad && x < gx + gw + pad && y >= gy - pad && y < gy + gh + pad;
      const sx = Math.floor(z.player.x);
      const sy = Math.floor(z.player.y);
      const key = (x, y) => y * W + x;
      const gScore = new Map([[key(sx, sy), 0]]);
      const came = new Map();
      const cx = gx + gw / 2;
      const cy = gy + gh / 2;
      const hfn = (x, y) =>
        Math.max(0, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - (Math.max(gw, gh) / 2 + pad));
      const open = [[hfn(sx, sy), sx, sy]];
      const closed = new Set();
      let found = null;
      let iter = 0;
      while (open.length && iter++ < 60000) {
        let bi = 0;
        for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
        const [, x, y] = open.splice(bi, 1)[0];
        const k = key(x, y);
        if (closed.has(k)) continue;
        closed.add(k);
        if (inGoal(x, y) && passable(x, y)) {
          found = [x, y];
          break;
        }
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (!passable(nx, ny)) continue;
            if (dx && dy && (!passable(x + dx, y) || !passable(x, y + dy))) continue;
            // Prefer not to hug doors diagonally; small cost for door tiles so open space wins.
            const isDoor = rt.doorAt.has(key(nx, ny));
            const g = gScore.get(k) + (dx && dy ? 1.414 : 1) + (isDoor ? 0.6 : 0);
            const nk = key(nx, ny);
            if (g < (gScore.get(nk) ?? Infinity)) {
              gScore.set(nk, g);
              came.set(nk, k);
              open.push([g + hfn(nx, ny), nx, ny]);
            }
          }
      }
      if (!found) return null;
      const out = [];
      let k = key(found[0], found[1]);
      while (k !== undefined && k !== key(sx, sy)) {
        out.push([(k % W) + 0.5, Math.floor(k / W) + 0.5, rt.doorAt.get(k) ?? null]);
        k = came.get(k);
      }
      out.reverse();
      return out;
    },
    /** Door state by id. */
    door(id) {
      const d = H().store.state.zone.doors[id];
      return d ? { open: d.open, locked: d.locked, broken: d.broken } : null;
    },
    /** Is the straight segment clear for a walker of radius r (sampled)? */
    clear(x0, y0, x1, y1, r = 0.34) {
      const rt = view().rt;
      const z = H().store.state.zone;
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2);
      for (let i = 0; i <= n; i++) {
        const t = i / Math.max(1, n);
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        for (const [ox, oy] of [
          [0, 0],
          [r, 0],
          [-r, 0],
          [0, r],
          [0, -r],
          [r * 0.7, r * 0.7],
          [-r * 0.7, r * 0.7],
          [r * 0.7, -r * 0.7],
          [-r * 0.7, -r * 0.7],
        ]) {
          const tx = Math.floor(x + ox);
          const ty = Math.floor(y + oy);
          const i2 = ty * rt.w + tx;
          const did = rt.doorAt.get(i2);
          if (did) {
            const d = z.doors[did];
            if (d && !d.open && !d.broken) return false;
            continue;
          }
          if (rt.solid[i2]) return false;
        }
      }
      return true;
    },
  };
}

export class Bot {
  constructor(page, log, out) {
    this.page = page;
    this.log = log;
    this.out = out;
    this.keys = new Set();
    this.shots = 0;
    this.deaths = 0;
    this.lastSnap = null;
    this.dialoguePrefs = [];
    this.visitedChoices = new Map();
    this.fightEnabled = true;
    this.stats = { swings: 0, kills: 0, hpLost: 0, fights: 0, doors: 0 };
  }

  async init() {
    await this.page.evaluate(install);
  }

  snap() {
    return this.page.evaluate(() => window.__bot.snap()).then((s) => (this.lastSnap = s));
  }

  async shot(name) {
    const n = String(++this.shots).padStart(3, '0');
    await this.page.screenshot({ path: `${this.out}/${n}-${name}.png` });
    this.log('shot', `${n}-${name}.png`);
  }

  // ------------------------------------------------------------ raw input

  async hold(want) {
    for (const k of [...this.keys])
      if (!want.includes(k)) {
        await this.page.keyboard.up(k);
        this.keys.delete(k);
      }
    for (const k of want)
      if (!this.keys.has(k)) {
        await this.page.keyboard.down(k);
        this.keys.add(k);
      }
  }

  async release() {
    await this.hold([]);
  }

  /** Hold the WASD combination closest to the direction (dx, dy). */
  async steer(dx, dy, sprint = false) {
    if (Math.hypot(dx, dy) < 1e-3) return this.hold([]);
    const a = Math.atan2(dy, dx);
    const oct = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    const map = [
      ['KeyD'],
      ['KeyD', 'KeyS'],
      ['KeyS'],
      ['KeyA', 'KeyS'],
      ['KeyA'],
      ['KeyA', 'KeyW'],
      ['KeyW'],
      ['KeyD', 'KeyW'],
    ];
    const want = [...map[oct]];
    if (sprint) want.push('ShiftLeft');
    await this.hold(want);
  }

  async tap(code, ms = 60) {
    await this.page.keyboard.down(code);
    await sleep(ms);
    await this.page.keyboard.up(code);
  }

  async aimAt(x, y, hgt = 0.55) {
    const p = await this.page.evaluate(([x, y, h]) => window.__bot.screen(x, y, h), [x, y, hgt]);
    const sx = Math.max(4, Math.min(1276, p.x));
    const sy = Math.max(4, Math.min(716, p.y));
    await this.page.mouse.move(sx, sy);
    return { x: sx, y: sy };
  }

  async click() {
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
  }

  // ------------------------------------------------------------ UI screens

  /** Deal with whatever screen is open. Returns true if it did something. */
  async handleScreens(s, expect = []) {
    const sc = (s.screens ?? []).filter((x) => !expect.includes(x));
    if (!sc.length) return false;
    const top = sc[sc.length - 1];
    const page = this.page;
    if (top === 'textCard') {
      await this.shotOnce(
        `card-${s.zoneId ?? 'menu'}-${(await page.locator('[data-screen="textCard"]').innerText()).slice(0, 18).replace(/\W+/g, '_')}`,
      );
      await this.safeClick(page.locator('[data-screen="textCard"] [data-action="continue"]'));
      await sleep(250);
      return true;
    }
    if (top === 'dialogue') return this.dialogue();
    if (top === 'loot') {
      const btn = page.locator('[data-screen="loot"] [data-action="take-all"]');
      if (await btn.count()) {
        const title = await page
          .locator('[data-screen="loot"] h2')
          .first()
          .innerText()
          .catch(() => '?');
        const names = await page
          .locator('[data-screen="loot"] [data-loot-row]')
          .evaluateAll((els) => els.map((e) => e.getAttribute('data-loot-row')));
        if (names.length) {
          const enabled = await btn.isEnabled().catch(() => false);
          this.log(`loot "${title}" take-all (${enabled ? 'enabled' : 'DISABLED'}):`, names.join(', '));
          if (enabled) await this.safeClick(btn);
          // Wait for the rows to move before closing (the UI re-renders on the next frame).
          for (let k = 0; k < 20; k++) {
            if (!(await page.locator('[data-screen="loot"] [data-loot-row]').count())) break;
            await sleep(100);
          }
        }
      }
      await this.tap('Escape');
      for (let k = 0; k < 20; k++) {
        if (!(await page.locator('[data-screen="loot"]').count())) break;
        await sleep(100);
      }
      return true;
    }
    if (top === 'travelEvent') {
      const txt = await page.locator('[data-screen="travelEvent"]').innerText();
      await this.shotOnce('travel-event');
      const cont = page.locator('[data-action="continue-travel"]');
      if (await cont.count()) {
        this.log('travel event outcome:', txt.replace(/\s+/g, ' ').slice(0, 260));
        await this.safeClick(cont);
      } else {
        this.log('travel event:', txt.replace(/\s+/g, ' ').slice(0, 260));
        await this.safeClick(page.locator('[data-screen="travelEvent"] [data-choice]:not([disabled])'));
      }
      await sleep(300);
      return true;
    }
    if (top === 'death') {
      this.deaths++;
      this.log('DIED. loading last save');
      await this.shot('death');
      const b = page.locator('[data-screen="death"] [data-action="load-last"]');
      if (await b.count()) await this.safeClick(b);
      await sleep(1500);
      return true;
    }
    if (top === 'pause') {
      await this.tap('Escape');
      await sleep(200);
      return true;
    }
    if (top === 'mainMenu' || top === 'newGame') return false;
    this.log('closing unexpected screen', top);
    await this.tap('Escape');
    await sleep(250);
    return true;
  }

  /** Click if it's there and clickable within a few seconds; never hang on a screen that just closed. */
  async safeClick(locator, timeout = 4000) {
    try {
      await locator.first().click({ timeout });
      return true;
    } catch (e) {
      this.log(
        'click failed:',
        String(e.message ?? e)
          .split('\n')[0]
          .slice(0, 120),
      );
      return false;
    }
  }

  /** Equip an item from the inventory screen and check it took. */
  async equip(itemId) {
    const page = this.page;
    await this.release();
    let tries = 0;
    for (let k = 0; k < 12 && tries < 3; k++) {
      let s = await this.snap();
      if (s.screens?.length) {
        await this.tap('Escape');
        await sleep(400);
        continue;
      }
      tries++;
      await this.tap('Tab');
      try {
        await page.waitForSelector('[data-screen="inventory"]', { timeout: 3000 });
      } catch {
        continue;
      }
      await this.safeClick(page.locator(`[data-screen="inventory"] [data-item-row="${itemId}"]`));
      await sleep(150);
      await this.safeClick(page.locator('[data-screen="inventory"] [data-action="equip"]'));
      await sleep(200);
      await this.tap('Escape');
      await sleep(250);
      s = await this.snap();
      const ok = await page.evaluate((id) => {
        const st = window.holdout.store.state;
        return Object.values(st.player.equipment).some(
          (uid) => st.player.inventory.find((x) => x.uid === uid)?.itemId === id,
        );
      }, itemId);
      if (ok) {
        this.log('equipped', itemId);
        return true;
      }
    }
    this.log('equip failed:', itemId);
    return false;
  }

  async shotOnce(name) {
    this.seenShots ??= new Set();
    if (this.seenShots.has(name)) return;
    this.seenShots.add(name);
    await this.shot(name);
  }

  /** Pick a dialogue choice by the current preferences; avoid repeating ourselves. */
  async dialogue() {
    const page = this.page;
    const root = page.locator('[data-screen="dialogue"]');
    const line = (
      await root
        .locator('.dialogue-text, .npc-line, p')
        .first()
        .innerText()
        .catch(() => '')
    ).slice(0, 160);
    const choices = await root.locator('[data-choice]').evaluateAll((els) =>
      els.map((e) => ({
        i: e.getAttribute('data-choice'),
        text: e.innerText.trim(),
        disabled: e.hasAttribute('disabled') || e.classList.contains('disabled'),
      })),
    );
    const seenKey = line.slice(0, 60);
    const seen = this.visitedChoices.get(seenKey) ?? new Set();
    this.visitedChoices.set(seenKey, seen);
    const usable = choices.filter((c) => !c.disabled);
    let pick = null;
    for (const re of this.dialoguePrefs) {
      pick = usable.find((c) => re.test(c.text) && !seen.has(c.text));
      if (pick) break;
    }
    const leave = /bye|leave|nothing|see you|later|never ?mind|go\.?$|done|that's all|i'll go/i;
    pick ??= usable.find((c) => !seen.has(c.text) && !leave.test(c.text));
    pick ??= usable.find((c) => leave.test(c.text)) ?? usable[usable.length - 1];
    this.log(
      `dialogue: "${line.replace(/\s+/g, ' ').slice(0, 90)}" → [${pick?.text ?? 'none'}]  (of ${choices
        .map((c) => c.text)
        .join(' | ')
        .slice(0, 200)})`,
    );
    if (!pick) {
      await this.tap('Escape');
      return true;
    }
    seen.add(pick.text);
    await this.safeClick(root.locator(`[data-choice="${pick.i}"]`));
    await sleep(300);
    return true;
  }

  // ------------------------------------------------------------ fighting

  /** Fight anything that's coming for us. Returns true if there was a fight. */
  async fight(s, opts = {}) {
    if (!this.fightEnabled) return false;
    const threat = (z) =>
      z.vis &&
      (z.d < 2.4 ||
        (z.d < (opts.radius ?? 7) &&
          (z.mode === 'chase' || z.mode === 'attack' || z.mode === 'investigate')));
    if (!s.zombies?.some(threat)) return false;
    this.stats.fights++;
    await this.release();
    const hp0 = s.hp;
    if (s.activeSlot !== 'melee') {
      await this.tap('Digit3');
      await sleep(120);
    }
    // Weapon reach (centre to centre) for the equipped melee weapon.
    const weaponRange = await this.page.evaluate(() => {
      const st = window.holdout.store.state;
      const uid = st.player.equipment.melee;
      const it = st.player.inventory.find((x) => x.uid === uid);
      const def = it ? window.holdout.store.content.items[it.itemId] : null;
      return def?.weapon?.range ?? 1.0;
    });
    const t0 = Date.now();
    let lastSwing = 0;
    let lastShove = 0;
    const killed0 = s.zombies.length;
    let cur = s;
    while (Date.now() - t0 < (opts.maxMs ?? 90000)) {
      cur = await this.snap();
      if (cur.dead || cur.screens?.includes('death')) break;
      if (cur.screens?.length) {
        await this.release();
        await this.handleScreens(cur);
        continue;
      }
      const th = cur.zombies.filter(threat);
      if (!th.length) break;
      // Hit whoever is winding up first; otherwise the nearest.
      const z = th.find((q) => q.windup > 0 && q.d < 2.4) ?? th[0];
      const r = z.type === 'bloater_boss' ? 0.75 : z.type === 'bloater' ? 0.55 : 0.38;
      const reach = weaponRange + r;
      await this.aimAt(z.x, z.y);
      const close = th.filter((q) => q.d < 1.6 + r);
      const now = Date.now();
      const heavy = z.type === 'bloater_boss' || z.type === 'bloater';
      let mx = 0;
      let my = 0;
      // Class abilities when it gets hairy: a decoy thrown past the crowd, a flashbang into it, adrenaline
      // when hurt.
      const crowd = th.filter((q) => q.d < 6);
      if (cur.ability?.ready && !cur.safe) {
        const k = cur.ability.kind;
        if ((k === 'decoy' && crowd.length >= 3) || (k === 'flashbang' && crowd.length >= 3)) {
          const cx = crowd.reduce((a, q) => a + q.x, 0) / crowd.length;
          const cy = crowd.reduce((a, q) => a + q.y, 0) / crowd.length;
          const dd = Math.hypot(cx - cur.x, cy - cur.y) || 1;
          const far = k === 'decoy' ? 5 : 0;
          await this.aimAt(cx + ((cx - cur.x) / dd) * far, cy + ((cy - cur.y) / dd) * far);
          await sleep(60);
          await this.tap('KeyQ');
          this.log(`ability ${k} with ${crowd.length} zombies around`);
          continue;
        }
        if (k === 'adrenaline' && cur.hp < cur.maxHp * 0.5) {
          await this.tap('KeyQ');
          this.log('ability adrenaline at hp', Math.round(cur.hp));
          continue;
        }
      }
      if (close.length >= 2 && now - lastShove > 1100 && cur.stamina > 20) {
        await this.release();
        await this.tap('Space');
        lastShove = now;
        continue;
      }
      const backOff = (from) => {
        let ax = 0;
        let ay = 0;
        for (const q of from) {
          ax -= (q.x - cur.x) / (q.d || 1);
          ay -= (q.y - cur.y) / (q.d || 1);
        }
        const al = Math.hypot(ax, ay) || 1;
        return [ax / al, ay / al];
      };
      if (heavy && z.windup > 0 && z.d < reach + 0.6) {
        // Big ones shrug off hits: step out of the red fan instead of trading.
        [mx, my] = backOff([z]);
      } else if (z.type === 'bloater' && z.hp < 25 && z.d < 2.4) {
        // Don't pop a bloater in your own face.
        [mx, my] = backOff([z]);
      } else if (z.d < reach - 0.5 || close.length >= 2 || now - lastSwing < 260) {
        // Too close, flanked, or still recovering from a swing: back off so they line up in front.
        [mx, my] = backOff(close.length ? close : [z]);
      } else if (z.d > reach - 0.1 && (z.mode !== 'chase' && z.mode !== 'attack' ? z.d < 6 : z.d < 2.6)) {
        mx = (z.x - cur.x) / z.d;
        my = (z.y - cur.y) / z.d;
      } else if (cur.hp < cur.maxHp * 0.25 && z.d < 3) {
        [mx, my] = backOff(th.filter((q) => q.d < 4));
      }
      if (mx || my) await this.steer(mx, my, cur.hp < cur.maxHp * 0.25);
      else await this.release();
      if (z.d < reach + 0.1 && now - lastSwing > 420) {
        await this.click();
        this.stats.swings++;
        lastSwing = Date.now();
      }
      await sleep(30);
    }
    await this.release();
    const lost = Math.max(0, hp0 - (cur.hp ?? hp0));
    this.stats.hpLost += lost;
    const k = Math.max(0, killed0 - (cur.zombies?.length ?? killed0));
    this.stats.kills += k;
    this.log(
      `fight over: hp ${Math.round(hp0)} → ${Math.round(cur.hp ?? 0)}, ${k} down, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
    return true;
  }

  // ------------------------------------------------------------ upkeep

  /** Eat, drink, bandage when it makes sense and nothing is around. */
  async upkeep(s) {
    if (s.captured || !s.inv) return false;
    const has = (id) => s.inv.find(([i]) => i === id);
    const want = [];
    if (s.bleeding && has('bandage')) want.push('bandage');
    else if (s.hp < s.maxHp * 0.45) {
      for (const id of ['first_aid_kit', 'bandage', 'painkillers'])
        if (has(id)) {
          want.push(id);
          break;
        }
    }
    if (s.hunger < 30)
      for (const id of ['canned_beans', 'crackers', 'energy_bar', 'rice', 'mre', 'canned_soup'])
        if (has(id)) {
          want.push(id);
          break;
        }
    if (s.thirst < 30)
      for (const id of ['water_bottle', 'soda', 'boiled_water'])
        if (has(id)) {
          want.push(id);
          break;
        }
    if (!want.length) return false;
    for (const id of want) await this.useItem(id);
    return true;
  }

  async useItem(id) {
    const page = this.page;
    await this.release();
    await this.tap('Tab');
    await sleep(350);
    const row = page.locator(`[data-screen="inventory"] [data-item-row="${id}"]`).first();
    if (!(await row.count())) {
      this.log('useItem: no row for', id);
      await this.tap('Escape');
      return false;
    }
    await row.click();
    await sleep(150);
    const use = page.locator('[data-screen="inventory"] [data-action="use"]');
    if (await use.count()) {
      await use.first().click();
      this.log('used', id);
    } else this.log('useItem: no use button for', id);
    await sleep(250);
    if ((await this.snap()).screens?.includes('inventory')) await this.tap('Escape');
    await sleep(200);
    return true;
  }

  // ------------------------------------------------------------ moving

  /**
   * Walk to a rect (tiles). Fights on the way, opens doors, re-plans when stuck.
   * `pad` grows the goal (1 = stand next to it).
   */
  async goto(rect, { pad = 0, sprint = false, label = '', maxMs = 240000, fight = true } = {}) {
    const t0 = Date.now();
    let plan = null;
    let i = 0;
    let lastMove = { t: Date.now(), x: 0, y: 0 };
    let replans = 0;
    while (Date.now() - t0 < maxMs) {
      const s = await this.snap();
      if (!s.zoneId) return false;
      if (s.screens?.length) {
        await this.release();
        await this.handleScreens(s);
        plan = null;
        continue;
      }
      if (s.dead) return false;
      if (fight && (await this.fight(s))) {
        plan = null;
        continue;
      }
      if (!plan) {
        plan = await this.page.evaluate(
          ([r, pad]) => window.__bot.path(r.x, r.y, r.w ?? 1, r.h ?? 1, pad),
          [rect, pad],
        );
        i = 0;
        if (!plan) {
          this.log(
            `goto ${label}: no path from ${s.x.toFixed(1)},${s.y.toFixed(1)} to`,
            JSON.stringify(rect),
          );
          await this.release();
          return false;
        }
        if (!plan.length) {
          await this.release();
          return true;
        }
      }
      // Smooth: skip ahead to the farthest waypoint in straight line of sight (no doors in between).
      let j = i;
      while (j + 1 < plan.length && j - i < 6 && !plan[j + 1][2]) {
        const ok = await this.page.evaluate(
          ([a, b, c, d]) => window.__bot.clear(a, b, c, d),
          [s.x, s.y, plan[j + 1][0], plan[j + 1][1]],
        );
        if (!ok) break;
        j++;
      }
      i = Math.max(i, j);
      const [wx, wy, door] = plan[i];
      // A closed door on the path: stop in front of it and open it.
      const nextDoor = plan.slice(i, i + 2).find((w) => w[2]);
      if (nextDoor) {
        const d = await this.page.evaluate((id) => window.__bot.door(id), nextDoor[2]);
        if (d && !d.open && !d.broken && Math.hypot(nextDoor[0] - s.x, nextDoor[1] - s.y) < 1.6) {
          await this.release();
          await this.aimAt(nextDoor[0], nextDoor[1], 0.6);
          await sleep(120);
          const s2 = await this.snap();
          if (s2.target?.kind === 'door') {
            await this.tap('KeyE');
            this.stats.doors++;
            await sleep(250);
          } else {
            // Step closer to the door.
            await this.steer(nextDoor[0] - s.x, nextDoor[1] - s.y);
            await sleep(120);
          }
          continue;
        }
      }
      const dx = wx - s.x;
      const dy = wy - s.y;
      const dd = Math.hypot(dx, dy);
      if (dd < (i === plan.length - 1 ? 0.3 : 0.45)) {
        i++;
        if (i >= plan.length) {
          await this.release();
          return true;
        }
        continue;
      }
      // Look where we're going (flashlight and facing follow the mouse).
      if (!this.aimOverride) await this.aimAt(s.x + (dx / dd) * 3, s.y + (dy / dd) * 3);
      await this.steer(dx, dy, sprint);
      await sleep(45);
      if (Math.hypot(s.x - lastMove.x, s.y - lastMove.y) > 0.25) lastMove = { t: Date.now(), x: s.x, y: s.y };
      else if (Date.now() - lastMove.t > 2500) {
        replans++;
        this.log(
          `goto ${label}: stuck at ${s.x.toFixed(2)},${s.y.toFixed(2)} (waypoint ${wx},${wy}${door ? ' door ' + door : ''}); replanning (${replans})`,
        );
        if (replans === 1) await this.shot(`stuck-${label || 'goto'}`);
        await this.release();
        // Wiggle off whatever corner we're caught on.
        await this.steer(-dy + (Math.random() - 0.5), dx + (Math.random() - 0.5));
        await sleep(250);
        plan = null;
        lastMove = { t: Date.now(), x: s.x, y: s.y };
        if (replans > 8) return false;
      }
    }
    await this.release();
    this.log(`goto ${label}: timed out`);
    return false;
  }

  /**
   * Walk up to a thing and use it with E. `hold` keeps E down until the action ends. Returns the target
   * that was used, or null.
   */
  async use(id, { hold = null, verbRe = null, maxMs = 120000, expectScreen = null, pad = 1 } = {}) {
    const w = await this.page.evaluate((id) => window.__bot.where(id), id);
    if (!w) {
      this.log('use: nothing called', id);
      return null;
    }
    const ok = await this.goto(w, { pad, label: id, maxMs });
    if (!ok) {
      this.log('use: could not reach', id);
      return null;
    }
    const cx = w.cx ?? w.x + w.w / 2;
    const cy = w.cy ?? w.y + w.h / 2;
    for (let attempt = 0; attempt < 6; attempt++) {
      await this.aimAt(cx, cy, 0.5);
      await sleep(150);
      let s = await this.snap();
      if (s.screens?.length) {
        if (expectScreen && s.screens.includes(expectScreen)) return s.target ?? { id };
        await this.handleScreens(s);
        continue;
      }
      if (await this.fight(s)) continue;
      const t = s.target;
      const matches =
        t && (t.id === id || t.id === 'w' + id || t.id.endsWith(id) || (verbRe && verbRe.test(t.verb)));
      if (!matches) {
        this.log(
          `use ${id}: prompt shows ${t ? `${t.kind}:${t.id} "${t.verb}"` : 'nothing'}; stepping closer`,
        );
        await this.steer(cx - s.x, cy - s.y);
        await sleep(160);
        await this.release();
        continue;
      }
      if (t.disabled) {
        this.log(`use ${id}: disabled — ${t.disabled}`);
        return null;
      }
      const isHold = hold ?? t.hold;
      this.log(`use ${id}: E (${t.verb}${isHold ? ', hold' : ''})`);
      if (isHold) {
        await this.page.keyboard.down('KeyE');
        const h0 = Date.now();
        await sleep(200);
        while (Date.now() - h0 < 30000) {
          s = await this.snap();
          if (!s.action || s.screens?.length) break;
          await sleep(80);
        }
        await this.page.keyboard.up('KeyE');
      } else {
        await this.tap('KeyE');
        if (t.timed) {
          const h0 = Date.now();
          await sleep(150);
          while (Date.now() - h0 < 8000) {
            s = await this.snap();
            if (!s.action) break;
            await sleep(60);
          }
        }
      }
      await sleep(250);
      return t;
    }
    this.log(`use ${id}: gave up`);
    return null;
  }

  /** Search a container and take everything. */
  async loot(id) {
    const t = await this.use(id, { expectScreen: 'loot' });
    if (!t) return false;
    for (let k = 0; k < 20; k++) {
      const s = await this.snap();
      if (s.screens?.includes('loot')) {
        await this.handleScreens(s);
        return true;
      }
      if (!s.action) break;
      await sleep(100);
    }
    const s = await this.snap();
    if (s.screens?.length) await this.handleScreens(s);
    return true;
  }

  /** Leave the zone through an exit tile and travel on the world map. */
  async travel(nodeId, mode = 'walk') {
    const s = await this.snap();
    if (s.zoneId === nodeId) return true;
    const exits = await this.page.evaluate(() => window.__bot.exits());
    const worldExits = exits.filter((e) => !e.toZone);
    // Nearest by path length would be nicer; nearest by distance is fine.
    worldExits.sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y));
    const ex = worldExits[0];
    if (!ex) {
      this.log('travel: no world exit here');
      return false;
    }
    this.log(`travel to ${nodeId}: heading for exit ${ex.id} at ${ex.x},${ex.y}`);
    await this.use(ex.id, { expectScreen: 'worldMap' });
    for (let k = 0; k < 30 && !(await this.snap()).screens?.includes('worldMap'); k++) await sleep(100);
    const page = this.page;
    if (!(await this.snap()).screens?.includes('worldMap')) {
      this.log('travel: world map did not open');
      return false;
    }
    await this.shotOnce('world-map');
    if (!(await this.safeClick(page.locator(`[data-screen="worldMap"] [data-node="${nodeId}"]`), 6000))) {
      this.log(`travel: ${nodeId} isn't on the map`);
      await this.tap('Escape');
      return false;
    }
    await sleep(300);
    // Low on fuel: pour in the cans you carry before driving.
    if (mode === 'drive') {
      for (let k = 0; k < 4; k++) {
        const refuel = page.locator('[data-screen="worldMap"] [data-action="refuel"]');
        if (!(await refuel.count()) || !(await refuel.first().isEnabled())) break;
        await this.safeClick(refuel);
        this.log('travel: poured a fuel can into the tank');
        await sleep(300);
      }
    }
    const btn = page.locator(`[data-screen="worldMap"] [data-action="${mode}"]`);
    if (!(await btn.count()) || !(await btn.isEnabled())) {
      const txt = await page.locator('[data-screen="worldMap"]').innerText();
      this.log(`travel: can't ${mode} to ${nodeId}:`, txt.replace(/\s+/g, ' ').slice(0, 400));
      await this.tap('Escape');
      return false;
    }
    await btn.click();
    this.log(`travel: ${mode} → ${nodeId}`);
    await sleep(600);
    for (let k = 0; k < 200; k++) {
      const s2 = await this.snap();
      if (s2.screens?.length) await this.handleScreens(s2);
      if (s2.zoneId === nodeId && s2.phase === 'playing' && !s2.screens?.length) {
        await sleep(600);
        return true;
      }
      await sleep(150);
    }
    this.log('travel: never arrived');
    return false;
  }

  async talk(npcId, prefs = []) {
    this.dialoguePrefs = prefs;
    this.visitedChoices.clear();
    const t = await this.use(npcId, { expectScreen: 'dialogue' });
    if (!t) return false;
    for (let k = 0; k < 40; k++) {
      const s = await this.snap();
      if (!s.screens?.includes('dialogue')) break;
      await this.dialogue();
      // Trade or other screens can open from a dialogue: let the caller handle them.
      const s2 = await this.snap();
      if (s2.screens?.includes('trade') || s2.screens?.includes('workbench')) return true;
    }
    this.dialoguePrefs = [];
    return true;
  }
}

export { sleep };
