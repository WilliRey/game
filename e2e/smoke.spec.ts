import { expect, test } from '@playwright/test';

test('boots to the main menu without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/game/');
  await expect(page.locator('[data-screen="mainMenu"]')).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'e2e/screenshots/01-main-menu.png' });
  expect(errors).toEqual([]);
});
