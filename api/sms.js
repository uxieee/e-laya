// eMessage — assembly notices and the seal receipt, delivered to feature phones.
// POST { numbers: ["+639..."], message }
//
// This host looks production-grade and texts really send. Two consequences:
//   1. Never point it at a number you don't control.
//   2. It is fire-and-forget — no message id, no delivery status, no rate limit
//      documented. Idempotency is our problem, so identical sends inside the
//      dedupe window are dropped rather than repeated.

import { HOSTS, json, readBody, handler, post, sha256 } from "./_lib.js";

const recent = new Map();
const DEDUPE_MS = 60 * 1000;

function e164(n) {
  const digits = String(n).replace(/[^\d+]/g, "");
  if (digits.startsWith("+63")) return digits;
  if (digits.startsWith("63")) return "+" + digits;
  if (digits.startsWith("0")) return "+63" + digits.slice(1);
  return "+63" + digits;
}

export default handler(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  const { numbers, message } = await readBody(req);
  if (!message) return json(res, 400, { ok: false, error: "missing message" });

  const list = (Array.isArray(numbers) ? numbers : [numbers]).filter(Boolean).map(e164);
  if (!list.length) return json(res, 400, { ok: false, error: "no recipients" });

  const results = [];
  for (const number of list) {
    const key = sha256(number + "|" + message);
    const seen = recent.get(key);
    if (seen && Date.now() - seen < DEDUPE_MS) {
      results.push({ number, status: "skipped-duplicate" });
      continue;
    }
    const { status, data } = await post(`${HOSTS.emessage}/messaging/v1/sms/push`, {
      headers: { "X-EMESSAGE-Auth": process.env.EMESSAGE_TOKEN },
      body: { number, message },
    });
    if (status < 300) recent.set(key, Date.now());
    results.push({ number, status, ok: status < 300, data });
  }

  return json(res, 200, { ok: results.every((r) => r.ok || r.status === "skipped-duplicate"), results });
});
