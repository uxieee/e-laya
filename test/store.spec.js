import { test, expect } from '@playwright/test';

// The store is not yet included by any page, so inject it directly.
// index.html gives us a real http origin, which localStorage requires.
async function withStore(page) {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.clear());
  await page.addScriptTag({ path: '../public/elaya-store.js' });
}

test('seeds a versioned state tree', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => window.Elaya.get('version'));
  expect(v).toBe(1);
});

test('get returns the fallback for a missing path', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => window.Elaya.get('welfare.nobody', 'FALLBACK'));
  expect(v).toBe('FALLBACK');
});

test('set writes a nested path and get reads it back', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    window.Elaya.set('welfare.miguel', { key: 'ok', at: '9:14 AM' });
    return window.Elaya.get('welfare.miguel.key');
  });
  expect(v).toBe('ok');
});

test('update applies a function to the existing value', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    window.Elaya.set('attendance.jomar.pg1', { done: 9, of: 24 });
    window.Elaya.update('attendance.jomar.pg1', a => ({ ...a, done: a.done + 1 }));
    return window.Elaya.get('attendance.jomar.pg1.done');
  });
  expect(v).toBe(10);
});

test('state survives a reload', async ({ page }) => {
  await withStore(page);
  await page.evaluate(() => window.Elaya.set('welfare.miguel', { key: 'ok' }));
  await page.reload();
  await page.addScriptTag({ path: '../public/elaya-store.js' });
  const v = await page.evaluate(() => window.Elaya.get('welfare.miguel.key'));
  expect(v).toBe('ok');
});

test('reset restores seed state', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    window.Elaya.set('welfare.miguel', { key: 'ok' });
    window.Elaya.reset();
    return window.Elaya.get('welfare.miguel', null);
  });
  expect(v).toBeNull();
});

test('a corrupt blob is discarded and re-seeded, not thrown', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => localStorage.setItem('elaya.v1', '{ not json'));
  await page.addScriptTag({ path: '../public/elaya-store.js' });
  const r = await page.evaluate(() => ({
    version: window.Elaya.get('version'),
    degraded: window.Elaya.degraded
  }));
  expect(r.version).toBe(1);
  expect(r.degraded).toBe(false);
});

test('a stale version is discarded and re-seeded', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() =>
    localStorage.setItem('elaya.v1', JSON.stringify({ version: 0, welfare: { miguel: { key: 'ok' } } })));
  await page.addScriptTag({ path: '../public/elaya-store.js' });
  const r = await page.evaluate(() => ({
    version: window.Elaya.get('version'),
    welfare: window.Elaya.get('welfare.miguel', null)
  }));
  expect(r.version).toBe(1);
  expect(r.welfare).toBeNull();
});

test('falls back to memory when localStorage throws', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked'); }
    });
  });
  await page.addScriptTag({ path: '../public/elaya-store.js' });
  const r = await page.evaluate(() => {
    window.Elaya.set('welfare.miguel', { key: 'ok' });
    return { persistent: window.Elaya.persistent, value: window.Elaya.get('welfare.miguel.key') };
  });
  expect(r.persistent).toBe(false);
  expect(r.value).toBe('ok');
});

test('ready runs the callback', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => new Promise(res => window.Elaya.ready(() => res('ran'))));
  expect(v).toBe('ran');
});

test('a throwing update mutator does not throw into the caller', async ({ page }) => {
  await withStore(page);
  const r = await page.evaluate(() => {
    window.Elaya.set('attendance.jomar.pg1', { done: 9, of: 24 });
    let threw = false;
    try {
      window.Elaya.update('attendance.jomar.pg1', () => { throw new Error('boom'); });
    } catch (e) {
      threw = true;
    }
    return {
      threw,
      degraded: window.Elaya.degraded,
      value: window.Elaya.get('attendance.jomar.pg1.done')
    };
  });
  expect(r.threw).toBe(false);
  expect(r.degraded).toBe(true);
  // the failed mutation must not have corrupted or cleared the prior value
  expect(r.value).toBe(9);
});

test('update still applies a non-throwing mutator after a prior throw', async ({ page }) => {
  await withStore(page);
  const v = await page.evaluate(() => {
    window.Elaya.set('attendance.jomar.pg1', { done: 9, of: 24 });
    try {
      window.Elaya.update('attendance.jomar.pg1', () => { throw new Error('boom'); });
    } catch (e) { /* swallow for the test */ }
    window.Elaya.update('attendance.jomar.pg1', a => ({ ...a, done: a.done + 1 }));
    return window.Elaya.get('attendance.jomar.pg1.done');
  });
  expect(v).toBe(10);
});

test('set rejects a __proto__ path segment without polluting Object.prototype', async ({ page }) => {
  await withStore(page);
  const r = await page.evaluate(() => {
    window.Elaya.set('__proto__.polluted', 1);
    window.Elaya.set('welfare.__proto__.polluted', 1);
    return {
      direct: ({}).polluted,
      viaGetFallback: window.Elaya.get('welfare.nobody.polluted', 'MISSING')
    };
  });
  expect(r.direct).toBeUndefined();
  expect(r.viaGetFallback).toBe('MISSING');
});
