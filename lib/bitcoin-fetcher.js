// ─────────────────────────────────────────────────────────────────────────────
// lib/bitcoin-fetcher.js
// Zweck: Bitcoin-Transaktionen via mempool.space laden + adressgenau filtern
// Exports: fetchAllTransactions, calcAmountForAddress, parseTxsForAddress
// ─────────────────────────────────────────────────────────────────────────────

const MEMPOOL_BASE = "https://mempool.space/api";
const BLOCKSTREAM_BASE = "https://blockstream.info/api";

/**
 * Berechnet den Netto-BTC-Betrag einer Transaktion für eine bestimmte Adresse.
 * Positiv = Eingang, Negativ = Ausgang, 0 = Transaktion nicht relevant.
 * Einheit: BTC (nicht Satoshi) mit 8 Dezimalstellen Präzision.
 *
 * @param {Object} tx - mempool.space Transaktion (vout/vin Format)
 * @param {string} address - Bitcoin-Adresse (bc1q, 1..., 3...)
 * @returns {number} Netto-BTC (positiv = Eingang, negativ = Ausgang)
 */
export function calcAmountForAddress(tx, address) {
  // Eingänge: vout-Outputs die an eigene Adresse gehen
  const received = (tx.vout ?? [])
    .filter((o) => o.scriptpubkey_address === address)
    .reduce((s, o) => s + (o.value ?? 0), 0);

  // Ausgänge: vin-Inputs die von eigener Adresse kommen (via prevout)
  const sent = (tx.vin ?? [])
    .filter((i) => i.prevout?.scriptpubkey_address === address)
    .reduce((s, i) => s + (i.prevout?.value ?? 0), 0);

  const netSatoshi = received - sent;
  return netSatoshi / 1e8; // Satoshi → BTC
}

/**
 * Wandelt rohe mempool.space Transaktionen in steuer-relevante Einträge um.
 * Filtert: unbestätigte TXs, Null-Transaktionen
 * Sortierung: chronologisch (älteste zuerst) für FIFO
 *
 * @param {Array} allTxs - Rohe mempool.space Transaktionen
 * @param {string} address - Bitcoin-Adresse
 * @returns {Array<{txid, date, timestamp, type, amount}>}
 */
export function parseTxsForAddress(allTxs, address) {
  const results = [];

  for (const tx of allTxs) {
    const ts = tx.status?.block_time;
    if (!ts) continue; // Unbestätigt → überspringen

    const net = calcAmountForAddress(tx, address);
    if (Math.abs(net) < 1e-9) continue; // Null-Transaktion → überspringen

    const date = new Date(ts * 1000);
    results.push({
      txid:      tx.txid,
      date:      date.toISOString().substring(0, 10),
      timestamp: ts,
      type:      net > 0 ? "eingang" : "ausgang",
      amount:    Math.abs(net),
    });
  }

  // Chronologisch sortieren (älteste zuerst) für korrektes FIFO
  return results.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Lädt alle bestätigten Transaktionen einer Bitcoin-Adresse via mempool.space.
 * Paginierung: Cursor-basiert via after_txid (max 25 TXs pro Seite).
 * Fallback auf Blockstream bei mempool.space-Fehler.
 *
 * @param {string} address - Bitcoin-Adresse
 * @returns {Promise<Array>} Alle bestätigten Transaktionen (mempool.space Format)
 */
export async function fetchAllTransactions(address) {
  // Primär: mempool.space
  try {
    return await fetchMempoolAllPages(address);
  } catch (e) {
    console.warn(`[BTC] mempool.space fehlgeschlagen für ${address}:`, e.message);
  }

  // Fallback: Blockstream (gleicher Datenformat wie mempool.space)
  console.log(`[BTC] Fallback auf Blockstream für ${address}`);
  return await fetchBlockstreamAllPages(address);
}

// ─── mempool.space Pagination ─────────────────────────────────────────────────
async function fetchMempoolAllPages(address) {
  const allTxs = [];
  let lastTxId = null;
  let page = 1;

  while (true) {
    const url = lastTxId
      ? `${MEMPOOL_BASE}/address/${address}/txs?after_txid=${lastTxId}`
      : `${MEMPOOL_BASE}/address/${address}/txs`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);

    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) break;

    // Nur bestätigte Transaktionen (block_time vorhanden)
    const bestaetigt = txs.filter((tx) => tx.status?.confirmed && tx.status.block_time);
    allTxs.push(...bestaetigt);

    console.log(
      `[BTC] ${address} Seite ${page}: ${txs.length} Txs` +
      ` (${bestaetigt.length} bestätigt, Total: ${allTxs.length})`
    );

    // Letzte Seite: weniger als 25 unbestätigte + bestätigte Txs zurückgegeben
    if (txs.length < 25) break;

    lastTxId = txs[txs.length - 1].txid;
    page++;
    await new Promise((r) => setTimeout(r, 300)); // Rate-Limit-Puffer
  }

  console.log(`[BTC] ${address}: ${allTxs.length} bestätigte Txs (${page} Seiten, mempool.space)`);
  return allTxs;
}

// ─── Blockstream Pagination ───────────────────────────────────────────────────
async function fetchBlockstreamAllPages(address) {
  const allTxs = [];
  let lastTxId = null;
  let page = 1;

  while (true) {
    const url = lastTxId
      ? `${BLOCKSTREAM_BASE}/address/${address}/txs?after_txid=${lastTxId}`
      : `${BLOCKSTREAM_BASE}/address/${address}/txs`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Blockstream HTTP ${res.status}`);

    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) break;

    const bestaetigt = txs.filter((tx) => tx.status?.confirmed && tx.status.block_time);
    allTxs.push(...bestaetigt);

    if (txs.length < 25) break;
    lastTxId = txs[txs.length - 1].txid;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`[BTC] ${address}: ${allTxs.length} bestätigte Txs (${page} Seiten, Blockstream)`);
  return allTxs;
}
