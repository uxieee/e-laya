import { test, expect } from '@playwright/test';

async function withStore(page) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.addScriptTag({ path: '../public/elaya-store.js' });
}

test('on receives change events from set', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    const seen = [];
    window.Elaya.on('change', p => seen.push(p.path));
    window.Elaya.set('welfare.miguel', { key: 'ok' });
    return seen;
  });
  expect(v).toEqual(['welfare.miguel']);
});

test('off removes a handler', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    let n = 0;
    const h = () => n++;
    window.Elaya.on('change', h);
    window.Elaya.set('a', 1);
    window.Elaya.off('change', h);
    window.Elaya.set('b', 2);
    return n;
  });
  expect(v).toBe(1);
});

test('a throwing handler does not break emit', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    let reached = false;
    window.Elaya.on('change', () => { throw new Error('bad handler'); });
    window.Elaya.on('change', () => { reached = true; });
    window.Elaya.set('a', 1);
    return reached;
  });
  expect(v).toBe(true);
});

test('notify appends a notification and emits', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    const seen = [];
    window.Elaya.on('notification', n => seen.push(n.body));
    const rec = window.Elaya.notify({
      to: 'Rosa Reyes', body: 'Miguel is doing OK',
      surface: 'custody', personId: 'miguel'
    });
    return {
      stored: window.Elaya.get('notifications').length,
      body: rec.body,
      hasId: typeof rec.id === 'string' && rec.id.length > 0,
      hasAt: typeof rec.at === 'string' && rec.at.length > 0,
      seen
    };
  });
  expect(v.stored).toBe(1);
  expect(v.body).toBe('Miguel is doing OK');
  expect(v.hasId).toBe(true);
  expect(v.hasAt).toBe(true);
  expect(v.seen).toEqual(['Miguel is doing OK']);
});

test('a write in one tab reaches another tab', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const b = await ctx.newPage();

  for (const p of [a, b]) {
    await p.goto('/index.html');
    await p.addScriptTag({ path: '../public/elaya-store.js' });
  }
  await a.evaluate(() => window.Elaya.reset());

  await b.evaluate(() => {
    window.__seen = null;
    window.Elaya.on('change', () => { window.__seen = window.Elaya.get('welfare.miguel.key', null); });
  });

  await a.evaluate(() => window.Elaya.set('welfare.miguel', { key: 'ok' }));

  await expect.poll(() => b.evaluate(() => window.__seen), { timeout: 5000 }).toBe('ok');
  await ctx.close();
});
