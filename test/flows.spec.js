import { test, expect } from '@playwright/test';

/* ------------------------------------------------------------------ *
 * Flows — the three acceptance chains, driven end to end through the  *
 * controls a real user touches, plus the property the whole build     *
 * rests on: the store is an enhancement layer, never a dependency.    *
 *                                                                     *
 * Two rules this file keeps, both learned the hard way:               *
 *                                                                     *
 *  1. Never assert on `page.locator('body')`. Its textContent         *
 *     includes the surface's inline <script> source, so an assertion  *
 *     against it matches strings that exist only in code — five       *
 *     vacuous tests in this suite had exactly that shape. Every       *
 *     assertion below is scoped to an element a renderer wrote.       *
 *  2. Never write to the store with page.evaluate and read it back.   *
 *     That passes with the writing surface deleted. Every chain below *
 *     starts at a control and ends at painted text.                   *
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Standalone — no storage, no store, every surface still usable       *
 * ------------------------------------------------------------------ */

/* One element per surface that only its own renderer can produce. Chosen so
   that a surface which threw on its first statement fails here rather than
   matching its own <script> text. */
const RENDERED = {
  'kiosk.html':    '#k1grid',
  'app.html':      '#listBody',
  'cases.html':    '#c1Scroll',
  'sessions.html': '#s1Scroll',
  /* #todayLabel is written by verify's boot() before its first await, so an
     empty one means the surface's script never ran. The demo-case list is
     painted on demand and would be empty on a healthy page. */
  'verify.html':   '#todayLabel',
  'custody.html':  '#roster'
};

test('standalone: every surface renders with localStorage blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true, get() { throw new Error('blocked'); }
    });
  });

  /* Registered ONCE. Registering inside the loop accumulated a handler per
     iteration, so by the sixth surface five stale listeners were still pushing
     into the same array and an error raised on kiosk.html was reported six
     times, attributed to custody.html. The array is cleared per surface
     instead, which attributes each error to the page that raised it. */
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  for (const [surface, sel] of Object.entries(RENDERED)) {
    errors.length = 0;
    await page.goto('/' + surface);
    const root = page.locator(sel);
    await expect(root, `${sel} missing on ${surface}`).toHaveCount(1);
    await expect(root, `${sel} rendered nothing on ${surface}`).not.toBeEmpty();
    expect(errors, `${surface} threw with no storage`).toEqual([]);
  }
});

/* Blocking localStorage leaves window.Elaya in place — the guards are never
   exercised. This is the case where the script genuinely did not load. */
test('standalone: every surface renders with window.Elaya absent', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Elaya', {
      configurable: true, get() { return undefined; }, set() { /* swallow */ }
    });
  });

  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  for (const [surface, sel] of Object.entries(RENDERED)) {
    errors.length = 0;
    await page.goto('/' + surface);
    expect(await page.evaluate(() => window.Elaya),
      `window.Elaya was not actually absent on ${surface}`).toBeUndefined();
    const root = page.locator(sel);
    await expect(root, `${sel} missing on ${surface}`).toHaveCount(1);
    await expect(root, `${sel} rendered nothing on ${surface}`).not.toBeEmpty();
    expect(errors, `${surface} threw with no store`).toEqual([]);
  }
});

/* ------------------------------------------------------------------ *
 * Chain A — an officer confirms welfare in /custody, the family sees  *
 * it in /app                                                          *
 * ------------------------------------------------------------------ */

test('chain A: a status set in /custody is what /app paints', async ({ page }) => {
  await page.goto('/custody.html');
  await page.evaluate(() => window.Elaya.reset());
  await page.reload();

  // The seed /app would show if nothing had been confirmed.
  await page.goto('/app.html#/person');
  await expect(page.locator('#personBody')).toContainText('Ayos naman siya');

  // The officer's two taps. Nothing here writes to the store directly.
  await page.goto('/custody.html');
  await page.locator('[aria-label^="Set status for Miguel Andres Reyes"]').click();
  await page.locator('#stGrid button', { hasText: 'In court' }).click();

  await page.goto('/app.html#/person');
  const body = page.locator('#personBody');
  await expect(body).toContainText('Nasa hearing siya ngayon');
  await expect(body).not.toContainText('Ayos naman siya');
});

/* The same chain with both surfaces open at once — the demo is filmed this
   way, and the storage-event path is a different code path from the reload
   above. Driven through the officer's control, and asserted on the card /app
   repaints, not on a store read. */
test('chain A: two tabs stay in sync without a reload', async ({ browser }) => {
  const ctx = await browser.newContext();
  const custody = await ctx.newPage();
  const app = await ctx.newPage();

  await custody.goto('/custody.html');
  await custody.evaluate(() => window.Elaya.reset());
  await custody.reload();

  await app.goto('/app.html#/person');
  await expect(app.locator('#personBody')).toContainText('Ayos naman siya');

  await custody.locator('[aria-label^="Set status for Miguel Andres Reyes"]').click();
  await custody.locator('#stGrid button', { hasText: 'In court' }).click();

  // No reload of `app`: the change has to arrive over the storage event and
  // repaint the card on its own.
  await expect(app.locator('#personBody')).toContainText('Nasa hearing siya ngayon',
    { timeout: 5000 });

  await ctx.close();
});

/* ------------------------------------------------------------------ *
 * Chain B — attendance logged in /sessions; /app, /cases and /kiosk   *
 * agree                                                               *
 * ------------------------------------------------------------------ */

/** The exact sequence in the demo script: open S-3, mark everyone present,
    flip one person to missed, save. */
async function logSession(page, missedRosterId) {
  await page.goto('/sessions.html');
  await page.evaluate(() => window.Elaya.reset());
  await page.reload();
  await page.locator('#goLog').click();
  await page.locator('#markAll').click();
  if (missedRosterId) {
    await page.locator(`.tgb[data-set="missed"][data-p="${missedRosterId}"]`).click();
  }
  await page.locator('#s3Save').click();
  await page.locator('#s3cScroll').getByText('INTEGRITY RECEIPT').waitFor();
}

test('chain B: /app, /cases and /kiosk all agree with the record /sessions wrote',
  async ({ page }) => {
    await logSession(page, 'r1');            // r1 = Bautista, Renz A. → missed

    // The single source everything below must match.
    const store = await page.evaluate(() => ({
      jomar: window.Elaya.get('attendance.jomar.pg1'),
      renz: window.Elaya.get('attendance.renz.pg1')
    }));
    expect(store.jomar).toMatchObject({ done: 5, of: 12, missed: 1, missStreak: 0 });
    expect(store.renz).toMatchObject({ done: 5, of: 12, missed: 4, missStreak: 4 });

    /* --- the family, in /app --- */
    await page.goto('/app.html#/list');
    await page.locator('[data-person="jomar"]').click();
    await page.locator('[data-ptab="programa"]').click();
    const appBody = page.locator('#personBody');
    await expect(appBody).toContainText(
      `${store.jomar.done} of ${store.jomar.of} sessions · ${store.jomar.missed} missed`);
    const appMiss = await appBody.locator('.dots .dot.miss').count();
    const appAtt = await appBody.locator('.dots .dot.att').count();
    expect(appAtt, '/app attended dots').toBe(store.jomar.done);

    /* --- the boy himself, at the facility terminal --- */
    await page.goto('/kiosk.html?person=jomar');
    await page.evaluate(() => go('programs'));
    await expect(page.locator('#progAtt'))
      .toContainText(`${store.jomar.done} sa ${store.jomar.of}`);
    const kioskDots = page.locator('#progDots');
    expect(await kioskDots.locator('.adot:not(.miss):not(.next)').count(),
      '/kiosk attended dots').toBe(store.jomar.done);

    /* THE agreement. /kiosk used to paint these from missStreak (consecutive)
       while /app painted them from missed (to date). After Jomar was logged
       present his streak was 0 and his total was 1, so /app showed a miss and
       the terminal showed a clean row — two family-facing surfaces contradicting
       each other about one record. Both now read `missed`. */
    const kioskMiss = await kioskDots.locator('.adot.miss').count();
    expect(kioskMiss, '/kiosk miss dots').toBe(store.jomar.missed);
    expect(appMiss, '/app miss dots').toBeGreaterThan(0);
    expect(kioskMiss > 0, '/app and /kiosk disagree about whether Jomar missed a session')
      .toBe(appMiss > 0);

    /* --- the lawyer, in /cases. Its vocabulary is the streak, and it says so
           in words: "missed in a row". Renz is the cast-linked case. --- */
    await page.goto('/cases.html');
    const row = page.locator('#c1Scroll .row', { hasText: 'Bautista, Renz A.' });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`Diversion: ${store.renz.missStreak} missed`);
    await row.click();
    await page.locator('#c2Scroll [data-acc="programs"]').click();
    await expect(page.locator('#c2Scroll')).toContainText(
      `${store.renz.done} of ${store.renz.of} sessions · ${store.renz.missStreak} missed in a row`);
  });

/* Pins the fix directly, at the value that used to differ: a record with a
   real total and a cleared streak. Painting the streak here would show zero
   miss dots against /app's one. */
test('chain B: /kiosk paints misses to date, not the consecutive streak',
  async ({ page }) => {
    await page.goto('/kiosk.html');
    await page.evaluate(() => {
      window.Elaya.reset();
      window.Elaya.set('attendance.jomar.pg1', {
        done: 5, of: 12, missed: 3, missStreak: 0,
        lastAt: '2026-07-29T14:00:00+08:00', receipt: 'b7c2…19ff'
      });
    });

    await page.goto('/kiosk.html?person=jomar');
    await page.evaluate(() => go('programs'));
    expect(await page.locator('#progDots .adot.miss').count()).toBe(3);

    await page.goto('/app.html#/list');
    await page.locator('[data-person="jomar"]').click();
    await page.locator('[data-ptab="programa"]').click();
    await expect(page.locator('#personBody')).toContainText('3 missed');
  });

/* ------------------------------------------------------------------ *
 * Chain C — a determination in /verify becomes a case and a person    *
 * ------------------------------------------------------------------ */

/** Drive /verify end to end for one of the demo cases. The determination is
    recorded at the moment the three statutory notifications are sent. */
async function determine(page, key) {
  await page.goto('/verify.html');
  await page.waitForFunction(() => typeof window.openCase === 'function');
  await page.keyboard.press(key);
  await expect(page.locator('#s-v2')).toHaveClass(/\bon\b/);

  const yes = page.locator('#idmYes');
  if (await yes.count()) {
    await expect(page.locator('#idmBtns')).toHaveClass(/\blive\b/);
    await yes.click();
  }
  await page.locator('#v2foot .btn').click();
  await expect(page.locator('#s-v4')).toHaveClass(/\bon\b/);

  await page.locator('#sendBtn').click();
  await expect(page.locator('#s-done')).toHaveClass(/\bon\b/, { timeout: 15000 });
}

test('chain C: a determination in /verify reaches /cases and /app', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());

  // Before: neither surface knows this person.
  await page.goto('/cases.html');
  await expect(page.locator('#c1Scroll .row', { hasText: 'Cruz, Juan Dela' })).toHaveCount(0);

  await determine(page, '1');               // case a — a child at the incident date

  // The lawyer's caseload.
  await page.goto('/cases.html');
  const row = page.locator('#c1Scroll .row', { hasText: 'Cruz, Juan Dela' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('CICL 16');
  await row.click();
  await expect(page.locator('#c2Scroll')).toContainText(
    'Determined a child in conflict with the law — 16 years old');

  // The family's app.
  await page.goto('/app.html#/list');
  const card = page.locator('#listBody [data-person="intake-VF-8241"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Juan C.');
  // The link is an intake record, not a confirmed family relationship.
  await expect(card).toContainText('Naitala sa intake · hinihintay ang kumpirmasyon');
  await card.click();
  await expect(page.locator('#personBody')).toContainText('Juan Dela Cruz Jr.');

  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ *
 * The copy the receipt control makes must describe what it copied     *
 * ------------------------------------------------------------------ */

/* The copied value always matches what is displayed. But when the record
   carries no 64-character form, what is handed over is the abbreviation — and
   a screen whose entire pitch is a verifiable chain of custody must not
   announce a full SHA-256 over eleven characters. */
test('/app names the receipt it copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // A full-hash record: the live path, and the claim is true.
  await logSession(page, null);
  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();
  const btn = page.locator('#personBody [data-act="copyhash"]');
  expect(await btn.getAttribute('data-hash')).toHaveLength(64);
  await btn.click();
  await expect(page.locator('#toast')).toContainText('buong SHA-256');

  // A record carrying only the short form — a stale persisted blob, or one
  // written before receiptFull was mirrored alongside it.
  await page.goto('/app.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.jomar.pg1', {
      done: 5, of: 12, missed: 1, missStreak: 0,
      lastAt: '2026-07-29T14:00:00+08:00', receipt: 'b7c2…19ff'
    });
  });
  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();

  const short = page.locator('#personBody [data-act="copyhash"]');
  const handed = await short.getAttribute('data-hash');
  expect(handed, 'the abbreviation is what would be copied').toBe('b7c2…19ff');
  await short.click();
  const toast = page.locator('#toast');
  await expect(toast).toContainText('pinaikling');
  await expect(toast).not.toContainText('buong SHA-256');
});
