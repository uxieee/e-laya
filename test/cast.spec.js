import { test, expect } from '@playwright/test';

const MIGRATED = ['cases.html', 'sessions.html', 'custody.html', 'verify.html'];
const STALE = ['Quezon City', 'Payatas', 'Commonwealth', 'Batasan Hills',
               'Holy Spirit', 'Bagong Silangan'];

test('the cast exposes the three bridge people', async ({ page }) => {
  await page.goto('/index.html');
  await page.addScriptTag({ path: '../public/elaya-cast.js' });
  const ids = await page.evaluate(() => Object.keys(window.ELAYA_CAST.people).sort());
  expect(ids).toEqual(['jomar', 'miguel', 'renz']);
});

test('the store seeds people from the cast', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.addScriptTag({ path: '../public/elaya-cast.js' });
  await page.addScriptTag({ path: '../public/elaya-store.js' });
  const name = await page.evaluate(() => window.Elaya.get('people.miguel.full'));
  expect(name).toBe('Miguel Andres Reyes');
});

for (const file of MIGRATED) {
  test(`${file} contains no Quezon City locality strings`, async ({ page }) => {
    const res = await page.request.get('/' + file);
    const body = await res.text();
    const found = STALE.filter(s => body.includes(s));
    expect(found, `${file} still contains: ${found.join(', ')}`).toEqual([]);
  });
}
