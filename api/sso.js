// eGov SSO — the front door. Organizers named this as THE eGovPH integration.
//
// Flow: the widget renders login (mobile/email -> SMS OTP -> 6-digit MPIN) and hands
// the browser a single-use exchange_code. The browser posts it here; this function
// swaps it for a partner JWT and resolves the citizen profile. partner_secret never
// reaches the client.
//
// POST { exchange_code } -> { profile }
//
// The exchange code is single-use and short-lived: exchange it immediately. A 422
// almost always means it was already spent (usually by a double-fired callback).

import { HOSTS, json, readBody, handler, post } from "./_lib.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  const { exchange_code } = await readBody(req);
  if (!exchange_code) return json(res, 400, { ok: false, error: "missing exchange_code" });

  const tok = await post(`${HOSTS.sso}/api/token`, {
    body: {
      exchange_code,
      scope: "SSO_AUTHENTICATION",
      partner_code: process.env.SSO_PARTNER_CODE,
      partner_secret: process.env.SSO_PARTNER_SECRET,
    },
  });

  const access = tok.data?.access_token || tok.data?.data?.access_token;
  if (!access) {
    return json(res, tok.status, {
      ok: false,
      stage: "token",
      hint:
        tok.status === 422
          ? "exchange_code invalid or already used — codes are single-use"
          : tok.status === 403
            ? "partner_code / partner_secret rejected"
            : undefined,
      error: tok.data,
    });
  }

  const me = await post(`${HOSTS.sso}/api/partner/sso_authentication`, {
    headers: { Authorization: `Bearer ${access}` },
  });

  const p = me.data?.data || me.data || {};
  return json(res, me.status, {
    ok: me.status < 300,
    profile: {
      first_name: p.first_name ?? p.firstName ?? null,
      middle_name: p.middle_name ?? p.middleName ?? null,
      last_name: p.last_name ?? p.lastName ?? null,
      email: p.email ?? null,
      mobile: p.mobile ?? p.mobile_number ?? null,
    },
    raw: p,
  });
});
