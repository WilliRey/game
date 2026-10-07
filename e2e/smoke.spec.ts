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
