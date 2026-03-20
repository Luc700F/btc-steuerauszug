// lib/xpub-scanner.js
import { HDKey }               from "@scure/bip32";
import { p2pkh, p2sh, p2wpkh } from "@scure/btc-signer";
import { detectInputType }     from "./xpub-detector.js";

const MEMPOOL   = "https://mempool.space/api";
const GAP_LIMIT = 20;

const VERSIONS = {
  xpub: { private: 0x0488ade4, public: 0x0488b21e },
  ypub: { private: 0x049d7878, public: 0x049d7cb2 },
  zpub: { private: 0x04b2430c, public: 0x04b24746 },
};

function deriveAddress(xpub, change, index, inputType) {
  const versions = VERSIONS[inputType] ?? VERSIONS.xpub;
  const node     = HDKey.fromExtendedKey(xpub, versions).derive(`m/${change}/${index}`);
  const pubkey   = node.publicKey;
  if (inputType === "zpub") return p2wpkh(pubkey).address;
  if (inputType === "ypub") return p2sh(p2wpkh(pubkey)).address;
  return p2pkh(pubkey).address;
}

async function fetchTxs(address, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const r = await fetch(`${MEMPOOL}/address/${address}/txs`);
    if (r.status === 429) {
      await new Promise(res => setTimeout(res, 1000 * (i + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`mempool ${r.status}: ${address}`);
    return await r.json();
  }
  throw new Error(`Rate limit nach ${retries} Versuchen: ${address}`);
}

async function scanChain(xpub, inputType, change) {
  // Strategie: Erst alle Adressen in Batches von 5 parallel prüfen
  // Sobald 20 leere hintereinander → stopp
  const BATCH = 5;
  const entries = [];
  let gap = 0, index = 0;

  while (gap < GAP_LIMIT) {
    // Batch von bis zu 5 Adressen parallel prüfen
    const batchSize = Math.min(BATCH, GAP_LIMIT - gap + BATCH);
    const batch = Array.from({ length: batchSize }, (_, i) => ({
      address: deriveAddress(xpub, change, index + i, inputType),
      idx: index + i,
    }));

    const results = await Promise.all(
      batch.map(async ({ address, idx }) => ({
        address,
        idx,
        txs: await fetchTxs(address),
      }))
    );

    for (const { address, txs } of results) {
      if (txs.length > 0) {
        entries.push({ address, txs });
        gap = 0;
      } else {
        gap++;
        if (gap >= GAP_LIMIT) break;
      }
    }

    index += batchSize;
    if (gap >= GAP_LIMIT) break;
  }
  return entries;
}

export function isXpubInput(str) {
  if (!str || typeof str !== "string") return false;
  return /^(xpub|ypub|zpub|Zpub|Ypub|Xpub)[a-zA-Z0-9]{100,}$/.test(str.trim());
}

export async function scanXpub(xpub) {
  const key  = xpub.trim();
  const type = detectInputType(key);

  // External und internal sequentiell (nicht parallel) um Rate Limits zu vermeiden
  const external = await scanChain(key, type, 0);
  const internal = await scanChain(key, type, 1);

  const allEntries   = [...external, ...internal];
  const allAddresses = allEntries.map(e => e.address);
  const txMap        = new Map();

  for (const { txs } of allEntries) {
    for (const tx of txs) {
      if (txMap.has(tx.txid)) continue;
      let bal = 0;
      for (const vout of tx.vout ?? [])
        if (allAddresses.includes(vout.scriptpubkey_address)) bal += vout.value ?? 0;
      for (const vin of tx.vin ?? [])
        if (allAddresses.includes(vin.prevout?.scriptpubkey_address)) bal -= vin.prevout?.value ?? 0;
      txMap.set(tx.txid, { ...tx, balance_change: bal });
    }
  }

  return { rawTxs: Array.from(txMap.values()), addresses: allAddresses, xpub: key };
}
