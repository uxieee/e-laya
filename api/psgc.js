// PSGC geography, via eReport's dataset endpoints.
// GET /api/psgc                              -> regions
// GET /api/psgc?region_code=140000000        -> provinces
// GET /api/psgc?province_code=...            -> municipalities
// GET /api/psgc?municipality_code=...        -> barangays
//
// Why it matters here: picking the ancestral domain's barangay from the official
// list means the record carries a canonical PSGC code the agency can match against
// its own map, instead of a free-typed place name nobody can join on.

import { HOSTS, json, handler, get, ereportToken } from "./_lib.js";

export default handler(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const q = Object.fromEntries(url.searchParams);
  const token = await ereportToken();
  const auth = { Authorization: `Bearer ${token}` };

  let path, level;
  if (q.municipality_code) {
    path = `datasets/barangays?municipality_code=${q.municipality_code}`;
    level = "barangays";
  } else if (q.province_code) {
    path = `datasets/municipalities?province_code=${q.province_code}`;
    level = "municipalities";
  } else if (q.region_code) {
    path = `datasets/provinces?region_code=${q.region_code}`;
    level = "provinces";
  } else {
    path = "datasets/regions";
    level = "regions";
  }

  const { status, data } = await get(`${HOSTS.ereport}/api/integration/${path}`, auth);

  // JSON:API shape -> flat {code,name} the dropdowns can bind to directly.
  const items = (data?.data || []).map((r) => ({ code: r.id, name: r.attributes?.name }));
  return json(res, status, { ok: status < 300, level, items });
});
