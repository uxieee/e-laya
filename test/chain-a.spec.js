import { test, expect } from '@playwright/test';

test('confirming welfare in /custody survives a reload', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => window.Elaya.reset());
  await page.reload();

  const before = await page.evaluate(() =>
    document.body.innerText.match(/(\d+) of \d+ updated today/)[1]);

  await page.evaluate(() => {
    window.Elaya.set('welfare.miguel', {
      key: 'ok', at: '9:14 AM', by: 'JO1 Sarmiento', source: 'manual'
    });
  });
  await page.reload();

  const stored = await page.evaluate(() => window.Elaya.get('welfare.miguel.key'));
  expect(stored).toBe('ok');
  expect(Number(before)).toBeGreaterThan(0);
});

test('a welfare write in /custody appears in /app', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('welfare.miguel', {
      key: 'clinic', at: '10:22 AM', by: 'JO1 Sarmiento', source: 'manual'
    });
    window.Elaya.notify({
      to: 'Rosa Andres Reyes', body: 'Miguel is in the facility clinic',
      surface: 'custody', personId: 'miguel'
    });
  });

  await page.goto('/app.html');
  const r = await page.evaluate(() => ({
    key: window.Elaya.get('welfare.miguel.key'),
    notif: window.Elaya.get('notifications')[0].body
  }));
  expect(r.key).toBe('clinic');
  expect(r.notif).toBe('Miguel is in the facility clinic');
});

test('/app renders the stored welfare state, not its seed', async ({ page }) => {
  await page.goto('/app.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('welfare.miguel', {
      key: 'clinic', at: '10:22 AM', by: 'JO1 Sarmiento', source: 'manual'
    });
  });
  await page.reload();
  await expect(page.locator('body')).toContainText('klinika');
  // body.textContent also contains the page's inline <script> source, where the
  // word "klinika" appears in the copy table — so the assertion above cannot
  // fail. Pin it to the rendered A-3 card, which is the thing under test.
  await expect(page.locator('#listBody')).toContainText('Nasa klinika siya');
});

test('/custody still renders with the store unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true, get() { throw new Error('blocked'); }
    });
  });
  await page.goto('/custody.html');
  await expect(page.locator('body')).toContainText('updated today');
});
