import { expect, test, type Page } from '@playwright/test';

/** Console noise from software WebGL in headless Chromium is not a game error. */
const IGNORED = [/GPU stall/, /swiftshader/i, /GroupMarkerNotSet/, /Automatic fallback to software WebGL/];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORED.some((r) => r.test(msg.text()))) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

test('boots, starts a new game, and plays without console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/game/');
  await expect(page.locator('[data-screen="mainMenu"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/01-main-menu.png' });

  await page.click('[data-action="new-game"]');
  await expect(page.locator('[data-screen="newGame"]')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/02-new-game.png' });
  await page.click('[data-action="start"]');
  await expect(page.locator('[data-hud]')).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 6 && (await page.locator('[data-screen="textCard"]').count()); i++) {
    await page.screenshot({ path: `e2e/screenshots/03-story-card-${i}.png` });
    await page.click('[data-action="continue"]');
  }
  // Walk a little so the sim, FOV and HUD all run.
  await page.mouse.move(900, 400);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'e2e/screenshots/04-in-zone.png' });
  const zone = await page.evaluate(
    () =>
      (window as unknown as { holdout: { store: { state: { zone: { zoneId: string } } } } }).holdout.store
        .state.zone.zoneId,
  );
  expect(zone).toBe('maple_court');
  expect(errors).toEqual([]);
});

type Holdout = {
  store: {
    state: { zone: { zoneId: string; player: { x: number; y: number } }; time: { minutes: number } };
    open: (id: string, props?: Record<string, unknown>) => void;
  };
};
const holdout = (page: Page) =>
  page.evaluate(() => {
    const s = (window as unknown as { holdout: Holdout }).holdout.store.state;
    return { zone: s.zone.zoneId, x: s.zone.player.x, y: s.zone.player.y, minutes: s.time.minutes };
  });

test('opens the world map, saves, reloads the page and continues where it left off', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/game/');
  await page.click('[data-action="new-game"]');
  await page.click('[data-action="start"]');
  await expect(page.locator('[data-hud]')).toBeVisible({ timeout: 20_000 });
  while (await page.locator('[data-screen="textCard"]').count()) await page.click('[data-action="continue"]');

  // Leave Maple Court through the world map (the exit opens it with travel enabled).
  await page.evaluate(() =>
    (window as unknown as { holdout: Holdout }).holdout.store.open('worldMap', { atExit: true }),
  );
  await expect(page.locator('[data-screen="worldMap"]')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/05-world-map.png' });
  // Only Maple Court is known at the start: travelling isn't possible yet, so stay.
  await page.keyboard.press('Escape');

  // Saving is refused while zombies are hunting you, and spawns are random per save: keep the street
  // quiet so this test checks the save flow, not the AI.
  await page.evaluate(() => {
    const s = (window as unknown as { holdout: { store: { state: { zone: { zombies: unknown[] } } } } })
      .holdout.store.state;
    s.zone.zombies = [];
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-screen="pause"]')).toBeVisible();
  await page.click('text=Save game');
  await page.click('[data-action="save-slot1"]');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('holdout.meta.slot1') !== null))
    .toBe(true);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const before = await holdout(page);

  await page.reload();
  await expect(page.locator('[data-action="continue"]')).toBeVisible({ timeout: 20_000 });
  await page.click('[data-action="continue"]');
  await expect(page.locator('[data-hud]')).toBeVisible({ timeout: 20_000 });
  const after = await holdout(page);
  expect(after.zone).toBe(before.zone);
  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.y).toBeCloseTo(before.y, 3);
  expect(Math.abs(after.minutes - before.minutes)).toBeLessThan(2);
  expect(errors).toEqual([]);
});
