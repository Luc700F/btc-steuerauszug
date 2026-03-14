import { NextResponse } from "next/server";
import { fetchAllTransactions, parseTxsForAddress } from "../../../../lib/bitcoin-fetcher";
import { batchHistoricalPrices } from "../../../lib/historicalPrice";

// Vercel Function Timeout
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── fetch() mit AbortController-Timeout ─────────────────────────────────────
async function fetchMitTimeout(url, optionen = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const antwort = await fetch(url, { ...optionen, signal: controller.signal });
    return antwort;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Aktuellen BTC/CHF Kurs: CoinMarketCap → CryptoCompare → Fehler ──────────
async function holeBtcKurs(cmcKey) {
  // 1. CoinMarketCap (Primär)
  if (cmcKey) {
    try {
      const antwort = await fetchMitTimeout(
        "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=BTC&convert=CHF",
        { headers: { "X-CMC_PRO_API_KEY": cmcKey } },
        8_000
      );
      if (antwort.ok) {
        const daten = await antwort.json();
        const kurs  = daten?.data?.BTC?.quote?.CHF?.price;
        if (kurs > 0) return { kurs, quelle: "CoinMarketCap" };
      }
    } catch (e) {
      console.warn("[BTC] CMC Fehler:", e.message);
    }
  }

  // 2. CryptoCompare (Backup – kostenlos, kein Key)
  try {
    const antwort = await fetchMitTimeout(
      "https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=CHF",
      {},
      8_000
    );
    if (antwort.ok) {
      const daten = await antwort.json();
      const kurs  = daten?.CHF;
      if (kurs > 0) return { kurs, quelle: "CryptoCompare" };
    }
  } catch (e) {
    console.warn("[BTC] CryptoCompare Fehler:", e.message);
  }

  return null;
}

// ─── API Route: Bitcoin-Transaktionen laden ──────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const adresse = searchParams.get("address");

  if (!adresse) {
    return NextResponse.json({ error: "Bitcoin-Adresse fehlt" }, { status: 400 });
  }

  const cmcKey = process.env.COINMARKETCAP_API_KEY;

  try {
    // ─── Schritt 1: Aktuellen BTC/CHF Kurs holen ─────────────────────────
    const kursErgebnis = await holeBtcKurs(cmcKey);
    if (!kursErgebnis) {
      return NextResponse.json(
        { error: "Kein BTC/CHF Kurs verfügbar. CoinMarketCap und CryptoCompare nicht erreichbar." },
        { status: 503 }
      );
    }
    const aktuellerKurs = kursErgebnis.kurs;

    // ─── Schritt 2: Transaktionen via mempool.space laden ─────────────────
    // Adressgenaue Filterung: nur eigene vout/vin (scriptpubkey_address)
    let roheTxs;
    try {
      const allMempoolTxs = await fetchAllTransactions(adresse);
      roheTxs = parseTxsForAddress(allMempoolTxs, adresse);
    } catch (e) {
      return NextResponse.json(
        { error: `Bitcoin-Adresse nicht erreichbar: ${e.message}` },
        { status: 400 }
      );
    }

    // ─── Schritt 3: Historische CHF-Kurse laden ───────────────────────────
    // max 50 unique Daten (Timeout-Schutz), neueste zuerst
    const roheSortiert = [...roheTxs].sort((a, b) => b.timestamp - a.timestamp);
    const abfragen = [];
    const gesehenDaten = new Set();

    for (const tx of roheSortiert) {
      if (gesehenDaten.size >= 50) break;
      if (!gesehenDaten.has(tx.date)) {
        gesehenDaten.add(tx.date);
        abfragen.push({ symbol: "BTC", datumStr: tx.date });
      }
    }
    const kursMap = await batchHistoricalPrices(abfragen, cmcKey);

    // ─── Schritt 4: Transaktionen finalisieren ────────────────────────────
    // Ausgabe-Format: chronologisch absteigend (neueste zuerst für Anzeige)
    const transaktionen = roheTxs
      .map((tx) => {
        const histKurs = kursMap.get(`BTC-${tx.date}`) ?? null;
        return {
          datum:        new Date(tx.timestamp * 1000).toISOString(),
          hash:         tx.txid,
          typ:          tx.type,
          betrag:       tx.amount,
          waehrung:     "BTC",
          chfZeitpunkt: histKurs !== null ? parseFloat((tx.amount * histKurs).toFixed(2)) : null,
          chfHeute:     parseFloat((tx.amount * aktuellerKurs).toFixed(2)),
        };
      })
      .sort((a, b) => new Date(b.datum) - new Date(a.datum)); // neueste zuerst

    return NextResponse.json({
      adresse,
      blockchain:  "bitcoin",
      transaktionen,
      aktuellerKurs,
      kursquelle:  kursErgebnis.quelle,
      apiGenutzt:  "mempool.space",
      coins:       ["BTC"],
    });
  } catch (fehler) {
    console.error("[BTC] Unerwarteter Fehler:", fehler);
    return NextResponse.json(
      { error: "Fehler beim Laden der Bitcoin-Transaktionen: " + fehler.message },
      { status: 500 }
    );
  }
}
