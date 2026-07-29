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
  // As with test 3: body.textContent includes the inline <script> source, where
  // the literal "updated today" appears in paintHeader — so the line above
  // matches even if that script threw on its first statement. Assert on the
  // nodes paintHeader/render actually write.
  await expect(page.locator('#mA')).toHaveText(/^\d+ of \d+ updated today$/);
  expect(await page.locator('#roster .rrow').count()).toBeGreaterThan(0);
});

/* Blocking localStorage only makes the store non-persistent — window.Elaya is
   still there, so none of the `if (window.Elaya)` guards are exercised. This is
   the case where the script genuinely did not load. */
async function withoutStore(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Elaya', {
      configurable: true, get() { return undefined; }, set() { /* swallow */ }
    });
  });
}

test('/custody renders and confirms with window.Elaya absent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withoutStore(page);
  await page.goto('/custody.html');

  expect(await page.evaluate(() => window.Elaya)).toBeUndefined();
  await expect(page.locator('#mA')).toHaveText(/^\d+ of \d+ updated today$/);

  const row = page.locator('.rrow', { hasText: 'Miguel Andres Reyes' });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: /^Mark Miguel Andres Reyes OK/ }).click();
  await expect(page.locator('#snack')).toContainText('OK — Miguel Andres Reyes');
  expect(errors).toEqual([]);
});

test('/app renders its seed with window.Elaya absent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withoutStore(page);
  await page.goto('/app.html');

  expect(await page.evaluate(() => window.Elaya)).toBeUndefined();
  await expect(page.locator('#listBody')).toContainText('Ayos naman siya');
  expect(errors).toEqual([]);
});

/* Tests 1-3 drive the store directly, so they would all still pass if the write
   block in commit() were deleted. This one taps the control an officer taps. */
test('tapping OK on the roster is what writes the welfare record', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => window.Elaya.reset());
  await page.reload();
  expect(await page.evaluate(() => window.Elaya.get('welfare.miguel', null))).toBeNull();

  await page.locator('[aria-label^="Mark Miguel Andres Reyes OK"]').click();

  const after = await page.evaluate(() => ({
    welfare: window.Elaya.get('welfare.miguel'),
    notif: window.Elaya.get('notifications')[0]
  }));
  expect(after.welfare.key).toBe('ok');
  expect(after.welfare.by).toBe('JO1 Sarmiento');
  expect(after.welfare.source).toBe('manual');
  expect(typeof after.welfare.expiresAt).toBe('number');
  expect(after.notif.to).toBe('Rosa Andres Reyes');
  expect(after.notif.personId).toBe('miguel');
  expect(after.notif.body).toContain('Miguel');
});

test('the status dialog maps the officer vocabulary to the store vocabulary', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => window.Elaya.reset());
  await page.reload();

  await page.locator('[aria-label^="Set status for Miguel Andres Reyes"]').click();
  await page.locator('#stGrid button', { hasText: 'In court' }).click();

  // /custody calls it "court"; /app and /kiosk read "hearing".
  expect(await page.evaluate(() => window.Elaya.get('welfare.miguel.key'))).toBe('hearing');
});

test('undo retracts both the welfare record and the queued SMS', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => window.Elaya.reset());
  await page.reload();

  await page.locator('[aria-label^="Mark Miguel Andres Reyes OK"]').click();
  expect(await page.evaluate(() => window.Elaya.get('notifications').length)).toBe(1);

  await page.locator('#snack').getByRole('button').first().click();

  const after = await page.evaluate(() => ({
    welfare: window.Elaya.get('welfare.miguel', 'MISSING'),
    notifs: window.Elaya.get('notifications')
  }));
  expect(after.welfare).toBeNull();   // restored to the pre-tap value
  expect(after.notifs).toEqual([]);   // the SMS was never sent, so it is not shown
});

/* A fixed name in the SMS table would text one family's guardian a welfare
   claim about a different family's relative. */
test('the queued SMS names the person it is about, not a fixed name', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    // A second bridge person, as Task 7+ will add.
    const other = people.find(x => x.name === 'Ana M. Reyes');
    other.castId = 'ana';
    other.kinName = 'Rosa Andres Reyes';   // the cast reuses this guardian name
    render();
  });

  await page.locator('[aria-label^="Mark Ana M. Reyes OK"]').click();
  const body = await page.evaluate(() => window.Elaya.get('notifications')[0].body);
  expect(body).toContain('Ana');
  expect(body).not.toContain('Miguel');
});

test('a stored record older than 24 hours is not shown as today', async ({ page }) => {
  await page.goto('/app.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    const DAY = 86400000;
    window.Elaya.set('welfare.miguel', {
      key: 'clinic', at: '9:14 AM', by: 'JO1 Sarmiento', source: 'manual',
      expiresAt: Date.now() - 2 * DAY          // confirmed three days ago
    });
  });
  await page.reload();

  const body = page.locator('#listBody');
  await expect(body).toContainText('Walang update ngayong araw');
  await expect(body).not.toContainText('Ngayong araw, 9:14 AM');
});

test('an unknown stored key falls back to the seed instead of blanking A-4', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/app.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('welfare.miguel', { key: 'not-a-real-status', at: '9:14 AM' });
  });
  await page.goto('/app.html#/person');

  await expect(page.locator('#personBody')).toContainText('Ayos naman siya');   // the seed
  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ *
 * The roster must not drift with the hour                             *
 *                                                                     *
 * custody.html seeds "confirmed yesterday" rows as an offset from     *
 * `now` (20-28 hours). An offset of 20 hours lands before midnight in *
 * the morning and after it in the evening, so from 20:00 local those  *
 * rows satisfied updatedToday(), left "Not yet updated" for the       *
 * collapsed done group, and took the headline with them — 84 of 128   *
 * at 09:00, 90 of 128 at 20:23. Five tests above locate those rows,   *
 * so they failed every evening; the demo also showed a judge a        *
 * different number at 21:00 than at 09:00.                            *
 * ------------------------------------------------------------------ */
async function rosterAtHour(page, hour) {
  // Freeze the page's clock before any of its own script runs.
  await page.addInitScript(([h]) => {
    const base = new Date(); base.setHours(h, 30, 0, 0);
    const fixed = base.getTime(), RealDate = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(fixed); }
      static now() { return fixed; }
    };
  }, [hour]);
  await page.goto('/custody.html');
  return page.evaluate(() => ({
    headline: document.getElementById('mA').textContent,
    done: people.filter(updatedToday).length,
    look: people.filter(needsLook).length,
    todo: people.filter(p => !updatedToday(p) && !needsLook(p)).length,
    stale: people.filter(p => !isFresh(p)).length,
    rows: document.querySelectorAll('.rrow').length,
    bridge: !!Array.from(document.querySelectorAll('.rrow'))
      .find(n => n.textContent.includes('Miguel Andres Reyes'))
  }));
}

test('the custody roster reads the same at every hour of the day', async ({ page }) => {
  const expected = {
    headline: '84 of 128 updated today',
    done: 84, look: 2, todo: 42, stale: 30, rows: 44, bridge: true
  };
  // Midnight and the 20:00 boundary are the two that used to break.
  for (const hour of [0, 6, 9, 13, 17, 19, 20, 21, 23]) {
    const ctx = await page.context().newPage();
    try {
      expect(await rosterAtHour(ctx, hour), `roster at ${hour}:30`).toEqual(expected);
    } finally {
      await ctx.close();
    }
  }
});
