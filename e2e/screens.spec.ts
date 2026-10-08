import { expect, test, type Page } from '@playwright/test';

/**
 * Visits every key screen and saves a screenshot of each to e2e/screenshots (uploaded by CI). Uses the
 * debug console (`?debug=1`) to set up states quickly; fails on any console error.
 */

const IGNORED = [/GPU stall/, /swiftshader/i, /GroupMarkerNotSet/, /Automatic fallback to software WebGL/];

type Store = {
  state: { zone: { zombies: unknown[] } | null };
  open: (id: string, props?: Record<string, unknown>) => void;
  closeAll: () => void;
};
type Holdout = { store: Store; cmd: (line: string) => string[] };

const cmd = (page: Page, line: string) =>
  page.evaluate((l) => (window as unknown as { holdout: Holdout }).holdout.cmd(l), line);
const open = (page: Page, id: string, props?: Record<string, unknown>) =>
  page.evaluate(
    ([i, p]) => {
      const s = (window as unknown as { holdout: Holdout }).holdout.store;
      s.closeAll();
      s.open(i as string, p as Record<string, unknown> | undefined);
    },
    [id, props] as const,
  );

async function shot(page: Page, name: string, screen: string): Promise<void> {
  await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `e2e/screenshots/${name}.png` });
}

test('every key screen renders', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !IGNORED.some((r) => r.test(msg.text()))) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/game/?debug=1');
  await page.click('[data-action="new-game"]');
  await page.click('[data-action="start"]');
  await expect(page.locator('[data-hud]')).toBeVisible({ timeout: 20_000 });
  while (await page.locator('[data-screen="textCard"]').count()) await page.click('[data-action="continue"]');

  // Pretend we've been out scavenging, then go to the camp.
  for (const line of [
    'god',
    'give pump_shotgun',
    'give ammo_shell 12',
    'give canned_beans 3',
    'give water_bottle 2',
    'give scrap_metal 6',
    'give duct_tape 2',
    'give jewelry 3',
    'give bp_suppressor',
    'quest prologue 5',
    'tp firehouse9',
  ])
    await cmd(page, line);
  await page.waitForTimeout(1200);
  await page.evaluate(() => (window as unknown as { holdout: Holdout }).holdout.store.closeAll());
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'e2e/screenshots/10-firehouse.png' });

  await open(page, 'inventory');
  await shot(page, '11-inventory', 'inventory');
  await open(page, 'workbench', { station: 'workbench' });
  await shot(page, '12-workbench', 'workbench');
  await open(page, 'dialogue', { npcId: 'ruth' });
  await shot(page, '13-dialogue', 'dialogue');
  await open(page, 'trade', { traderId: 'gus' });
  await shot(page, '14-trade', 'trade');
  await open(page, 'journal');
  await shot(page, '15-journal', 'journal');
  await open(page, 'skills');
  await shot(page, '16-skills', 'skills');
  await open(page, 'zoneMap');
  await shot(page, '17-zone-map', 'zoneMap');
  await cmd(page, 'reveal');
  await open(page, 'worldMap', { atExit: true });
  await shot(page, '18-world-map', 'worldMap');
  await open(page, 'saves', { mode: 'save' });
  await shot(page, '19-saves', 'saves');
  await open(page, 'settings');
  await shot(page, '20-settings', 'settings');
  await open(page, 'sleep');
  await shot(page, '21-sleep', 'sleep');
  await open(page, 'pause');
  await shot(page, '22-pause', 'pause');
  await open(page, 'death', { cause: 'infection' });
  await shot(page, '23-death', 'death');

  expect(errors).toEqual([]);
});
