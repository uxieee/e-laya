import { test, expect } from '@playwright/test';

const SURFACES = ['index.html', 'kiosk.html', 'app.html', 'cases.html',
                  'sessions.html', 'verify.html', 'custody.html'];

for (const s of SURFACES) {
  test(`${s} shows the reviewer bar with a link to every surface`, async ({ page }) => {
    await page.goto('/' + s);
    const nav = page.locator('#elaya-shell');
    await expect(nav).toBeVisible();
    await expect(nav.locator('a')).toHaveCount(SURFACES.length);
  });
}

test('?bare=1 hides the reviewer bar', async ({ page }) => {
  await page.goto('/custody.html?bare=1');
  await expect(page.locator('#elaya-shell')).toHaveCount(0);
});

test('the bar marks the current surface', async ({ page }) => {
  await page.goto('/cases.html');
  await expect(page.locator('#elaya-shell a[aria-current="page"]')).toHaveText(/Cases/i);
});

test('dismissal persists across navigation', async ({ page }) => {
  await page.goto('/custody.html');
  await page.locator('#elaya-shell button[data-act="hide"]').click();
  await expect(page.locator('#elaya-shell')).toHaveCount(0);
  await page.goto('/cases.html');
  await expect(page.locator('#elaya-shell')).toHaveCount(0);
});

test('the custody Back button leaves the page', async ({ page }) => {
  await page.goto('/index.html');
  await page.goto('/custody.html');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).not.toHaveURL(/custody\.html/);
});
