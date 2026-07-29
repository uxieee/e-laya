import { test, expect } from '@playwright/test';

const SURFACES = ['index.html', 'kiosk.html', 'app.html', 'cases.html',
                  'sessions.html', 'verify.html', 'custody.html'];

/* One selector, used by both the "nested interactive" query below and the tap
   target query. `[role=button]` matters: the kiosk's read-aloud control (D4)
   was a <span role="button"> inside a <button>, which the narrower
   `button button, a a, button a, a button` query in the brief could never
   have caught — it names element pairs only. */
const INTERACTIVE = 'button, a[href], [role=button]';

for (const s of SURFACES) {
  test(`${s} has exactly one h1`, async ({ page }) => {
    await page.goto('/' + s);
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test(`${s} has no nested interactive elements`, async ({ page }) => {
    await page.goto('/' + s);
    const nested = await page.evaluate((sel) =>
      Array.from(document.querySelectorAll(sel))
        .filter(e => e.parentElement && e.parentElement.closest(sel))
        .map(e => (e.textContent || e.getAttribute('aria-label') || '?').trim().slice(0, 40)),
      INTERACTIVE);
    expect(nested, `nested controls on ${s}`).toEqual([]);
  });

  test(`${s} has no tap target under 32px`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/' + s);
    const small = await page.evaluate((sel) =>
      Array.from(document.querySelectorAll(sel))
        .filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32);
        })
        .map(e => {
          const r = e.getBoundingClientRect();
          const label = (e.getAttribute('aria-label') || e.textContent || '?').trim().slice(0, 30);
          return `${label} [${e.className || e.tagName}] ${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
      INTERACTIVE);
    expect(small, `small tap targets on ${s}`).toEqual([]);
  });
}

test('kiosk sets the document language when a language is chosen', async ({ page }) => {
  await page.goto('/kiosk.html');
  /* Deliberately NOT `getByRole('button', {name:/Binisaya/}).first()`: after the
     D4 fix two sibling buttons carry that name (the tile and its read-aloud
     control), and only the tile changes the language. Clicking the wrong one
     would fail for the right reason, but the test should name what it means. */
  await expect(page.locator('html')).toHaveAttribute('lang', 'fil');   // precondition
  await page.locator('button.ltile', { hasText: 'Binisaya' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('ceb');
});

test('the kiosk read-aloud control is a sibling button, not a child of the tile', async ({ page }) => {
  await page.goto('/kiosk.html');
  const shape = await page.evaluate(() => {
    const spk = document.querySelector('.langwrap .spk');
    if (!spk) return { found: false };
    return {
      found: true,
      tag: spk.tagName,
      insideTile: !!spk.closest('.ltile'),
      siblingOfTile: !!(spk.parentElement && spk.parentElement.querySelector('.ltile'))
    };
  });
  expect(shape).toEqual({ found: true, tag: 'BUTTON', insideTile: false, siblingOfTile: true });
});

/* The read-aloud button used to sit inside the tile and cancel the tile's own
   click with stopPropagation. Now that they are siblings there is nothing to
   stop, so this pins the thing that would break if the wrapper were ever
   flattened: pressing the speaker must not start a session in that language. */
test('pressing the kiosk read-aloud control does not choose the language', async ({ page }) => {
  await page.goto('/kiosk.html');
  await page.locator('.langwrap', { hasText: 'Binisaya' }).locator('.spk').click();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('fil');
  await expect(page.locator("#k1grid")).toBeVisible();       // still on the language screen
});

/* D7. The /api/* probes in kiosk.html abort on a deliberate per-endpoint
   timeout. This pins the claim that a timed-out probe is silent: the page must
   raise no console error and no unhandled rejection even when the endpoint
   never answers. The harness normally replies instantly, so the abort is forced
   here with a route that hangs past every tryApi budget (max 1600 ms). */
test('an aborted API probe raises no console error on kiosk', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  await page.route('**/api/**', async route => {
    await new Promise(r => setTimeout(r, 4000));
    await route.abort();
  });

  await page.goto('/kiosk.html');
  await page.locator('button.ltile', { hasText: 'Binisaya' }).click();   // fires /api/ai
  await page.waitForTimeout(3000);                                       // past every budget

  const failed = await page.evaluate(() => document.documentElement.lang);
  expect(failed, 'the language still applied without the API').toBe('ceb');
  expect(errors, `console errors while probes aborted:\n${errors.join('\n')}`).toEqual([]);
});
