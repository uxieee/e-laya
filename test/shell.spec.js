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

/* ==========================================================================
   OCCLUSION — the reviewer bar must not cover page content, on any surface,
   at any viewport width.

   Why this block exists: the only occlusion test this suite had asserted one
   element (app.html's #btnSSO) at one size (390x844) — inside the
   @media(max-width:480px) breakpoint, which is the ONE regime where the old
   JS reserve happened to work. Above 480px the five `.phone` surfaces render
   in a fixed 390x844 device frame that the old findFrame() could never match
   (it required a near-full-viewport-width box), and kiosk.html was skipped at
   every width because it declares html,body{overflow:hidden}. So the bar sat
   on top of the last line of content on every desktop viewport and no test
   could see it.

   The probe below is deliberately layout-agnostic. It does not know what a
   `.phone` or a `#stage` is. It scrolls everything scrollable to the bottom
   (so the bottom-most content is genuinely on screen where the bar can cover
   it), then, for every candidate element, computes the rect that is ACTUALLY
   visible — its own rect intersected with every clipping ancestor and the
   viewport — and reports any that reaches below the bar's top edge.

   Two candidate sets, reported separately, because they fail differently:
   interactive elements (a covered control cannot be tapped) and leaf text
   (covered prose cannot be read). Note it never touches page.locator('body'):
   assertions are on measured rectangles of real elements.
   ========================================================================== */

const OCCLUSION_PROBE = () => {
  window.scrollTo(0, document.documentElement.scrollHeight);
  for (const el of document.querySelectorAll('*')) {
    const oy = getComputedStyle(el).overflowY;
    // Only scroll boxes that are genuinely scrollable. Forcing scrollTop on an
    // overflow:hidden box (a `.phone`, `#stage`) moves content the user can
    // never move and would hide the very defect this is looking for.
    if (oy !== 'auto' && oy !== 'scroll') continue;
    if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
  }

  const bar = document.getElementById('elaya-shell');
  if (!bar) return { bar: null, interactive: null, text: null };
  const b = bar.getBoundingClientRect();

  function visibleRect(el) {
    const r = el.getBoundingClientRect();
    let top = r.top, bottom = r.bottom, left = r.left, right = r.right;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflow === 'visible' && cs.overflowY === 'visible' && cs.overflowX === 'visible') continue;
      const pr = p.getBoundingClientRect();
      top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom);
      left = Math.max(left, pr.left); right = Math.min(right, pr.right);
    }
    return {
      top: Math.max(top, 0), bottom: Math.min(bottom, window.innerHeight),
      left: Math.max(left, 0), right: Math.min(right, window.innerWidth)
    };
  }

  const worst = { interactive: null, text: null };
  for (const el of document.body.querySelectorAll('*')) {
    if (bar.contains(el)) continue;
    const isInteractive = /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
    const isLeafText = !el.children.length && !!(el.textContent || '').trim();
    if (!isInteractive && !isLeafText) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
    const v = visibleRect(el);
    if (v.bottom - v.top < 1 || v.right - v.left < 1) continue;
    if (v.right <= b.left || v.left >= b.right) continue;
    const over = v.bottom - b.top;
    if (over <= 0.5) continue;
    const hit = {
      over: Math.round(over * 10) / 10,
      tag: el.tagName,
      id: el.id || null,
      text: ((el.textContent || '').trim() || el.getAttribute('aria-label') || '').slice(0, 60)
    };
    const key = isInteractive ? 'interactive' : 'text';
    if (!worst[key] || over > worst[key].over) worst[key] = hit;
  }
  return { bar: { top: b.top, height: b.height }, interactive: worst.interactive, text: worst.text };
};

const OCCLUSION_WIDTHS = [
  { name: 'wide desktop',   width: 1440, height: 900 },
  { name: 'narrow desktop', width: 1024, height: 768 },
  { name: 'mobile',         width: 390,  height: 844 }
];

for (const vp of OCCLUSION_WIDTHS) {
  for (const s of SURFACES) {
    test(`the reviewer bar covers nothing on ${s} at ${vp.width}x${vp.height} (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/' + s);
      await expect(page.locator('#elaya-shell')).toBeVisible();
      const r = await page.evaluate(OCCLUSION_PROBE);
      expect(r.bar).not.toBeNull();
      // The bar wraps to two rows on a phone — its height is measured, never
      // assumed, both by the product and here.
      expect(r.bar.height).toBeGreaterThan(0);
      expect(r.interactive,
        `an interactive element is under the reviewer bar on ${s}`).toBeNull();
      expect(r.text,
        `page text is under the reviewer bar on ${s}`).toBeNull();
    });
  }
}

/* The reported case verbatim: /kiosk.html in a very wide window. The kiosk is
   a non-scrolling 1080x1920 stage scaled to fit, so nothing can be scrolled
   out from under the bar — the stage itself has to be fitted into less. */
test('the reviewer bar covers nothing on the kiosk in a 2000px-wide window', async ({ page }) => {
  await page.setViewportSize({ width: 2000, height: 1200 });
  await page.goto('/kiosk.html');
  await expect(page.locator('#elaya-shell')).toBeVisible();
  const r = await page.evaluate(OCCLUSION_PROBE);
  expect(r.interactive).toBeNull();
  expect(r.text).toBeNull();
  // And the whole stage, not merely its text, clears the bar.
  const gap = await page.evaluate(() => {
    const st = document.getElementById('stage').getBoundingClientRect();
    const b = document.getElementById('elaya-shell').getBoundingClientRect();
    return { stageTop: st.top, gap: b.top - st.bottom };
  });
  expect(gap.gap).toBeGreaterThanOrEqual(0);
  expect(gap.stageTop).toBeGreaterThanOrEqual(0);   // never pushed off the top
});

/* A window dragged across the 480px breakpoint and back must end up correct
   both times — the bar re-wraps from one row to two, so the amount of space
   it needs changes, not just the layout that has to give it up. */
test('the reserve survives a resize across the mobile breakpoint and back', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/custody.html');
  await expect(page.locator('#elaya-shell')).toBeVisible();

  const wideBefore = await page.evaluate(OCCLUSION_PROBE);
  expect(wideBefore.interactive).toBeNull();
  expect(wideBefore.text).toBeNull();

  await page.setViewportSize({ width: 400, height: 844 });
  const narrow = await page.evaluate(OCCLUSION_PROBE);
  expect(narrow.interactive).toBeNull();
  expect(narrow.text).toBeNull();
  // The bar really did get taller — otherwise this test is not exercising the
  // recompute it claims to.
  expect(narrow.bar.height).toBeGreaterThan(wideBefore.bar.height);

  await page.setViewportSize({ width: 1400, height: 900 });
  const wideAfter = await page.evaluate(OCCLUSION_PROBE);
  expect(wideAfter.interactive).toBeNull();
  expect(wideAfter.text).toBeNull();
  expect(wideAfter.bar.height).toBeCloseTo(wideBefore.bar.height, 1);
});

/* Reserving space is only ever a loan. Dismissing the bar must hand every
   pixel back — the surface has to be indistinguishable from ?bare=1. */
for (const s of ['custody.html', 'kiosk.html', 'index.html']) {
  test(`dismissing the bar restores ${s}'s original layout exactly`, async ({ page }) => {
    const geometry = () => page.evaluate(() => {
      const el = document.querySelector('.phone') || document.getElementById('stage') ||
                 document.querySelector('footer') || document.body.firstElementChild;
      const r = el.getBoundingClientRect();
      return {
        rect: [Math.round(r.top * 100) / 100, Math.round(r.height * 100) / 100],
        reserveVar: document.documentElement.style.getPropertyValue('--elaya-shell-h'),
        reserveClass: document.documentElement.classList.contains('elaya-reserve')
      };
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/' + s + '?bare=1');
    await expect(page.locator('#elaya-shell')).toHaveCount(0);
    const bare = await geometry();
    // ?bare=1 must leave the layout completely untouched.
    expect(bare.reserveVar).toBe('');
    expect(bare.reserveClass).toBe(false);

    await page.goto('/' + s);
    await expect(page.locator('#elaya-shell')).toBeVisible();
    // The bar must actually have reserved something, or "it restored it"
    // is a claim about nothing.
    const held = await geometry();
    expect(held.reserveClass).toBe(true);
    expect(held.reserveVar).toMatch(/^\d+(\.\d+)?px$/);

    await page.locator('#elaya-shell button[data-act="hide"]').click();
    await expect(page.locator('#elaya-shell')).toHaveCount(0);
    const dismissed = await geometry();

    expect(dismissed.reserveVar).toBe('');
    expect(dismissed.reserveClass).toBe(false);
    expect(dismissed.rect).toEqual(bare.rect);
  });
}

/* The reserve must not clobber a value the surface set for itself. */
test('restoring the reserve puts back a value the surface owns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  /* Set before anything on the page runs — a DOMContentLoaded hook would land
     AFTER the deferred elaya-shell.js has already published, which tests the
     opposite ordering to the one that matters. */
  await page.addInitScript(() => {
    const claim = () => {
      if (!document.documentElement) return false;
      document.documentElement.style.setProperty('--elaya-shell-h', '7px');
      return true;
    };
    if (!claim()) {
      const obs = new MutationObserver(() => { if (claim()) obs.disconnect(); });
      obs.observe(document, { childList: true, subtree: true });
    }
  });
  await page.goto('/custody.html');
  await expect(page.locator('#elaya-shell')).toBeVisible();
  // While the bar is up it publishes its own measured height, overriding the
  // surface's value...
  const held = await page.evaluate(() => ({
    v: document.documentElement.style.getPropertyValue('--elaya-shell-h'),
    barH: document.getElementById('elaya-shell').getBoundingClientRect().height
  }));
  expect(held.v).toBe(held.barH + 'px');

  // ...and on dismissal hands the surface's own value straight back.
  await page.locator('#elaya-shell button[data-act="hide"]').click();
  await expect(page.locator('#elaya-shell')).toHaveCount(0);
  const back = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--elaya-shell-h'));
  expect(back).toBe('7px');
});

/* The store is an enhancement layer; the reserve must not depend on it. */
test('the reserve still clears content with storage blocked and no store', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const boom = { get() { throw new Error('storage blocked'); } };
    Object.defineProperty(window, 'localStorage', boom);
    Object.defineProperty(window, 'sessionStorage', boom);
    document.addEventListener('DOMContentLoaded', () => { delete window.Elaya; });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/cases.html');
  await expect(page.locator('#elaya-shell')).toBeVisible();
  const r = await page.evaluate(OCCLUSION_PROBE);
  expect(r.interactive).toBeNull();
  expect(r.text).toBeNull();
  expect(errors).toEqual([]);
});
