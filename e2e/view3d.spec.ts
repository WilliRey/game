import { expect, test, type Page } from '@playwright/test';

/**
 * Screenshots of the 3D view itself (BRIEF_V2 §1) to e2e/screenshots: an interior, a melee swing, night
 * with the flashlight, a horde (the instanced path), the camp, and the Canvas2D fallback. Fails on any
 * console error, and on a frame that is (nearly) blank. Uses the debug console (`?debug=1`) to stage scenes.
 */

const IGNORED = [/GPU stall/, /swiftshader/i, /GroupMarkerNotSet/, /Automatic fallback to software WebGL/];

type Holdout = {
  store: {
    state: { zone: { player: { x: number; y: number }; zombies: Zombie[] } | null };
    closeAll(): void;
  };
  game: {
    mode: string;
    quality: { name: string } | null;
    current?: { rig?: { project(x: number, y: number, z: number): { x: number; y: number } } };
  };
  cmd: (line: string) => string[];
};
type Zombie = { x: number; y: number; mode: string; facing: number };

const cmd = (page: Page, line: string) =>
  page.evaluate((l) => (window as unknown as { holdout: Holdout }).holdout.cmd(l), line);

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORED.some((r) => r.test(msg.text()))) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function startGame(page: Page, query: string): Promise<void> {
  await page.goto(`/game/?debug=1${query}`);
  await page.click('[data-action="new-game"]');
  await page.click('[data-action="next"]');
  await page.click('[data-action="start"]');
  await expect(page.locator('[data-hud]')).toBeVisible({ timeout: 20_000 });
  while (await page.locator('[data-screen="textCard"]').count()) await page.click('[data-action="continue"]');
  await cmd(page, 'god');
  await page.keyboard.press('KeyH');
}

/** Save a screenshot and check it isn't an empty frame (a blank 1280×720 PNG is a few KB). */
async function shot(page: Page, name: string): Promise<void> {
  const png = await page.screenshot({ path: `e2e/screenshots/${name}.png` });
  expect(png.length, `${name} looks blank`).toBeGreaterThan(40_000);
}

async function place(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([px, py]) => {
      const z = (window as unknown as { holdout: Holdout }).holdout.store.state.zone!;
      z.player.x = px!;
      z.player.y = py!;
    },
    [x, y],
  );
}

/** Move the mouse onto a world point (tiles). */
async function aimAt(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(
    ([px, py]) =>
      (window as unknown as { holdout: Holdout }).holdout.game.current!.rig!.project(px!, 0.55, py!),
    [x, y],
  );
  await page.mouse.move(p.x, p.y);
}

test('the 3D view: interior, melee, night, a horde and the camp', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await startGame(page, '');
  const info = await page.evaluate(() => {
    const g = (window as unknown as { holdout: Holdout }).holdout.game;
    return { mode: g.mode, quality: g.quality?.name };
  });
  expect(info.mode).toBe('webgl');

  await page.waitForTimeout(1000);
  await shot(page, '30-3d-apartment');

  // Depot Street by day: a walker in front, mid wind-up, and a swing at it.
  await place(page, 40.5, 30.5);
  await cmd(page, 'kill');
  await aimAt(page, 42, 30.5);
  await page.waitForTimeout(800);
  await cmd(page, 'spawn walker 1');
  await page.evaluate(() => {
    const z = (window as unknown as { holdout: Holdout }).holdout.store.state.zone!.zombies[0]!;
    z.x = 41.8;
    z.y = 30.4;
    z.mode = 'attack';
    z.facing = Math.PI;
  });
  await page.waitForTimeout(300);
  await shot(page, '31-3d-zombie-windup');
  await aimAt(page, 41.8, 30.4);
  await page.mouse.down();
  await page.waitForTimeout(260);
  await shot(page, '32-3d-melee-swing');
  await page.mouse.up();
  await page.waitForTimeout(600);

  // Night with the flashlight.
  await cmd(page, 'kill');
  await cmd(page, 'time 22:30');
  await place(page, 30.5, 30.5);
  await page.keyboard.press('KeyF');
  await aimAt(page, 36, 29);
  await page.waitForTimeout(1200);
  await shot(page, '33-3d-night-flashlight');

  // A horde: fifty walkers share a handful of instanced draw calls.
  await cmd(page, 'time 12:00');
  await cmd(page, 'spawn walker 40');
  await cmd(page, 'spawn runner 10');
  await page.waitForTimeout(1500);
  await shot(page, '34-3d-horde');
  const calls = await page.evaluate(
    () =>
      (window as unknown as { holdout: { game: { renderer: { info: { render: { calls: number } } } } } })
        .holdout.game.renderer.info.render.calls,
  );
  expect(calls, 'draw calls with 50 zombies').toBeLessThan(250);

  // The camp.
  await cmd(page, 'kill');
  await cmd(page, 'tp firehouse9');
  await page.waitForTimeout(2000);
  await page.evaluate(() => (window as unknown as { holdout: Holdout }).holdout.store.closeAll());
  await place(page, 34.5, 23.5);
  await page.waitForTimeout(1200);
  await shot(page, '35-3d-camp');

  expect(errors).toEqual([]);
});

test('the Canvas2D fallback renders the same zone', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await startGame(page, '&renderer=2d');
  const mode = await page.evaluate(() => (window as unknown as { holdout: Holdout }).holdout.game.mode);
  expect(mode).toBe('2d');
  await page.waitForTimeout(800);
  await shot(page, '36-fallback-2d');
  expect(errors).toEqual([]);
});
