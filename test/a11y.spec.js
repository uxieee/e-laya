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
    const { nested, total } = await page.evaluate((sel) => {
      const all = Array.from(document.querySelectorAll(sel));
      return {
        total: all.length,
        nested: all.filter(e => e.parentElement && e.parentElement.closest(sel))
                   .map(e => (e.textContent || e.getAttribute('aria-label') || '?').trim().slice(0, 40))
      };
    }, INTERACTIVE);
    /* Denominator. `toEqual([])` is satisfied by an empty match set, so a
       selector that silently stopped matching would read as a pass. */
    expect(total, `no interactive elements found at all on ${s}`).toBeGreaterThan(0);
    expect(nested, `nested controls on ${s}`).toEqual([]);
  });

  /* Phone viewport, and #stage is excluded on purpose. kiosk.html draws a fixed
     1080x1920 terminal and scales it to fit the window, so at 390px wide EVERY
     control inside #stage is drawn at 0.36x — measuring them here measures the
     scale factor, not the design, and "fixing" it means inflating boxes that
     then swallow their neighbours at the size the kiosk actually runs at.
     Those controls are asserted below at 1080x1920 instead, unscaled.
     #elaya-shell is NOT excluded: the reviewer bar is real chrome at every
     viewport and stays in scope here and in the 1080x1920 test. */
  test(`${s} has no tap target under 32px at 390x844 (outside #stage)`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/' + s);
    const m = await measureTapTargets(page, '#stage');
    expect(m.total, `no measurable tap targets at all on ${s}`).toBeGreaterThan(0);
    if (m.shellPresent) {
      expect(m.shellMeasured, `the reviewer bar fell out of scope on ${s}`).toBeGreaterThan(0);
    }
    expect(m.small, `small tap targets on ${s}`).toEqual([]);
  });
}

/* Shared measurement. `skipWithin` is a selector whose descendants are ignored;
   pass null to measure everything. */
async function measureTapTargets(page, skipWithin) {
  return page.evaluate(([sel, skip]) => {
    const all = Array.from(document.querySelectorAll(sel))
      .filter(e => {
        if (skip && e.closest(skip)) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    return {
      total: all.length,
      /* R1: the reviewer bar is in scope at every viewport. Reported so the
         tests can assert the exclusion above never starts swallowing it.
         Only its VISIBLE controls count — the bar declares more than it shows
         (e.g. the offline warning), and a hidden control is not a tap target. */
      shellPresent: !!document.getElementById('elaya-shell'),
      shellMeasured: all.filter(e => e.closest('#elaya-shell')).length,
      small: all
        .filter(e => { const r = e.getBoundingClientRect(); return r.height < 32 || r.width < 32; })
        .map(e => {
          const r = e.getBoundingClientRect();
          const label = (e.getAttribute('aria-label') || e.textContent || '?').trim().slice(0, 30);
          return `${label} [${e.id || e.className || e.tagName}] ${Math.round(r.width)}x${Math.round(r.height)}`;
        })
    };
  }, [INTERACTIVE, skipWithin]);
}

/* The coverage the 390px test gives up, taken back at the resolution the
   terminal actually runs at. Nothing is excluded here — the language tiles,
   the nine read-aloud circles, #demodot, the control rail and the reviewer bar
   are all measured, unscaled. */
test('kiosk has no tap target under 32px at its own 1080x1920', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto('/kiosk.html');
  await page.waitForTimeout(300);
  const scale = await page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.getElementById('stage')).transform);
    return m.a;
  });
  expect(scale, 'the stage should be unscaled at its own resolution').toBeCloseTo(1, 2);

  const m = await measureTapTargets(page, null);
  expect(m.total, 'no measurable tap targets at all on kiosk').toBeGreaterThan(0);
  expect(m.shellMeasured, 'the reviewer bar fell out of scope at 1080x1920').toBeGreaterThan(0);
  expect(m.small, 'small tap targets on kiosk at 1080x1920').toEqual([]);

  /* The controls this test exists to cover must actually be among the ones it
     measured, or it is asserting over an empty stage. */
  const covered = await page.evaluate(() =>
    ({ speakers: document.querySelectorAll('.spk').length, demodot: !!document.getElementById('demodot') }));
  expect(covered).toEqual({ speakers: 9, demodot: true });
});

/* The demo dot sits in the same corner as the control rail, and #railmain is
   centre-justified — so #kend ("Tapos na", the end-session control) lands at a
   different x in each of the nine languages. Checking one language proves
   nothing. What must hold is behavioural: every visible part of the End button
   must actually hit the End button.

   Measured across all nine, #kend's right EDGE and the dot do come within
   0px (Bikol) and even cross by 3px (Ilokano) — but that strip is the button's
   own 22px padding, and the label never comes closer than 21px to the dot.
   That geometry is byte-identical to the pre-Task-9 build (verified against
   commit e146b6d), so it is pre-existing and is recorded, not silently
   asserted away. This test pins the part that matters and would fail loudly if
   the dot were ever inflated back over the label. */
test('every visible part of the kiosk end-session control hits it, in all nine languages', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto('/kiosk.html');
  /* LANGS is a top-level `const` in a classic script — reachable as a global
     binding, but not as a property of `window`. */
  const langs = await page.evaluate(() => LANGS.slice());
  expect(langs.length).toBe(9);

  for (const lang of langs) {
    await page.evaluate((l) => { applyLang(l); go('menu'); }, lang);
    await page.waitForTimeout(120);
    const probe = await page.evaluate(() => {
      const end = document.getElementById('kend');
      const r = end.getBoundingClientRect();
      const rg = document.createRange(); rg.selectNodeContents(end);
      const t = rg.getBoundingClientRect();
      const at = (x, y) => {
        const el = document.elementFromPoint(x, y);
        const b = el && el.closest('button');
        return b ? (b.id || b.className) : (el ? el.tagName : 'null');
      };
      return {
        centre:     at((r.left + r.right) / 2, (r.top + r.bottom) / 2),
        labelRight: at(t.right - 1, (t.top + t.bottom) / 2),
        labelLeft:  at(t.left + 1, (t.top + t.bottom) / 2),
        gapToLabel: Math.round(document.getElementById('demodot').getBoundingClientRect().left - t.right)
      };
    });
    expect(probe.centre, `${lang}: #kend centre`).toBe('kend');
    expect(probe.labelRight, `${lang}: #kend label right edge`).toBe('kend');
    expect(probe.labelLeft, `${lang}: #kend label left edge`).toBe('kend');
    expect(probe.gapToLabel, `${lang}: demo dot is within 8px of the End label`).toBeGreaterThan(8);
  }
});

/* Pins the revert. These two boxes were briefly inflated to 96px to satisfy a
   390px-viewport tap-target check; that made .spk intercept a 28px band of the
   language tile and pushed #demodot into #kend. Both are back to the sizes the
   1080x1920 terminal was designed with, and must stay there. */
test('the kiosk keeps its designed control sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.goto('/kiosk.html');
  const boxes = await page.evaluate(() => {
    const R = e => { const r = e.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height)]; };
    const tile = document.querySelector('.ltile').getBoundingClientRect();
    const spk = document.querySelector('.spk').getBoundingClientRect();
    return { spk: R(document.querySelector('.spk')),
             demodot: R(document.getElementById('demodot')),
             /* the speaker must not reach across the tile it sits on */
             spkShareOfTile: Math.round((spk.width / tile.width) * 100) };
  });
  expect(boxes.spk).toEqual([68, 68]);
  expect(boxes.demodot).toEqual([40, 40]);
  expect(boxes.spkShareOfTile).toBeLessThan(25);
});

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
