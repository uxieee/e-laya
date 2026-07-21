// eGovPay fires this on every transaction status change. Must be publicly
// reachable, which is why we deploy rather than run on localhost.
// We record and acknowledge; the UI also polls /api/pay?action=status as a
// fallback in case a callback is missed.
import { json, readBody, handler } from "./_lib.js";

export const events = [];

export default handler(async (req, res) => {
  const body = await readBody(req).catch(() => ({}));
  console.log("[pay-callback]", JSON.stringify(body));
  events.push({ at: Date.now(), body });
  return json(res, 200, { ok: true });
});
