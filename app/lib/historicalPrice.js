// ─── Zentrale Bibliothek für historische CHF-Kurse ───────────────────────────
// 4-stufiges Fallback-System:
// Stufe 1: CoinMarketCap Historical (bester Kurs, Key nötig)
// Stufe 2: CryptoCompare histoday (kostenlos, hohes Limit)
// Stufe 3: CoinGecko (kostenlos, niedriges Limit, mit Retry)
// Stufe 4: Mempool.space (nur BTC, sehr zuverlässig)
// Wenn alle fehlschlagen: null – NIEMALS 0 oder aktuellen Kurs

// In-Memory-Cache für die Laufzeit der Serverinstanz
// Schlüssel: "BTC-2026-01-07" → Wert: CHF-Kurs (number | null)
const cache = new Map();

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── fetch() mit AbortController-Timeout ──────────────────────────────────────
async function fetchMitTimeout(url, optionen = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", ...optionen, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── CoinGecko Coin-ID Mapping ───────────────────────────────────────────────
const COINGECKO_IDS = {
  // Hauptwährungen
  BTC:   "bitcoin",
  ETH:   "ethereum",
  SOL:   "solana",
  // Stablecoins
  USDC:  "usd-coin",
  USDT:  "tether",
  DAI:   "dai",
  BUSD:  "binance-usd",
  // DeFi-Token
  LINK:  "chainlink",
  UNI:   "uniswap",
  AAVE:  "aave",
  COMP:  "compound-governance-token",
  MKR:   "maker",
  SNX:   "synthetix-network-token",
  CRV:   "curve-dao-token",
  LDO:   "lido-dao",
  // Layer-2 / Polygon
  MATIC: "matic-network",
  POL:   "matic-network",
  ARB:   "arbitrum",
  OP:    "optimism",
  // Solana-Token
  BONK:  "bonk",
  JUP:   "jupiter-exchange-solana",
  PYTH:  "pyth-network",
  RNDR:  "render-token",
  RAY:   "raydium",
  SRM:   "serum",
  WIF:   "dogwifcoin",
  MSOL:  "msol",
  JTO:   "jito-governance-token",
  BSOL:  "blazestake-staked-sol",
  // Gold/Rohstoff-Token
  VNXAU: "vnx-gold",             // VNX Gold auf Ethereum
  PAXG:  "pax-gold",
  XAUT:  "tether-gold",
  // Exchange-Token
  BNB:   "binancecoin",
  CRO:   "crypto-com-chain",
  // Weitere populäre Token
  SHIB:  "shiba-inu",
  APE:   "apecoin",
  GRT:   "the-graph",
  ENS:   "ethereum-name-service",
  IMX:   "immutable-x",
  SAND:  "the-sandbox",
  MANA:  "decentraland",
  AXS:   "axie-infinity",
  CHZ:   "chiliz",
  FTM:   "fantom",
  AVAX:  "avalanche-2",
  DOT:   "polkadot",
  ADA:   "cardano",
  XRP:   "ripple",
  LTC:   "litecoin",
  BCH:   "bitcoin-cash",
  ATOM:  "cosmos",
  NEAR:  "near",
  APT:   "aptos",
  SUI:   "sui",
};

// Dynamisch entdeckte CoinGecko-IDs (In-Memory-Cache für diese Serverinstanz)
const dynamischeGeckoIds = new Map();

// ─── Hilfsfunktion: Datum → Unix-Timestamp Mitternacht UTC ───────────────────
function datumZuTimestamp(datumStr) {
  return Math.floor(new Date(datumStr + "T00:00:00Z").getTime() / 1000);
}

// ─── Stufe 1: CoinMarketCap Historical ───────────────────────────────────────
// POST /v1/cryptocurrency/quotes/historical
// Feld: data.quotes[0].quote.CHF.close
async function cmcHistorisch(symbol, datumStr, cmcKey) {
  if (!cmcKey) return null;
  try {
    const antwort = await fetchMitTimeout(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/historical",
      {
        method:  "POST",
        headers: {
          "X-CMC_PRO_API_KEY": cmcKey,
          "Content-Type":      "application/json",
        },
        body: JSON.stringify({
          symbol,
          time_start: datumStr,
          time_end:   datumStr,
          convert:    "CHF",
        }),
      },
      10_000
    );
    if (!antwort.ok) return null;
    const daten = await antwort.json();
    const kurs  = daten?.data?.quotes?.[0]?.quote?.CHF?.close;
    return kurs > 0 ? kurs : null;
  } catch {
    return null;
  }
}

// ─── Stufe 2: CryptoCompare histoday ─────────────────────────────────────────
// GET /data/v2/histoday?fsym=BTC&tsym=CHF&limit=1&toTs=TIMESTAMP
// Feld: Data.Data[1].close (letzter Schlusskurs des Tages)
async function ccHistorisch(symbol, datumStr) {
  try {
    const ts      = datumZuTimestamp(datumStr);
    const antwort = await fetchMitTimeout(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${symbol}&tsym=CHF&limit=1&toTs=${ts}`,
      {},
      8_000
    );
    if (!antwort.ok) return null;
    const daten = await antwort.json();
    // Data.Data[1] ist der gesuchte Tag (Data[0] = Vortag)
    const kurs  = daten?.Data?.Data?.[1]?.close;
    return kurs > 0 ? kurs : null;
  } catch {
    return null;
  }
}

// ─── CoinGecko: Symbol-ID dynamisch suchen (Fallback für unbekannte Token) ───
async function coingeckoSuchen(symbol) {
  const cached = dynamischeGeckoIds.get(symbol);
  if (cached !== undefined) return cached; // null = "nicht gefunden" (auch gecacht)
  try {
    const antwort = await fetchMitTimeout(
      `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`,
      {},
      8_000
    );
    if (!antwort.ok) { dynamischeGeckoIds.set(symbol, null); return null; }
    const daten = await antwort.json();
    // Exakten Symbol-Match suchen (Gross-/Kleinschreibung ignorieren)
    const treffer = (daten?.coins || []).find(
      (c) => c.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    const id = treffer?.id || null;
    dynamischeGeckoIds.set(symbol, id);
    return id;
  } catch {
    dynamischeGeckoIds.set(symbol, null);
    return null;
  }
}

// ─── Stufe 3: CoinGecko (mit Delay und Retry) ────────────────────────────────
// GET /coins/{id}/history?date=DD-MM-YYYY&localization=false
// Feld: market_data.current_price.chf
// Vor erstem Call: 1500ms warten; bei 429: 5000ms warten + Retry (max 2×)
async function coingeckoHistorisch(symbol, datumStr) {
  let coinId = COINGECKO_IDS[symbol.toUpperCase()];
  // Falls nicht im statischen Mapping → dynamisch suchen
  if (!coinId) {
    coinId = await coingeckoSuchen(symbol.toUpperCase());
  }
  if (!coinId) return null;

  const [yyyy, mm, dd] = datumStr.split("-");
  const datumFormatiert = `${dd}-${mm}-${yyyy}`; // DD-MM-YYYY für CoinGecko

  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      await warte(versuch === 0 ? 1500 : 5000);
      const antwort = await fetchMitTimeout(
        `https://api.coingecko.com/api/v3/coins/${coinId}/history?date=${datumFormatiert}&localization=false`,
        {},
        8_000
      );
      if (antwort.status === 429) continue; // Rate-Limit → nochmals versuchen
      if (!antwort.ok) return null;
      const daten = await antwort.json();
      const kurs  = daten?.market_data?.current_price?.chf;
      return kurs > 0 ? kurs : null;
    } catch {
      // Nächster Versuch
    }
  }
  return null;
}

// ─── Stufe 4: Mempool.space (nur BTC, keine anderen Coins) ───────────────────
// GET /api/v1/historical-price?currency=CHF&timestamp=UNIX_TS
// Feld: prices[0].CHF
async function mempoolHistorisch(datumStr) {
  try {
    const ts      = datumZuTimestamp(datumStr);
    const antwort = await fetchMitTimeout(
      `https://mempool.space/api/v1/historical-price?currency=CHF&timestamp=${ts}`,
      {},
      8_000
    );
    if (!antwort.ok) return null;
    const daten = await antwort.json();
    const kurs  = daten?.prices?.[0]?.CHF;
    return kurs > 0 ? kurs : null;
  } catch {
    return null;
  }
}

// ─── Hauptfunktion: getHistoricalCHFPrice ────────────────────────────────────
// symbol:   "BTC" | "ETH" | "SOL" | ERC-20-Symbol | SPL-Symbol
// datumStr: "YYYY-MM-DD"
// cmcKey:   COINMARKETCAP_API_KEY (optional, verbessert Qualität)
// Gibt: CHF-Kurs (number) oder null (wenn alle Stufen fehlschlagen)
export async function getHistoricalCHFPrice(symbol, datumStr, cmcKey) {
  const upperSymbol = symbol.toUpperCase();
  const cacheKey    = `${upperSymbol}-${datumStr}`;

  // Cache-Treffer (auch null wird gecacht, um Wiederholungen zu vermeiden)
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let kurs = null;

  // Stufe 1: CoinMarketCap Historical
  kurs = await cmcHistorisch(upperSymbol, datumStr, cmcKey);
  if (kurs !== null) { cache.set(cacheKey, kurs); return kurs; }

  // Stufe 2: CryptoCompare histoday (kostenlos, hohes Limit)
  kurs = await ccHistorisch(upperSymbol, datumStr);
  if (kurs !== null) { cache.set(cacheKey, kurs); return kurs; }

  // Stufe 3: CoinGecko (langsamer, niedriges Limit)
  kurs = await coingeckoHistorisch(upperSymbol, datumStr);
  if (kurs !== null) { cache.set(cacheKey, kurs); return kurs; }

  // Stufe 4: Mempool.space (nur BTC)
  if (upperSymbol === "BTC") {
    kurs = await mempoolHistorisch(datumStr);
    if (kurs !== null) { cache.set(cacheKey, kurs); return kurs; }
  }

  console.warn(`[KURS] ${upperSymbol} ${datumStr}: Kein Kurs gefunden (alle 4 Stufen fehlgeschlagen)`);
  cache.set(cacheKey, null);
  return null;
}

// ─── Batch-Helfer: mehrere Kurse parallel abrufen (respektiert CC Rate-Limit) ─
// Verarbeitet max. 4 Abfragen gleichzeitig, 1100ms Pause zwischen Batches
// abfragen: Array von { symbol, datumStr }
// cmcKey:   COINMARKETCAP_API_KEY
// Gibt: Map<"SYMBOL-YYYY-MM-DD", number|null>
export async function batchHistoricalPrices(abfragen, cmcKey) {
  const BATCH = 4;
  const ergebnisse = new Map();

  // Duplikate entfernen
  const einzigartig = [];
  const gesehenKeys = new Set();
  for (const { symbol, datumStr } of abfragen) {
    const key = `${symbol.toUpperCase()}-${datumStr}`;
    if (!gesehenKeys.has(key)) {
      gesehenKeys.add(key);
      einzigartig.push({ symbol, datumStr, key });
    }
  }

  for (let i = 0; i < einzigartig.length; i += BATCH) {
    if (i > 0) await warte(1100); // CryptoCompare Rate-Limit: max 5/s
    const batch = einzigartig.slice(i, i + BATCH);
    const batchErgebnisse = await Promise.allSettled(
      batch.map(({ symbol, datumStr, key }) =>
        getHistoricalCHFPrice(symbol, datumStr, cmcKey).then((kurs) => ({ key, kurs }))
      )
    );
    for (const ergebnis of batchErgebnisse) {
      if (ergebnis.status === "fulfilled") {
        ergebnisse.set(ergebnis.value.key, ergebnis.value.kurs);
      }
    }
  }

  return ergebnisse;
}
