// eGovPay — the statutory FPIC fee the proponent owes before an assembly can convene.
// POST { action: "create", amount, txnid?, label? } -> hosted checkout url
// POST { action: "status", uuid }                   -> payment_status, fees, paid_at
//
// Test-mode token: real rails, test funds. Say exactly that on camera — never
// imply money moved.

import { HOSTS, json, readBody, handler, post, get, payDigest } from "./_lib.js";

export default handler(async (req, res) => {
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  const body = await readBody(req);
  const token = process.env.EGOVPAY_TOKEN;

  if (body.action === "create") {
    // Integer pesos — the digest is computed over this exact string form.
    const amount = Math.round(Number(body.amount || 187400));
    const txnid = body.txnid || `FPIC-2026-0417-${Date.now()}`;
    const origin = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

    const { status, data } = await post(`${HOSTS.pay}/api/v1/transaction`, {
      headers: { "X-eGovPay-Token": token },
      body: {
        amount,
        currency: "PHP",
        txnid,
        digest: payDigest(amount, txnid),
        settlement_template_uuid: process.env.EGOVPAY_SETTLEMENT_UUID,
        items: [{ name: body.label || "FPIC Fee — NCIP-CAR Regional Trust Account", amount }],
        redirect_url: `${origin}/?paid=1&txnid=${encodeURIComponent(txnid)}`,
        callback_url: `${origin}/api/pay-callback`,
      },
    });

    const d = data?.data || {};
    return json(res, status, {
      ok: status < 300,
      uuid: d.uuid || null,
      url: d.url || null,
      refno: d.channel?.refno || null,
      txnid,
      amount,
      error: status >= 300 ? data : undefined,
    });
  }

  if (body.action === "status") {
    if (!body.uuid) return json(res, 400, { ok: false, error: "missing uuid" });
    const { status, data } = await get(`${HOSTS.pay}/api/v1/transaction/${body.uuid}`, {
      "X-eGovPay-Token": token,
    });
    const d = data?.data || data || {};
    return json(res, status, {
      ok: status < 300,
      payment_status: d.payment_status || null,
      paid_at: d.paid_at || null,
      amount: d.amount ?? null,
      data: d,
    });
  }

  return json(res, 400, { ok: false, error: "unknown action" });
});
