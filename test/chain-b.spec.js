import { test, expect } from '@playwright/test';

/* Chain B — attendance logged by the social worker in /sessions becomes visible
   to the family (/app), the lawyer (/cases) and the facility terminal (/kiosk).

   Tests 1-3 come from the brief. They write to the store with page.evaluate and
   read it back, so on their own they would still pass with the /sessions mirror
   block deleted and with nothing rendered anywhere. Tests 4+ close that hole:
   one drives the real control a social worker taps, and three assert the value
   is actually painted into a named element on each consuming surface. */

test('logging attendance increments the shared count', async ({ page }) => {
  await page.goto('/sessions.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.jomar.pg1', { done: 9, of: 24, lastAt: null, receipt: null });
    window.Elaya.update('attendance.jomar.pg1', a => ({
      ...a, done: a.done + 1, lastAt: '2026-07-29T14:00:00+08:00', receipt: 'a3f1…8c02'
    }));
  });
  const done = await page.evaluate(() => window.Elaya.get('attendance.jomar.pg1.done'));
  expect(done).toBe(10);
});

test('the updated count is visible in /app, /cases and /kiosk', async ({ page }) => {
  await page.goto('/sessions.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.jomar.pg1', {
      done: 10, of: 24, lastAt: '2026-07-29T14:00:00+08:00', receipt: 'a3f1…8c02'
    });
  });

  for (const surface of ['/app.html', '/cases.html', '/kiosk.html']) {
    await page.goto(surface);
    const done = await page.evaluate(() => window.Elaya.get('attendance.jomar.pg1.done'));
    expect(done, `store not readable on ${surface}`).toBe(10);
  }
});

test('a missed-attendance flag on Renz reaches /cases', async ({ page }) => {
  await page.goto('/sessions.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.renz.pg1', { done: 5, of: 12, missStreak: 3, lastAt: null, receipt: null });
    window.Elaya.notify({
      to: 'Mrs. Editha Bautista', body: 'Renz has missed three sessions.',
      surface: 'sessions', personId: 'renz'
    });
  });
  await page.goto('/cases.html');
  const r = await page.evaluate(() => ({
    streak: window.Elaya.get('attendance.renz.pg1.missStreak'),
    notif: window.Elaya.get('notifications')[0].personId
  }));
  expect(r.streak).toBe(3);
  expect(r.notif).toBe('renz');
});

/* ------------------------------------------------------------------ *
 * The control a social worker actually taps                           *
 * ------------------------------------------------------------------ */

/* Open S-3 (log attendance), mark the whole roster present, then flip one
   person to "missed". This is the exact sequence in the demo script. */
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

test('tapping Save on the roster is what writes the attendance records', async ({ page }) => {
  await logSession(page, 'r1');   // r1 is Bautista, Renz A.

  const after = await page.evaluate(() => ({
    renz: window.Elaya.get('attendance.renz.pg1'),
    jomar: window.Elaya.get('attendance.jomar.pg1'),
    notifs: window.Elaya.get('notifications')
  }));

  // Renz was marked missed: his count does not move, his streak does.
  expect(after.renz.done).toBe(5);
  expect(after.renz.of).toBe(12);
  expect(after.renz.missStreak).toBe(4);
  expect(typeof after.renz.receipt).toBe('string');
  expect(after.renz.receipt.length).toBeGreaterThan(0);

  // Jomar was marked present: his count moves and his streak clears.
  expect(after.jomar.done).toBe(5);
  expect(after.jomar.of).toBe(12);
  expect(after.jomar.missStreak).toBe(0);

  const renzNote = after.notifs.find(n => n.personId === 'renz');
  const jomarNote = after.notifs.find(n => n.personId === 'jomar');
  expect(renzNote.to).toBe('Mrs. Editha Bautista');
  expect(jomarNote.to).toBe('Rosa Andres Reyes');
  // An SMS to a parent must use the child's given name, not the surname the
  // roster sorts on.
  expect(renzNote.body).toContain('Renz');
  expect(renzNote.body).not.toContain('Bautista');
  expect(jomarNote.body).toContain('Jomar');
  expect(jomarNote.body).not.toContain('Cruz');
});

test('undo after saving retracts the attendance records too', async ({ page }) => {
  await logSession(page, 'r1');
  expect(await page.evaluate(() => window.Elaya.get('attendance.renz.pg1', null))).not.toBeNull();

  await page.locator('#toastAct').click();

  const after = await page.evaluate(() => ({
    renz: window.Elaya.get('attendance.renz.pg1', 'MISSING'),
    jomar: window.Elaya.get('attendance.jomar.pg1', 'MISSING'),
    notifs: window.Elaya.get('notifications')
  }));
  expect(after.renz).toBeNull();
  expect(after.jomar).toBeNull();
  expect(after.notifs).toEqual([]);
});

/* ------------------------------------------------------------------ *
 * The value has to be rendered, not merely stored                     *
 * ------------------------------------------------------------------ */

test('/app paints the stored attendance, not its seed', async ({ page }) => {
  await page.goto('/app.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.jomar.pg1', {
      done: 5, of: 12, missStreak: 0, lastAt: '2026-07-29T14:00:00+08:00', receipt: 'b7c2…19ff'
    });
  });
  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();

  const body = page.locator('#personBody');
  await expect(body).toContainText('5 of 12 sessions');
  await expect(body).not.toContainText('4 of 12 sessions');   // the seed
  await expect(body).toContainText('b7c2…19ff');
});

test('/cases paints the stored miss streak on the caseload row', async ({ page }) => {
  await page.goto('/cases.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.renz.pg1', {
      done: 5, of: 12, missStreak: 4, lastAt: '2026-07-29T14:00:00+08:00', receipt: 'b7c2…19ff'
    });
  });
  await page.goto('/cases.html');

  const row = page.locator('#c1Scroll .row', { hasText: 'Bautista, Renz A.' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Diversion: 4 missed');   // seed says 3

  await row.click();
  await page.locator('#c2Scroll [data-acc="programs"]').click();
  await expect(page.locator('#c2Scroll')).toContainText('5 of 12 sessions · 4 missed in a row');
});

test('/kiosk paints the stored attendance for the person it was handed', async ({ page }) => {
  await page.goto('/kiosk.html');
  await page.evaluate(() => {
    window.Elaya.reset();
    window.Elaya.set('attendance.jomar.pg1', {
      done: 5, of: 12, missStreak: 0, lastAt: '2026-07-29T14:00:00+08:00', receipt: 'b7c2…19ff'
    });
  });

  // Unbound: the terminal has not been told who is standing at it, so it shows
  // its own persona's seeded counts and nobody else's.
  await page.goto('/kiosk.html');
  await page.evaluate(() => go('programs'));
  await expect(page.locator('#progAtt')).toContainText('8 sa 12');

  // Bound: the facility handed this session to Jomar, so his record is shown
  // under his own name.
  await page.goto('/kiosk.html?person=jomar');
  await page.evaluate(() => go('programs'));
  await expect(page.locator('#progAtt')).toContainText('5 sa 12');
  await expect(page.locator('#sessName')).toContainText('Jomar');
});

/* The whole chain, driven end to end through real controls: the social worker
   taps Save, and the aunt, the lawyer and the boy himself see it. */
test('a session logged in /sessions reaches /app, /cases and /kiosk', async ({ page }) => {
  await logSession(page, 'r1');

  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();
  await expect(page.locator('#personBody')).toContainText('5 of 12 sessions');

  await page.goto('/cases.html');
  await expect(page.locator('#c1Scroll .row', { hasText: 'Bautista, Renz A.' }))
    .toContainText('Diversion: 4 missed');

  await page.goto('/kiosk.html?person=jomar');
  await page.evaluate(() => go('programs'));
  await expect(page.locator('#progAtt')).toContainText('5 sa 12');
});

/* ------------------------------------------------------------------ *
 * Review round 1                                                      *
 * ------------------------------------------------------------------ */

/* A. Adding r16 moved every roster-derived count. Two S-2 filter chips were
   still typed, so they announced "All 15" over 16 names and "Follow-up 3"
   beside four amber rails. */
test('the S-2 roster filter chips are derived from the roster, not typed', async ({ page }) => {
  await page.goto('/sessions.html');
  await page.locator('.tab[data-tab="s2"]').click();
  await page.locator('.utab[data-tab="people"]').click();

  const chips = page.locator('#s2Scroll .fchips');
  const rows = page.locator('#s2Scroll .bandcard .row');
  await expect(chips).toContainText('All ' + await rows.count());

  // Follow-up counts the same people the warn rails and the amber chips mark:
  // never attended, or currently on a miss streak.
  const expected = await page.evaluate(() =>
    ROSTER.filter(r => r.never || r.missStreak >= 1).length);
  expect(expected).toBe(4);                 // r1, r3, r4, r16
  await expect(chips).toContainText('Follow-up ' + expected);
  await expect(chips).toContainText("Won't finish " +
    await page.evaluate(() => ROSTER.filter(r => r.tight).length));
});

test('the cancel-session warning counts the roster it would blank', async ({ page }) => {
  await page.goto('/sessions.html');
  await page.locator('#goLog').click();
  await page.locator('#s3Menu').click();
  const n = await page.evaluate(() => ROSTER.length);
  await expect(page.locator('#sheet')).toContainText('must never record ' + n + ' misses');
});

/* B. The +120 diversion modifier, the warn rail and the NEEDS YOU TODAY band
   are the LSWDO's raised flag — a human judgement, not an arithmetic
   threshold. One logged session moves the count; it does not close the flag.
   The chip must not say otherwise while the flag stands. */
test('/cases never announces the diversion flag resolved while it stands', async ({ page }) => {
  await logSession(page, null);             // everyone present — Renz's streak goes to 0

  await page.goto('/cases.html');
  expect(await page.evaluate(() => window.Elaya.get('attendance.renz.pg1.missStreak'))).toBe(0);

  const row = page.locator('#c1Scroll .row', { hasText: 'Bautista, Renz A.' });
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText('back on track');
  await expect(row).toContainText('Diversion: flag open');

  // The rail and the band follow the seeded score, so they must not have moved.
  await expect(row.locator('.rail')).toHaveClass(/warn/);
  await expect(page.locator('#band-today')).toContainText('Bautista, Renz A.');

  // And the accordion keeps the LSWDO's note: it is a dated historical fact,
  // not a live readout.
  await row.click();
  await page.locator('#c2Scroll [data-acc="programs"]').click();
  await expect(page.locator('#c2Scroll')).toContainText('The LSWDO raised a follow-up flag on 15 Jul');
});

/* C. missStreak is consecutive misses; /app's "hindi nadaluhan" is misses to
   date. Mapping one onto the other made the family card read "0 missed"
   directly above its own note explaining a miss. */
test('/app never contradicts its own note about a missed session', async ({ page }) => {
  await logSession(page, null);             // Jomar present: streak 0, total unchanged

  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();

  const body = page.locator('#personBody');
  await expect(body).toContainText('5 of 12 sessions · 1 missed');
  await expect(body).not.toContainText('· 0 missed');
  await expect(body).toContainText('Hindi siya nakadalo noong Hul 13');
});

/* D. The short receipt on screen and the 64 characters behind Kopyahin have to
   be the same receipt. Handing a judge a hash that does not match the one
   displayed is the one thing this screen exists not to do. */
test('/app copies the receipt it is showing, not the seeded one', async ({ page }) => {
  await logSession(page, null);

  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();

  const shown = await page.locator('#personBody .mono11').innerText();
  const short = shown.split('·').pop().trim();
  const full = await page.locator('#personBody [data-act="copyhash"]').getAttribute('data-hash');

  expect(full).toHaveLength(64);
  expect(short.startsWith(full.slice(0, 4)), `${short} is not the head of ${full}`).toBe(true);
  expect(short.endsWith(full.slice(-4)), `${short} is not the tail of ${full}`).toBe(true);
});

/* ------------------------------------------------------------------ *
 * The store is an enhancement layer, never a dependency               *
 * ------------------------------------------------------------------ */

async function withoutStore(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Elaya', {
      configurable: true, get() { return undefined; }, set() { /* swallow */ }
    });
  });
}

test('/sessions still logs a session with window.Elaya absent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withoutStore(page);
  await page.goto('/sessions.html');
  expect(await page.evaluate(() => window.Elaya)).toBeUndefined();

  await page.locator('#goLog').click();
  await page.locator('#markAll').click();
  await page.locator('#s3Save').click();
  await expect(page.locator('#s3cScroll')).toContainText('INTEGRITY RECEIPT');
  expect(errors).toEqual([]);
});

test('/app, /cases and /kiosk render their seeds with window.Elaya absent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withoutStore(page);

  await page.goto('/app.html#/list');
  await page.locator('[data-person="jomar"]').click();
  await page.locator('[data-ptab="programa"]').click();
  await expect(page.locator('#personBody')).toContainText('4 of 12 sessions');

  await page.goto('/cases.html');
  const row = page.locator('#c1Scroll .row', { hasText: 'Bautista, Renz A.' });
  await expect(row).toContainText('Diversion: 3 missed');

  await page.goto('/kiosk.html?person=jomar');
  await page.evaluate(() => go('programs'));
  await expect(page.locator('#progAtt')).toContainText('8 sa 12');

  expect(errors).toEqual([]);
});

/* ------------------------------------------------------------------ *
 * Two Jomars                                                          *
 * ------------------------------------------------------------------ */

test('the /sessions roster has exactly one Jomar', async ({ page }) => {
  await page.goto('/sessions.html');
  const jomars = await page.evaluate(() =>
    ROSTER.filter(r => /jomar/i.test(r.name)).map(r => r.name));
  expect(jomars).toEqual(['Cruz, Jomar']);
});
