/* Confirm the server the suite is about to talk to is OUR server.
 *
 * playwright.config.js keeps `reuseExistingServer: true` — it is what makes a
 * re-run cheap. But Playwright's own readiness probe only asks whether
 * something answers 200 at the configured URL, and 5173 is Vite's default
 * port: any unrelated dev server left running on this machine satisfies that
 * probe, gets adopted, and then serves a stranger's application to all 130-odd
 * specs. The failures that follow look exactly like product regressions.
 *
 * webServer plugins are started before globalSetup runs (Playwright composes
 * plugin setup ahead of the global-setup tasks), so by the time this executes
 * the server — ours or a squatter's — is up and can be interrogated.
 *
 * One request, no browser.
 */
const MARKER_URL = 'http://127.0.0.1:5173/__harness';
const MARKER = 'e-laya-test-harness';

export default async function globalSetup() {
  let body;
  try {
    const res = await fetch(MARKER_URL);
    body = (await res.text()).trim();
  } catch (e) {
    throw new Error(
      `Could not reach the test harness at ${MARKER_URL}: ${e.message}`);
  }
  if (body !== MARKER) {
    throw new Error(
      `Something other than the e-Laya test harness is listening on ` +
      `127.0.0.1:5173. GET /__harness returned ${JSON.stringify(body.slice(0, 120))} ` +
      `instead of ${JSON.stringify(MARKER)}.\n` +
      `Stop that process (it is most likely a Vite dev server — 5173 is its ` +
      `default port) and run the suite again. Running against it would fail ` +
      `most of the suite in ways that look like product regressions.`);
  }
}
