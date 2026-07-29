import { test, expect } from '@playwright/test';

const SURFACES = [
  'index.html', 'kiosk.html', 'app.html', 'cases.html',
  'sessions.html', 'verify.html', 'custody.html', 'pitch.html'
];

for (const page_ of SURFACES) {
  test(`${page_} loads with no console errors`, async ({ page }) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto('/' + page_);
    await page.waitForLoadState('networkidle');

    expect(errors, `console errors on ${page_}:\n${errors.join('\n')}`).toEqual([]);
  });

  test(`${page_} declares a favicon`, async ({ page }) => {
    await page.goto('/' + page_);
    const count = await page.locator('link[rel~="icon"]').count();
    expect(count, `${page_} has no <link rel="icon">`).toBeGreaterThan(0);
  });
}
