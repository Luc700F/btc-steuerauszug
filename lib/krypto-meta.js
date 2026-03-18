// ─────────────────────────────────────────────────────────────────────────────
// lib/krypto-meta.js
// Kryptowährungs-Metadaten für eCH-0196 v2.2.0 XML
//
// Valorennummern nach ESTV Kursliste:
//   BTC  = 3841927   (Bitcoin)
//   ETH  = 24476758  (Ether)
//   SOL  = 130548049 (Solana)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kryptowährungs-Metadaten für eCH-0196 v2.2.0.
 * Keys: Blockchain-Bezeichner (btc, eth, sol) – lowercase.
 *
 * @type {Object.<string, {valorNumber: string, securityName: string, securityCategory: string, quotationType: string, country: string}>}
 */
export const KRYPTO_META = {
  btc: {
    valorNumber:      "3841927",
    securityName:     "Bitcoin (BTC)",
    securityCategory: "CRYPTO",
    quotationType:    "PIECE",
    country:          "CH",
  },
  eth: {
    valorNumber:      "24476758",
    securityName:     "Ether (ETH)",
    securityCategory: "CRYPTO",
    quotationType:    "PIECE",
    country:          "CH",
  },
  sol: {
    valorNumber:      "130548049",
    securityName:     "Solana (SOL)",
    securityCategory: "CRYPTO",
    quotationType:    "PIECE",
    country:          "CH",
  },
};

/**
 * Gibt die Metadaten für eine Blockchain zurück.
 * Fallback: BTC-Metadaten wenn unbekannte Blockchain.
 *
 * @param {string} blockchain - 'btc' | 'bitcoin' | 'eth' | 'ethereum' | 'sol' | 'solana'
 * @returns {{ valorNumber: string, securityName: string, securityCategory: string, quotationType: string, country: string }}
 */
export function getKryptoMeta(blockchain) {
  const key = normalizeBlockchain(blockchain);
  return KRYPTO_META[key] ?? KRYPTO_META.btc;
}

/**
 * Normalisiert Blockchain-Bezeichner auf den kurzen Key (btc/eth/sol).
 *
 * @param {string} blockchain
 * @returns {'btc'|'eth'|'sol'}
 */
export function normalizeBlockchain(blockchain) {
  const b = (blockchain || "").toLowerCase();
  if (b === "bitcoin"  || b === "btc") return "btc";
  if (b === "ethereum" || b === "eth") return "eth";
  if (b === "solana"   || b === "sol") return "sol";
  return "btc";
}
