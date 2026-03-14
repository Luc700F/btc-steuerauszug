// ─────────────────────────────────────────────────────────────────────────────
// lib/valorennummern.js
// Zweck: ESTV Valorennummern und CoinGecko IDs für alle unterstützten Assets
// Exports: VALORENNUMMERN, COINGECKO_IDS, getValorennummer(), getCoinGeckoId()
// ─────────────────────────────────────────────────────────────────────────────

/** ESTV Valorennummern für Kryptowährungen (Kursliste der ESTV) */
export const VALORENNUMMERN = {
  // Bitcoin
  BTC:    "3841927",

  // Ethereum + häufige ERC-20 Token
  ETH:    "385539",
  USDC:   "12360981",
  USDT:   "1107203",
  LINK:   "4383521",
  UNI:    "26946817",
  AAVE:   "20775753",
  MKR:    "2655207",
  WBTC:   "14028490",
  DAI:    "19305083",
  MATIC:  "8007389",
  SHIB:   "124609870",
  GRT:    null,
  ENS:    null,
  IMX:    null,
  ARB:    null,
  OP:     null,

  // Solana + SPL Token
  SOL:    "81720700",
  BONK:   null,
  JUP:    null,
  PYTH:   null,

  // Gold/Rohstoff Token
  PAXG:   null,
  XAUT:   null,
  VNXAU:  null,
};

/** CoinGecko Coin-IDs für historische Preisabfragen */
export const COINGECKO_IDS = {
  BTC:    "bitcoin",
  ETH:    "ethereum",
  USDC:   "usd-coin",
  USDT:   "tether",
  LINK:   "chainlink",
  UNI:    "uniswap",
  AAVE:   "aave",
  MKR:    "maker",
  WBTC:   "wrapped-bitcoin",
  DAI:    "dai",
  MATIC:  "matic-network",
  SHIB:   "shiba-inu",
  SOL:    "solana",
  BONK:   "bonk",
  JUP:    "jupiter-exchange-solana",
  PYTH:   "pyth-network",
  PAXG:   "pax-gold",
  XAUT:   "tether-gold",
  VNXAU:  "vnx-gold",
  GRT:    "the-graph",
  ENS:    "ethereum-name-service",
  IMX:    "immutable-x",
  ARB:    "arbitrum",
  OP:     "optimism",
};

/**
 * Gibt die ESTV-Valorennummer für ein Symbol zurück.
 * @param {string} symbol - z.B. "BTC", "ETH"
 * @returns {string|null} Valorennummer oder null wenn unbekannt
 */
export function getValorennummer(symbol) {
  return VALORENNUMMERN[symbol?.toUpperCase()] ?? null;
}

/**
 * Gibt die CoinGecko-ID für ein Symbol zurück.
 * @param {string} symbol - z.B. "BTC", "ETH"
 * @returns {string} CoinGecko-ID oder lowercase symbol als Fallback
 */
export function getCoinGeckoId(symbol) {
  return COINGECKO_IDS[symbol?.toUpperCase()] ?? symbol?.toLowerCase() ?? symbol;
}
