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

/* Hiding the bar must never be a one-way door. The bar is the only navigation
   on the site, so a dismissal that cannot be undone without devtools strands
   a reviewer on whatever surface they were reading. */
test('a dismissed bar comes back with ?bare=0', async ({ page }) => {
  await page.goto('/custody.html');
  await page.locator('#elaya-shell button[data-act="hide"]').click();
  await expect(page.locator('#elaya-shell')).toHaveCount(0);

  await page.goto('/cases.html?bare=0');
  await expect(page.locator('#elaya-shell')).toBeVisible();
  // And it stays back — the recovery clears the flag, it does not just
  // suppress it for the one page view that carried the parameter.
  await page.goto('/custody.html');
  await expect(page.locator('#elaya-shell')).toBeVisible();
});

test('a dismissed bar comes back on the surface it was hidden on', async ({ page }) => {
  await page.goto('/verify.html');
  await page.locator('#elaya-shell button[data-act="hide"]').click();
  await expect(page.locator('#elaya-shell')).toHaveCount(0);
  await page.goto('/verify.html?bare=0');
  await expect(page.locator('#elaya-shell')).toBeVisible();
});

test('a dismissal does not outlive the tab it was made in', async ({ page, context }) => {
  await page.goto('/custody.html');
  await page.locator('#elaya-shell button[data-act="hide"]').click();
  await expect(page.locator('#elaya-shell')).toHaveCount(0);

  const fresh = await context.newPage();
  await fresh.goto('/custody.html');
  await expect(fresh.locator('#elaya-shell')).toBeVisible();
  await fresh.close();
});

test('the recovery path does not throw with web storage blocked', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const boom = { get() { throw new Error('storage blocked'); } };
    Object.defineProperty(window, 'localStorage', boom);
    Object.defineProperty(window, 'sessionStorage', boom);
  });
  await page.goto('/custody.html?bare=0');
  await expect(page.locator('#elaya-shell')).toBeVisible();
  // And the × still works when it cannot record anything.
  await page.locator('#elaya-shell button[data-act="hide"]').click();
  await expect(page.locator('#elaya-shell')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the hide control says how to bring the bar back', async ({ page }) => {
  await page.goto('/index.html');
  const close = page.locator('#elaya-shell button[data-act="hide"]');
  await expect(close).toHaveAttribute('title', /\?bare=0/);
  await expect(close).toHaveAttribute('aria-label', /\?bare=0/);
});

test('the custody Back button leaves the page', async ({ page }) => {
  await page.goto('/index.html');
  await page.goto('/custody.html');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page).not.toHaveURL(/custody\.html/);
});

test('the reviewer bar does not cover app.html\'s sign-in CTA at 390x844', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app.html');
  const cta = page.locator('#btnSSO');
  const bar = page.locator('#elaya-shell');
  await expect(cta).toBeVisible();
  await expect(bar).toBeVisible();
  const ctaBox = await cta.boundingBox();
  const barBox = await bar.boundingBox();
  expect(ctaBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  // The CTA's bottom edge must sit at or above the bar's top edge —
  // no vertical overlap between the two rects.
  expect(ctaBox.y + ctaBox.height).toBeLessThanOrEqual(barBox.y);
});
