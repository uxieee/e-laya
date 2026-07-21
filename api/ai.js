// eGov AI — document extraction, translation and read-aloud.
//
// The DOCUMENT EXTRACTOR is the workhorse of the age-verification module. RA 9344
// IRR Rule 35.b(1) tells the apprehending officer to "obtain documents that show
// proof of the child's age" — birth certificate, baptismal certificate, school
// records, dental records, travel papers. Almost no stray child carries a National
// ID; nearly all of them can produce *some* paper eventually. This endpoint reads
// whatever paper surfaces and returns a date of birth.
//
// POST multipart/form-data, single field `file`  -> document extraction
// POST { action: "translate", text, source_lang?, target_lang? }
// POST { action: "speech", text }
// POST { action: "laws", question }
// GET  /api/ai?credits=1
//
// HARD BUDGET: 200 credits for the whole team, for the whole event. Every response
// is cached by content hash so a rehearsal costs nothing the second time. Do not
// remove this cache to "make it feel live" — you will run the team out of credits
// mid-demo. (Multipart uploads are cached on the hash of the file bytes.)

import { HOSTS, json, readBody, handler, post, get, aiToken, sha256 } from "./_lib.js";

const memo = new Map();

// The extractor returns one HTML-ish string, not structured JSON, and it invents
// its own field labels per document. Split tolerantly; never assume a schema.
function splitFields(text) {
  if (!text) return [];
  const flat = String(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?b>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\|/g, "\n");
  const out = [];
  for (const line of flat.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const i = t.indexOf(":");
    if (i > 0 && i < 60) out.push([t.slice(0, i).trim(), t.slice(i + 1).trim()]);
  }
  return out;
}

const MONTH = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
function toISO(y, m, d) {
  if (!y || !m || !d || m > 12 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m;
  if ((m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) return toISO(+m[1], +m[2], +m[3]);
  if ((m = t.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/)))
    return toISO(+m[3], MONTH[m[2].slice(0, 3).toLowerCase()], +m[1]);
  if ((m = t.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)))
    return toISO(+m[3], MONTH[m[1].slice(0, 3).toLowerCase()], +m[2]);
  if ((m = t.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/))) return toISO(+m[3], +m[2], +m[1]);
  return null;
}
// Only a *birth* field may become an age basis. A commitment date or a hearing
// date must never be mistaken for a date of birth.
function findDOB(fields) {
  for (const [k, v] of fields) {
    if (/birth|kapanganakan|natawo|nayanak|b-?day|dob/i.test(k) && !/place|lugar|pook/i.test(k)) {
      const iso = parseDate(v);
      if (iso) return { iso, label: k, raw: v };
    }
  }
  return null;
}

export const config = { api: { bodyParser: false } };

export default handler(async (req, res) => {
  const token = await aiToken();
  const auth = { Authorization: `Bearer ${token}` };

  if (req.method === "GET") {
    const { status, data } = await get(`${HOSTS.ai}/api/v1/egov/integration/credits`, auth);
    return json(res, status, { ok: status < 300, ...data });
  }

  // ---- Document Extractor: multipart/form-data, single field `file` ----------
  // Forwarded byte-for-byte with the original boundary. Nothing is stored here.
  const ctype = String(req.headers["content-type"] || "");
  if (ctype.startsWith("multipart/form-data")) {
    let raw = Buffer.isBuffer(req.body) ? req.body : null;
    if (!raw) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      raw = Buffer.concat(chunks);
    }
    const key = "doc:" + sha256(raw.toString("base64"));
    if (memo.has(key)) return json(res, 200, { ...memo.get(key), cached: true });

    const r = await fetch(`${HOSTS.ai}/api/v1/egov/integration/document_extractor/generate`, {
      method: "POST",
      headers: { ...auth, "Content-Type": ctype, Accept: "application/json" },
      body: raw,
    });
    const body = await r.text();
    let data;
    try { data = JSON.parse(body); } catch { data = { raw: body }; }

    const text = data?.data ?? data?.extracted ?? data?.raw ?? "";
    const fields = splitFields(text);
    const dob = findDOB(fields);
    const out = {
      ok: r.status < 300,
      action: "document_extract",
      text: typeof text === "string" ? text : JSON.stringify(text),
      fields,
      dob: dob ? dob.iso : null,
      dobLabel: dob ? dob.label : null,
      dobRaw: dob ? dob.raw : null,
    };
    if (out.ok) memo.set(key, out);
    return json(res, r.status, out);
  }

  const body = await readBody(req);
  const key = sha256(JSON.stringify(body));
  if (memo.has(key)) return json(res, 200, { ...memo.get(key), cached: true });

  let path, payload;
  if (body.action === "translate") {
    path = "translator/generate";
    payload = {
      prompt: body.text,
      source_lang: body.source_lang || "en",
      target_lang: body.target_lang || "fil",
    };
  } else if (body.action === "speech") {
    path = "speech_maker/generate";
    payload = { prompt: body.text, category: "PH" };
  } else if (body.action === "laws") {
    path = "laws_and_regulations/generate";
    payload = { prompt: body.question, category: "PH" };
  } else {
    return json(res, 400, { ok: false, error: "unknown action" });
  }

  const { status, data } = await post(`${HOSTS.ai}/api/v1/egov/integration/${path}`, {
    headers: auth,
    body: payload,
  });

  const out = {
    ok: status < 300,
    action: body.action,
    translated: data?.translated_prompt ?? null,
    transliterated: data?.transliterated_prompt ?? null,
    data: data?.data ?? data,
  };
  if (out.ok) memo.set(key, out);
  return json(res, status, out);
});
