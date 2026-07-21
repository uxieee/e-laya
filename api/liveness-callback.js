// Face Liveness posts here when a hosted session finishes.
import { json, readBody, handler } from "./_lib.js";

export default handler(async (req, res) => {
  const body = await readBody(req).catch(() => ({}));
  console.log("[liveness-callback]", JSON.stringify(body));
  return json(res, 200, { ok: true });
});
