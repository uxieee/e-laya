// Face Liveness.
// POST { action: "session" }            -> { token, url }  hosted liveness page
// POST { action: "result", token }      -> { status, confidence_score, passed }
//
// The hosted URL flow is deliberate: the community member completes liveness on
// the operator's phone via a link, so no resident needs the app installed.
//
// The docs are explicit that anything under 95 confidence is a spoof risk, so the
// threshold is enforced HERE rather than in the browser where it could be edited.

import { HOSTS, json, readBody, handler, post, get } from "./_lib.js";

const MIN_CONFIDENCE = 95.0;

export default handler(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  const body = await readBody(req);
  const key = { "x-api-key": process.env.LIVENESS_API_KEY };

  if (body.action === "session") {
    const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const { status, data } = await post(`${HOSTS.liveness}/v1/liveness/session`, {
      headers: key,
      body: {
        action: body.mode || "close",
        callback_url: body.callback_url || `${origin}/api/liveness-callback`,
        delay: 0,
      },
    });
    return json(res, status, { ok: status < 300, token: data?.token, url: data?.url });
  }

  if (body.action === "result") {
    if (!body.token) return json(res, 400, { ok: false, error: "missing session token" });
    const { status, data } = await get(`${HOSTS.liveness}/v1/liveness/result/${body.token}`, key);
    const score = Number(data?.confidence_score ?? 0);
    const passed = data?.status === "SUCCEEDED" && score >= MIN_CONFIDENCE;
    return json(res, status, {
      ok: status < 300,
      passed,
      status: data?.status || null,
      confidence_score: score,
      threshold: MIN_CONFIDENCE,
      // Pre-signed and short-lived — fine to show on screen, useless to store.
      reference_image_url: data?.reference_image_url || null,
    });
  }

  return json(res, 400, { ok: false, error: "unknown action" });
});
