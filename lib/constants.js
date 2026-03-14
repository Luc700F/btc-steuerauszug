// ─────────────────────────────────────────────────────────────────────────────
// lib/constants.js
// Zweck: Zentrale Konstanten – keine Magic Numbers im Code
// ─────────────────────────────────────────────────────────────────────────────

// ─── Steuer-Steuerjahr-Grenzen ────────────────────────────────────────────────
export const MIN_STEUERJAHR = 2020;
export const MAX_STEUERJAHR = new Date().getFullYear();

// ─── eSteuerauszug Preise (CHF) ───────────────────────────────────────────────
export const ESTEUERAUSZUG_PREIS_CHF       = 2.10; // Basispreis (1 Wallet)
export const ESTEUERAUSZUG_ZUSATZ_CHF      = 1.00; // Aufpreis pro weitere Wallet

// ─── Valorennummern (ESTV Kursliste) ─────────────────────────────────────────
export const VALORENNUMMERN = {
  BTC:   "3841927",
  ETH:   "385539",
  SOL:   "81720700",
  LINK:  "4383521",
  USDC:  "39421646",
  USDT:  "524866",
  DAI:   "35817206",
  WBTC:  "48277170",
  MATIC: "51957869",
  UNI:   "31814862",
  AAVE:  "16221966",
};

// ─── CoinGecko Coin-IDs ───────────────────────────────────────────────────────
export const COINGECKO_IDS = {
  BTC:   "bitcoin",
  ETH:   "ethereum",
  SOL:   "solana",
  LINK:  "chainlink",
  USDC:  "usd-coin",
  USDT:  "tether",
  DAI:   "dai",
  WBTC:  "wrapped-bitcoin",
  MATIC: "matic-network",
  POL:   "matic-network",
  ARB:   "arbitrum",
  OP:    "optimism",
  UNI:   "uniswap",
  AAVE:  "aave",
  MKR:   "maker",
  COMP:  "compound-governance-token",
  SNX:   "synthetix-network-token",
  CRV:   "curve-dao-token",
  LDO:   "lido-dao",
  GRT:   "the-graph",
  ENS:   "ethereum-name-service",
  PAXG:  "pax-gold",
  XAUT:  "tether-gold",
  VNXAU: "vnx-gold",
  SHIB:  "shiba-inu",
  BONK:  "bonk",
  JUP:   "jupiter-exchange-solana",
  PYTH:  "pyth-network",
  RNDR:  "render-token",
  RAY:   "raydium",
  WIF:   "dogwifcoin",
  MSOL:  "msol",
  APE:   "apecoin",
  IMX:   "immutable-x",
  BNB:   "binancecoin",
  AVAX:  "avalanche-2",
  DOT:   "polkadot",
  ADA:   "cardano",
  XRP:   "ripple",
  LTC:   "litecoin",
  BCH:   "bitcoin-cash",
  ATOM:  "cosmos",
  NEAR:  "near",
};

// ─── Blockchain-API Limits ────────────────────────────────────────────────────
export const BTC_MAX_TX_PAGINATION   = 200; // max. Transaktionen via blockchain.info
export const SOL_MAX_SIGNATUREN      = 100; // max. Signaturen via Solana RPC
export const ETH_MAX_TRANSFERS       = 200; // max. Transfers via Alchemy pro Richtung
export const HIST_KURS_MAX_PRO_BATCH = 25;  // max. historische Kursabfragen

// ─── Rate-Limit Pausen (ms) ───────────────────────────────────────────────────
export const CRYPTOCOMPARE_BATCH_PAUSE_MS = 1100; // CryptoCompare: max. 4 req/s
export const SOLANA_TX_PAUSE_MS           = 250;  // Solana RPC Schutzpause
export const BTC_PAGINATION_PAUSE_MS      = 350;  // blockchain.info Schutzpause
