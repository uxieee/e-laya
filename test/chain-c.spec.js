import { test, expect } from '@playwright/test';

/* ------------------------------------------------------------------ *
 * Chain C — a determination in /verify creates a person               *
 *                                                                     *
 * These tests drive the REAL determination flow. Nothing here writes  *
 * to the store with page.evaluate and reads it straight back; a test  *
 * that did would pass even if /verify never published anything.       *
 *                                                                     *
 * The flow: pick a demo case (the documented number keys are wired to *
 * a real keydown listener -> openCase), confirm the identity check on *
 * S-V2, tap the CTA through to S-V4, then send the three statutory    *
 * notifications. Sending is the moment the determination is recorded. *
 * ------------------------------------------------------------------ */

/** Drive /verify end to end for one of the demo cases. */
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

const readStore = page => page.evaluate(() => ({
  dets: window.Elaya.get('determinations', {}),
  people: window.Elaya.get('people', {})
}));

test('the real /verify flow records a CICL determination and a person', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());

  await determine(page, '1');                       // case a — child at the incident date

  const { dets, people } = await readStore(page);
  const ids = Object.keys(dets);
  expect(ids).toHaveLength(1);
  expect(dets[ids[0]].category).toBe('CICL');
  expect(dets[ids[0]].age).toBe(16);
  expect(dets[ids[0]].by).toBe('LSWDO Batangas City');
  expect(people[ids[0]].full).toBe('Juan Dela Cruz Jr.');
  expect(errors).toEqual([]);
});

test('an adult determination records PDL, not CICL', async ({ page }) => {
  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());

  await determine(page, '2');                       // case b — adult, 18 or over

  const { dets, people } = await readStore(page);
  const ids = Object.keys(dets);
  expect(ids).toHaveLength(1);
  expect(dets[ids[0]].category).toBe('PDL');
  expect(dets[ids[0]].age).toBe(34);
  expect(people[ids[0]].full).toBe('Roberto Silva Aguinaldo');
});

test('the determination survives the navigation to another surface', async ({ page }) => {
  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');

  await page.goto('/cases.html');
  const after = await readStore(page);
  const ids = Object.keys(after.dets);
  expect(ids).toHaveLength(1);
  expect(after.people[ids[0]].full).toBe('Juan Dela Cruz Jr.');
});

test('the new person is rendered as a case in /cases', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');

  await page.goto('/cases.html');
  // Scoped to the rendered caseload list. #c1Scroll holds only rows that
  // renderC1 wrote — unlike body.textContent, which also carries the inline
  // <script> source and would match on the seed data in it.
  const row = page.locator('#c1Scroll .row', { hasText: 'Cruz, Juan Dela' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('CICL 16');
  await row.click();
  await expect(page.locator('#c2Scroll')).toContainText('CRUZ, JUAN DELA');
  await expect(page.locator('#c2Scroll')).toContainText('Determined a child in conflict with the law — 16 years old');
  await expect(page.locator('#c2Scroll')).toContainText('LSWDO Batangas City');
  expect(errors).toEqual([]);
});

test('the new person is rendered in /app as a linked person', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');

  await page.goto('/app.html#/list');
  const card = page.locator('#listBody [data-person="intake-VF-8241"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Juan C.');
  // The link is not a confirmed family relationship — it must not claim to be.
  await expect(card).toContainText('Naitala sa intake · hinihintay ang kumpirmasyon');
  await expect(card).toContainText('Wala pang update');
  await card.click();
  await expect(page.locator('#personBody')).toContainText('Juan Dela Cruz Jr.');
  expect(errors).toEqual([]);
});

test('the guardian is notified, and /app shows the abiso', async ({ page }) => {
  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');

  const notes = await page.evaluate(() => window.Elaya.get('notifications', []));
  expect(notes.length).toBeGreaterThan(0);
  expect(notes[0].surface).toBe('verify');
  expect(notes[0].to).toContain('Maria Dela Cruz');
  // The pre-existing "Batangas City, Batangas City" doubling in smsText must
  // not be propagated into the new copy.
  expect(notes[0].body).not.toMatch(/Batangas City,\s*Batangas City/);

  await page.goto('/app.html#/notifs');
  await expect(page.locator('#notifsBody')).toContainText('Juan');
});

test('re-running the same determination does not accumulate people', async ({ page }) => {
  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());

  await determine(page, '1');
  await determine(page, '1');
  await determine(page, '1');

  const { dets, people } = await readStore(page);
  expect(Object.keys(dets)).toHaveLength(1);
  // Three cast members plus exactly one intake person.
  expect(Object.keys(people).filter(id => id.indexOf('intake') === 0)).toHaveLength(1);

  await page.goto('/cases.html');
  await expect(page.locator('#c1Scroll .row', { hasText: 'Cruz, Juan Dela' })).toHaveCount(1);
});

test('two different determinations produce two different people', async ({ page }) => {
  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());

  await determine(page, '1');
  await determine(page, '2');

  const { dets } = await readStore(page);
  const cats = Object.keys(dets).sort().map(id => dets[id].category).sort();
  expect(cats).toEqual(['CICL', 'PDL']);
});

test('a person nobody could name still becomes a case, and stays out of /app', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '6');                       // case e — nothing resolved

  const { dets, people } = await readStore(page);
  const id = Object.keys(dets)[0];
  expect(dets[id].category).toBe('CICL');           // Rule 35.c — doubt favours minority
  expect(dets[id].age).toBeNull();
  expect(people[id].full).toMatch(/^Unidentified person · VF-/);

  await page.goto('/cases.html');
  const row = page.locator('#c1Scroll .row', { hasText: 'Unidentified · VF-' });
  await expect(row).toHaveCount(1);
  await expect(row).not.toContainText('null');
  await row.click();
  await expect(page.locator('#c2Scroll')).not.toContainText('null');
  await expect(page.locator('#c2Scroll')).toContainText('age not established');

  // Nobody claimed this person, so no guardian was notified and the family app
  // must not hand a stranger to whoever happens to be reading it.
  await page.goto('/app.html#/list');
  await expect(page.locator('#listBody')).not.toContainText('Naitala sa intake');
  expect(errors).toEqual([]);
});

test('the case a determination opens never names the city twice', async ({ page }) => {
  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');

  await page.goto('/cases.html');
  await page.locator('#c1Scroll .row', { hasText: 'Cruz, Juan Dela' }).click();
  const header = page.locator('#c2Scroll .dhead');
  await expect(header).toContainText('Batangas City');
  await expect(header).not.toContainText(/Batangas City,\s*Batangas City/);
  // The whole detail pane, not just the header the suffix is appended in.
  await expect(page.locator('#c2Scroll')).not.toContainText(/Batangas City,\s*Batangas City/);
});

/* A real session must never be filed under a demo scenario's reference. The
   reference IS the identity a determination is stored under, so a collision
   silently overwrites one person with another. Driven deterministically: the
   manual claim path is walked with real controls after a reload, which is the
   case that used to collide with certainty. */
test('a manually entered session does not overwrite a demo scenario', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');                        // scenario a, reference VF-8241

  // A reload puts S.ref back to VF-8241 — the certain case, not the chancy one.
  await page.goto('/verify.html');
  await page.waitForFunction(() => typeof window.openCase === 'function');
  expect(await page.evaluate(() => S.ref)).toBe('VF-8241');

  await page.locator('#s-entry .tri button').first().click();          // a person just brought in
  await expect(page.locator('#s-step1')).toHaveClass(/\bon\b/);
  const manualRef = await page.evaluate(() => S.ref);
  expect(manualRef).not.toBe('VF-8241');
  expect(['VF-8241','VF-8242','VF-8243','VF-8244','VF-8245',
          'VF-8246','VF-8247','VF-8248','VF-8249']).not.toContain(manualRef);

  await page.locator('#s-step1 .fbar .btn').click();                   // continue
  await page.locator('#s-what .tri button').nth(2).click();            // a name and a claimed birth date
  await expect(page.locator('#s-claim')).toHaveClass(/\bon\b/);
  await page.locator('#cLast').fill('Bituin');                         // a different person entirely
  await page.locator('#s-claim .fbar .btn').click();                   // confirm this claim
  await expect(page.locator('#s-v2')).toHaveClass(/\bon\b/, { timeout: 15000 });

  // The claim path must not have adopted the scenario reference it classified as.
  expect(await page.evaluate(() => S.ref)).toBe(manualRef);

  await expect(page.locator('#idmBtns')).toHaveClass(/\blive\b/);
  await page.locator('#idmYes').click();
  await page.locator('#v2foot .btn').click();
  await page.locator('#sendBtn').click();
  await expect(page.locator('#s-done')).toHaveClass(/\bon\b/, { timeout: 15000 });

  const { dets, people } = await readStore(page);
  expect(Object.keys(dets)).toHaveLength(2);
  const names = Object.keys(dets).map(id => people[id].full).sort();
  expect(names).toEqual(['Juan Bituin', 'Juan Dela Cruz Jr.']);

  await page.goto('/cases.html');
  await expect(page.locator('#c1Scroll .row', { hasText: 'Cruz, Juan Dela' })).toHaveCount(1);
  await expect(page.locator('#c1Scroll .row', { hasText: 'Bituin, Juan' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

/* linkedPeople() is dynamic where PEOPLE was static, so person() can now come
   back undefined — a Reset demo in another tab while /app sits on a store
   person. renderPerson() throwing inside renderLive's catch is what leaves
   A-4 on screen with its controls still live, so every control that
   dereferences person() has to survive being tapped in that state. */
test('/app does not throw when the person on screen disappears', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto('/verify.html');
  await page.evaluate(() => window.Elaya.reset());
  await determine(page, '1');

  await page.goto('/app.html#/list');
  await page.locator('#listBody [data-person="intake-VF-8241"]').click();
  // The Programa tab, so the enrolment route is on screen too when the person
  // vanishes. welfareHTML sits above the tabs, so its chips stay either way.
  await page.locator('[data-ptab="programa"]').click();
  await expect(page.locator('#personBody')).toContainText('Wala pa siyang programa.');

  // While the person is there, both A-4 controls do their real jobs.
  await page.locator('#personBody [data-act="visit"]').click();
  await expect(page.locator('#sheet')).toContainText('Bahay Pag-asa, Batangas City');
  await page.locator('#sheet [data-act="closesheet"]').click();
  await page.locator('#personBody [data-act="ref"]').click();
  await expect(page.locator('#toastMsg')).toHaveText('Sanggunian Blg. VF-8241');

  // Another tab hits Reset demo. A-4 stays up — renderPerson throws into
  // renderLive's catch — so these two buttons are still on screen and live.
  await page.evaluate(() => window.Elaya.reset());
  expect(await page.evaluate(() =>
    Object.keys(window.Elaya.get('people', {})).some(id => id.indexOf('intake') === 0))).toBe(false);
  await expect(page.locator('#s-person')).toHaveClass(/\bon\b/);

  await page.locator('#personBody [data-act="ref"]').click();
  await expect(page.locator('#toastMsg')).toHaveText('Nawala ang taong ito sa listahan mo. Buksan ulit ang pahina.');

  await page.locator('#personBody [data-act="visit"]').click();
  await expect(page.locator('#sheet')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#toastMsg')).toHaveText('Nawala ang taong ito sa listahan mo. Buksan ulit ang pahina.');

  // And the enrolment path the same person could already have opened.
  await page.locator('#personBody [data-act="programs"]').click();
  await page.locator('#programsBody [data-prog="div-b"]').click();
  await page.locator('#progdetailFoot .btn').click();
  await expect(page.locator('#sheet')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#toastMsg')).toHaveText('Nawala ang taong ito sa listahan mo. Buksan ulit ang pahina.');

  expect(errors).toEqual([]);
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

test('/verify still records a determination with window.Elaya absent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withoutStore(page);
  await determine(page, '1');
  expect(await page.evaluate(() => window.Elaya)).toBeUndefined();
  await expect(page.locator('#sentList')).toContainText('Maria Dela Cruz');
  expect(errors).toEqual([]);
});

test('/cases and /app render their seeds with window.Elaya absent', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withoutStore(page);

  await page.goto('/cases.html');
  await expect(page.locator('#c1Scroll .row', { hasText: 'Bautista, Renz A.' })).toHaveCount(1);
  // Nothing a determination created can be here: there is no store to read.
  await expect(page.locator('#c1Scroll')).not.toContainText('Cruz, Juan Dela');

  await page.goto('/app.html#/list');
  await expect(page.locator('#listBody [data-person="miguel"]')).toHaveCount(1);
  await expect(page.locator('#listBody')).not.toContainText('Naitala sa intake');

  expect(errors).toEqual([]);
});
