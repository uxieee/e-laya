// eVerify — PhilSys identity.
// POST { action: "qr-check" | "qr-verify" | "demographics", ... }
//
// qr-check    : decode a scanned National ID QR. No selfie needed. Returns
//               demographics + the government's stored photo (base64).
// qr-verify   : Tier II — binds that card to a live face-liveness session.
// demographics: typed-in identity claim, also bound to a liveness session.
//
// PRIVACY RULE (non-negotiable): the response carries full demographics and a
// government photo. Show it, hash what you need, discard the rest. Never persist
// a PhilSys number or a biometric.

import { HOSTS, json, readBody, handler, post, everifyToken, sha256 } from "./_lib.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  const body = await readBody(req);
  const token = await everifyToken();
  const auth = { Authorization: `Bearer ${token}` };

  if (body.action === "qr-check") {
    if (!body.value) return json(res, 400, { ok: false, error: "missing QR value" });
    const { status, data } = await post(`${HOSTS.everify}/api/query/qr/check`, {
      headers: auth,
      body: { value: body.value },
    });
    const d = data?.data || data || {};

    // Three QR types exist. Only "National ID Signed" carries a name and photo —
    // the other two decode to an identifier and nothing else. Tell the UI which
    // one it got so it can degrade honestly instead of rendering a blank card.
    const hasIdentity = Boolean(d.first_name || d.last_name);
    const qrType = hasIdentity ? "NATIONAL_ID_SIGNED" : d.digital_id ? "DIGITAL_ID" : d.pcn ? "PCN_ONLY" : "UNKNOWN";

    return json(res, status, {
      ok: status < 300,
      qrType,
      hasIdentity,
      // Salted hash is what we keep; the PCN itself never leaves this function.
      subjectHash: d.pcn ? sha256(`fpic-2026|${d.pcn}`) : null,
      person: hasIdentity
        ? {
            first_name: d.first_name,
            middle_name: d.middle_name,
            last_name: d.last_name,
            suffix: d.suffix,
            birth_date: d.birth_date,
            sex: d.sex,
            place_of_birth: d.place_of_birth,
            photo: d.photo || d.face || null,
          }
        : null,
      raw: hasIdentity ? undefined : d,
    });
  }

  if (body.action === "qr-verify") {
    const { status, data } = await post(`${HOSTS.everify}/api/query/qr`, {
      headers: auth,
      body: { value: body.value, face_liveness_session_id: body.session_id },
    });
    const d = data?.data || data || {};
    // A face mismatch still returns HTTP 200. Trust `verified`, never the status code.
    return json(res, status, {
      ok: status < 300,
      verified: d.verified === true,
      result_grade: d.result_grade || null,
      data: d,
    });
  }

  if (body.action === "demographics") {
    const { status, data } = await post(`${HOSTS.everify}/api/query`, {
      headers: auth,
      body: {
        first_name: body.first_name,
        middle_name: body.middle_name,
        last_name: body.last_name,
        suffix: body.suffix,
        birth_date: body.birth_date, // YYYY-MM-DD
        face_liveness_session_id: body.session_id,
      },
    });
    const d = data?.data || data || {};
    return json(res, status, { ok: status < 300, verified: d.verified === true, data: d });
  }

  return json(res, 400, { ok: false, error: "unknown action" });
});
