// eGovChain — READ ONLY, and that is a property of the node, not a choice.
//
// Verified 2026-07-22: txpool_besuStatistics reports {"maxSize":0}. The pool is
// enabled but has zero capacity, so eth_sendRawTransaction always returns
// -32002 "Transaction pool not enabled". A tx sent with gasPrice>0 returns
// -32004 "Upfront cost exceeds account balance", which proves our transactions
// are well-formed and reach the accounting stage before being dropped.
//
// So: never claim on camera that a record was anchored here. This endpoint
// exposes live chain state only, which IS real and IS verifiable by a judge.
import { HOSTS, json, handler } from "./_lib.js";

async function rpc(method, params = []) {
  const r = await fetch(HOSTS.chain, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  return j.result ?? { error: j.error };
}

export default handler(async (_req, res) => {
  const [chainId, block, peers, pool] = await Promise.all([
    rpc("eth_chainId"),
    rpc("eth_blockNumber"),
    rpc("net_peerCount"),
    rpc("txpool_besuStatistics"),
  ]);
  return json(res, 200, {
    ok: true,
    chainId: parseInt(chainId, 16),
    blockNumber: parseInt(block, 16),
    peers: parseInt(peers, 16),
    explorer: "https://hackathon-explorer.e.gov.ph",
    writable: Number(pool?.maxSize ?? 0) > 0,
    note: "Public read node: transaction pool capacity is 0, so writes are not accepted.",
  });
});
