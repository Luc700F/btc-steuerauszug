import { NextResponse } from "next/server";
import { batchHistoricalPrices } from "../../../lib/historicalPrice";

// Vercel Function Timeout
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── fetch() mit AbortController-Timeout ──────────────────────────────────────
async function fetchMitTimeout(url, optionen = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...optionen, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Aktuelle CHF-Kurse via CoinMarketCap + CryptoCompare ────────────────────
async function holeAktuelleKurse(symbole, cmcKey) {
  const kurse = {};

  // 1. CoinMarketCap (Batch)
  if (cmcKey && symbole.length > 0) {
    try {
      const antwort = await fetchMitTimeout(
        `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbole.join(",")}&convert=CHF`,
        { headers: { "X-CMC_PRO_API_KEY": cmcKey } },
        8_000
      );
      if (antwort.ok) {
        const daten = await antwort.json();
        for (const sym of symbole) {
          const td = daten?.data?.[sym];
          const kurs = Array.isArray(td) ? td[0]?.quote?.CHF?.price : td?.quote?.CHF?.price;
          if (kurs > 0) kurse[sym] = kurs;
        }
      }
    } catch (e) {
      console.warn("[CSV] CMC Fehler:", e.message);
    }
  }

  // 2. CryptoCompare als Fallback für fehlende Symbole
  const ohneKurs = symbole.filter((s) => !kurse[s]);
  for (const sym of ohneKurs) {
    try {
      const antwort = await fetchMitTimeout(
        `https://min-api.cryptocompare.com/data/price?fsym=${sym}&tsyms=CHF`,
        {},
        8_000
      );
      if (antwort.ok) {
        const d = await antwort.json();
        if (d?.CHF > 0) kurse[sym] = d.CHF;
      }
    } catch {}
  }

  return kurse;
}

// ─── API Route: CSV-Import mit historischen CHF-Kursen ───────────────────────
export async function POST(request) {
  try {
    const { transaktionen, dateiname } = await request.json();

    if (!Array.isArray(transaktionen) || transaktionen.length === 0) {
      return NextResponse.json({ error: "Keine Transaktionen übergeben" }, { status: 400 });
    }

    const cmcKey = process.env.COINMARKETCAP_API_KEY;

    // Alle Währungssymbole ermitteln
    const alleSymbole = [...new Set(transaktionen.map((t) => t.waehrung))];

    // Aktuelle CHF-Kurse
    const aktuelleKurse = await holeAktuelleKurse(alleSymbole, cmcKey);

    // Historische CHF-Kurse (Batch, max 25 eindeutige Tage pro Symbol)
    const abfragen = [];
    const gesehen = new Set();
    for (const tx of transaktionen) {
      const datumStr = tx.datumStr || new Date(tx.datum).toISOString().slice(0, 10);
      const key = `${tx.waehrung}-${datumStr}`;
      if (!gesehen.has(key)) {
        gesehen.add(key);
        abfragen.push({ symbol: tx.waehrung, datumStr });
      }
    }

    const kursMap = await batchHistoricalPrices(abfragen.slice(0, 50), cmcKey);

    // Transaktionen mit CHF-Kursen anreichern
    const angereichert = transaktionen.map((tx, idx) => {
      const datumStr = tx.datumStr || new Date(tx.datum).toISOString().slice(0, 10);
      const histKurs = kursMap.get(`${tx.waehrung}-${datumStr}`) ?? null;
      const aktKurs  = aktuelleKurse[tx.waehrung] ?? null;

      return {
        datum:        new Date(tx.datum).toISOString(),
        hash:         tx.hash || `csv-${idx}-${Date.now()}`,
        typ:          tx.typ,
        betrag:       tx.betrag,
        waehrung:     tx.waehrung,
        chfZeitpunkt: histKurs !== null ? parseFloat((tx.betrag * histKurs).toFixed(2)) : null,
        chfHeute:     aktKurs  !== null ? parseFloat((tx.betrag * aktKurs ).toFixed(2)) : null,
      };
    });

    angereichert.sort((a, b) => new Date(b.datum) - new Date(a.datum));

    // Hauptwährung = die häufigste Währung im CSV
    const haeufigkeit = {};
    for (const tx of transaktionen) {
      haeufigkeit[tx.waehrung] = (haeufigkeit[tx.waehrung] || 0) + 1;
    }
    const hauptwaehrung = alleSymbole.sort((a, b) => (haeufigkeit[b] || 0) - (haeufigkeit[a] || 0))[0] || "BTC";

    return NextResponse.json({
      adresse:       dateiname || "CSV Import",
      blockchain:    "csv",
      transaktionen: angereichert,
      balances:      {},
      aktuellerKurs: aktuelleKurse[hauptwaehrung] || 0,
      kurse:         aktuelleKurse,
      kursquelle:    "CoinMarketCap/CryptoCompare",
      coins:         [hauptwaehrung, ...alleSymbole.filter((s) => s !== hauptwaehrung).sort()],
      scamAnzahl:    0,
    });
  } catch (fehler) {
    console.error("[CSV] Fehler:", fehler);
    return NextResponse.json(
      { error: "Fehler beim Verarbeiten: " + fehler.message },
      { status: 500 }
    );
  }
}
