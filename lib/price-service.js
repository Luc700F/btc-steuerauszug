// ─────────────────────────────────────────────────────────────────────────────
// lib/price-service.js
// Zweck: Historische CHF-Kurse für BTC, ETH, SOL und ERC-20 Token
// Exports: getHistoricalPriceChf, fetchAllHistoricalPrices (generisch)
//          getHistoricalBtcPriceChf, fetchAllBtcPrices (BTC-spezifisch, rückwärtskompatibel)
//          ESTV_JAHRESKURSE (offizieller ESTV-Jahreskurs per 31.12., verbindlich für CH-Steuer)
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map();

/**
 * Offizielle ESTV-Jahreskurse in CHF per 31.12. (verbindlich für die Steuerdeklaration).
 * Quelle: ESTV Kursliste Kryptowährungen (www.estv.admin.ch)
 * Valorennummer BTC: 3841927
 *
 * Jährlich nach ESTV-Veröffentlichung aktualisieren.
 * Struktur: { [coinGeckoId]: { [jahr]: kurs } }
 */
export const ESTV_JAHRESKURSE = {
  bitcoin: {
    2024: 85_676.00,  // CHF per 31.12.2024 — ESTV-Kursliste
    2025: 69_990.44,  // CHF per 31.12.2025 — Relai-Referenz bestätigt
  },
};

// CryptoCompare-Symbol-Mapping (CoinGecko-ID → CC-Symbol)
const COINGECKO_TO_CC = {
  bitcoin:   "BTC",
  ethereum:  "ETH",
  solana:    "SOL",
  chainlink: "LINK",
  uniswap:   "UNI",
  aave:      "AAVE",
};

function toCcSymbol(coinGeckoId) {
  return COINGECKO_TO_CC[coinGeckoId] ?? coinGeckoId.toUpperCase().substring(0, 6);
}

async function fetchMitTimeout(url, ms = 8000, extraHeaders = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "Cache-Control": "no-cache", ...extraHeaders },
    });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    clearTimeout(t);
    throw e;
  }
}

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Gibt den historischen CHF-Kurs für eine beliebige Kryptowährung zurück.
 * Gibt NIEMALS den aktuellen Live-Kurs zurück (kein Fallback auf live).
 * 5-stufige Fallback-Kaskade: CoinGecko → CryptoCompare → Kraken → CoinGecko-Chart → unavailable
 *
 * @param {string} coinGeckoId - CoinGecko ID (z.B. 'bitcoin', 'ethereum', 'solana')
 * @param {string} dateStr - Format 'YYYY-MM-DD', z.B. '2025-12-31'
 * @returns {Promise<{ price: number, source: string, date: string }>}
 */
export async function getHistoricalPriceChf(coinGeckoId, dateStr) {
  const cacheKey = `${coinGeckoId}-${dateStr}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const [y, m, d] = dateStr.split("-");
  const geckoDate = `${d}-${m}-${y}`; // DD-MM-YYYY für CoinGecko history

  // Stufe 0: ESTV-Jahreskurs (nur 31.12., offiziell + verbindlich für CH-Steuerdeklaration)
  if (m === "12" && d === "31") {
    const jahr = parseInt(y, 10);
    const estv = ESTV_JAHRESKURSE[coinGeckoId]?.[jahr];
    if (estv > 0) {
      const result = { price: estv, source: "ESTV", date: dateStr };
      cache.set(cacheKey, result);
      console.log(`[price] ${coinGeckoId} ${dateStr}: CHF ${estv} (ESTV-Jahreskurs, verbindlich)`);
      return result;
    }
  }

  // CoinGecko API Key (Demo Tier: ~30 req/min vs. 10 ohne Key → verhindert Rate-Limit-Fallback)
  const geckoHeaders = process.env.COINGECKO_API_KEY
    ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY }
    : {};

  // Stufe 1: CoinGecko /history
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/history?date=${geckoDate}&localization=false`;
    const data = await fetchMitTimeout(url, 8000, geckoHeaders);
    const price = data?.market_data?.current_price?.chf;
    if (price > 0) {
      const result = { price, source: "coingecko", date: dateStr };
      cache.set(cacheKey, result);
      console.log(`[price] ${coinGeckoId} ${dateStr}: CHF ${price} (CoinGecko)`);
      return result;
    }
  } catch (e) {
    console.warn(`[price] CoinGecko ${coinGeckoId} ${dateStr}:`, e.message);
  }

  await pause(1000);

  // Stufe 2: CryptoCompare pricehistorical
  try {
    const ts  = Math.floor(new Date(dateStr + "T23:59:59Z").getTime() / 1000);
    const sym = toCcSymbol(coinGeckoId);
    const url = `https://min-api.cryptocompare.com/data/pricehistorical?fsym=${sym}&tsyms=CHF&ts=${ts}`;
    const data = await fetchMitTimeout(url, 8000);
    const price = data?.[sym]?.CHF;
    if (price > 0) {
      const result = { price, source: "cryptocompare", date: dateStr };
      cache.set(cacheKey, result);
      console.log(`[price] ${coinGeckoId} ${dateStr}: CHF ${price} (CryptoCompare)`);
      return result;
    }
  } catch (e) {
    console.warn(`[price] CryptoCompare ${coinGeckoId} ${dateStr}:`, e.message);
  }

  await pause(1000);

  // Stufe 3: Kraken OHLC (nur BTC und ETH)
  const krakenPaar = coinGeckoId === "bitcoin" ? "XBTCHF" : coinGeckoId === "ethereum" ? "ETHCHF" : null;
  if (krakenPaar) {
    try {
      const since = Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
      const url   = `https://api.kraken.com/0/public/OHLC?pair=${krakenPaar}&interval=1440&since=${since}`;
      const data  = await fetchMitTimeout(url, 8000);
      const ohlc  = data?.result?.[krakenPaar] || data?.result?.["X" + krakenPaar];
      if (ohlc?.length > 0) {
        const price = parseFloat(ohlc[0][4]); // Close price
        if (price > 0) {
          const result = { price, source: "kraken", date: dateStr };
          cache.set(cacheKey, result);
          console.log(`[price] ${coinGeckoId} ${dateStr}: CHF ${price} (Kraken)`);
          return result;
        }
      }
    } catch (e) {
      console.warn(`[price] Kraken ${coinGeckoId} ${dateStr}:`, e.message);
    }

    await pause(500);
  }

  // Stufe 4: CoinGecko market_chart/range (approximativer Tageskurs)
  try {
    const from  = Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
    const to    = from + 86400;
    const url   = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart/range?vs_currency=chf&from=${from}&to=${to}`;
    const data  = await fetchMitTimeout(url, 8000, geckoHeaders);
    const prices = data?.prices;
    if (prices?.length > 0) {
      const price = prices[prices.length - 1][1];
      if (price > 0) {
        const result = { price, source: "coingecko-chart", approximate: true, date: dateStr };
        cache.set(cacheKey, result);
        console.log(`[price] ${coinGeckoId} ${dateStr}: CHF ${price} (CoinGecko Chart)`);
        return result;
      }
    }
  } catch (e) {
    console.warn(`[price] CoinGecko Chart ${coinGeckoId} ${dateStr}:`, e.message);
  }

  // Stufe 5: Kein Preis verfügbar (KEIN live-Fallback!)
  console.warn(`[price] KEIN PREIS für ${coinGeckoId} am ${dateStr} (alle 4 Stufen fehlgeschlagen)`);
  const result = { price: 0, source: "unavailable", date: dateStr };
  cache.set(cacheKey, result);
  return result;
}

/**
 * Lädt historische CHF-Kurse für alle Transaktionsdaten einer Coin.
 * Batch-Loading mit Rate-Limit-Schutz (3 parallel, 2s Pause).
 *
 * @param {Array<{datum?: string, date?: string}>} transactions
 * @param {string} coinGeckoId - CoinGecko ID
 * @returns {Promise<Object>} Mapping datumStr → { price, source, date }
 */
export async function fetchAllHistoricalPrices(transactions, coinGeckoId) {
  const uniqueDates = [
    ...new Set(
      transactions
        .map((tx) => (tx.datum || tx.date || "").substring(0, 10))
        .filter(Boolean)
    ),
  ];

  const results = {};
  const BATCH_SIZE = 3;

  for (let i = 0; i < uniqueDates.length; i += BATCH_SIZE) {
    const batch = uniqueDates.slice(i, i + BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map((d) => getHistoricalPriceChf(coinGeckoId, d))
    );
    batch.forEach((date, j) => {
      results[date] =
        settled[j].status === "fulfilled"
          ? settled[j].value
          : { price: 0, source: "error", date };
    });
    if (i + BATCH_SIZE < uniqueDates.length) await pause(2000);
  }

  return results;
}

// ─── Rückwärtskompatible BTC-spezifische Exports ─────────────────────────────

/**
 * Gibt den historischen BTC/CHF-Kurs für ein Datum zurück.
 * @deprecated Verwende getHistoricalPriceChf('bitcoin', dateStr) stattdessen.
 * Kein live-Fallback mehr! Gibt { price: 0, source: 'unavailable' } wenn nicht verfügbar.
 */
export async function getHistoricalBtcPriceChf(datumStr) {
  return getHistoricalPriceChf("bitcoin", datumStr);
}

/**
 * Lädt historische BTC/CHF-Kurse für alle Transaktionsdaten.
 * @deprecated Verwende fetchAllHistoricalPrices(transactions, 'bitcoin') stattdessen.
 */
export async function fetchAllBtcPrices(transaktionen) {
  return fetchAllHistoricalPrices(transaktionen, "bitcoin");
}
