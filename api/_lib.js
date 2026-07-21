// Shared helpers for the Lupang Ninuno Ledger API proxies.
// Every government secret stays on this side of the wire.

import crypto from "node:crypto";

export const HOSTS = {
  sso: "https://hackathon-sso.e.gov.ph",
  everify: "https://hackathon-everify-api.e.gov.ph",
  liveness: "https://hackathon-face-liveness-api.e.gov.ph",
  emessage: "https://ws-message.e.gov.ph",
  ai: "https://egov-ai-core-ws.oueg.info",
  pay: "https://egovpay-pgi-ws-dev.oueg.info",
  ereport: "https://stg-ereport-ws.oueg.info",
  chain: "https://hackathon-blockchain.e.gov.ph",
};

export function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// Wraps a handler so an upstream failure never renders as a blank screen on camera.
export function handler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error("[handler]", err);
      json(res, 502, { ok: false, error: String(err.message || err) });
    }
  };
}

async function post(url, { headers = {}, body } = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: r.status, ok: r.ok, data };
}

async function get(url, headers = {}) {
  const r = await fetch(url, { headers });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: r.status, ok: r.ok, data };
}

export { post, get };

// ---- token caches -----------------------------------------------------------
// Warm serverless instances reuse these, so a demo run makes one auth call, not ten.
const cache = new Map();

async function cached(key, ttlMs, mint) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await mint();
  cache.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

export function everifyToken() {
  // eVerify tokens live ~30 min; refresh at 20 to stay clear of the edge.
  return cached("everify", 20 * 60 * 1000, async () => {
    const { data } = await post(`${HOSTS.everify}/api/auth`, {
      body: {
        client_id: process.env.EVERIFY_CLIENT_ID,
        client_secret: process.env.EVERIFY_CLIENT_SECRET,
      },
    });
    const token = data?.data?.access_token;
    if (!token) throw new Error("eVerify auth failed: " + JSON.stringify(data));
    return token;
  });
}

export function aiToken() {
  return cached("ai", 60 * 60 * 1000, async () => {
    const { data } = await post(`${HOSTS.ai}/api/v1/egov/integration/token`, {
      body: { access_code: process.env.EGOVAI_ACCESS_CODE },
    });
    if (!data?.access_token) throw new Error("eGovAI auth failed: " + JSON.stringify(data));
    return data.access_token;
  });
}

export function ereportToken() {
  return cached("ereport", 60 * 60 * 1000, async () => {
    const { data } = await post(`${HOSTS.ereport}/api/integration/token`, {
      body: { access_code: process.env.EREPORT_TOKEN },
    });
    if (!data?.access_token) throw new Error("eReport auth failed: " + JSON.stringify(data));
    return data.access_token;
  });
}

// ---- eGovPay digest ---------------------------------------------------------
// VERIFIED BY EXPERIMENT, 2026-07-22 ~00:10.
// The docs say hash_hmac('sha256', "$amount|$txnid", $token). The key is the token
// with the "test_" prefix STRIPPED. Sending the full token returns
// 422 {"digest":["The digest is not valid."]}. Amount is the plain integer string.
export function payDigest(amount, txnid) {
  const key = (process.env.EGOVPAY_TOKEN || "").replace(/^test_/, "");
  return crypto.createHmac("sha256", key).update(`${amount}|${txnid}`).digest("hex");
}

// Canonical JSON so a seal hash is reproducible by anyone, in any language.
export function canonical(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(obj[k]))
      .join(",") +
    "}"
  );
}

export function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}
