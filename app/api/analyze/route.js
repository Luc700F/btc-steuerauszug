import { NextResponse } from "next/server";
import { fetchAllTransactions, parseTxsForAddress } from "../../../lib/bitcoin-fetcher";
import { getHistoricalPriceChf, fetchAllHistoricalPrices } from "../../../lib/price-service";
import { getJahresStatus } from "../../../lib/jahres-utils";
import { calculateFIFO } from "../../../lib/fifo";
import { validateSteuerDaten } from "../../../lib/validate";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// CoinGecko-ID pro Blockchain
const COINGECKO_IDS = {
  bitcoin:  "bitcoin",
  ethereum: "ethereum",
  solana:   "solana",
};

// Haupt-Symbol pro Blockchain
const HAUPT_SYMBOL = {
  bitcoin:  "BTC",
  ethereum: "ETH",
  solana:   "SOL",
};

/**
 * Zentrale Analyse-Route für Multi-Wallet Steuerberechnung.
 *
 * POST-Body: { wallets: string[], taxYear: number, canton?: string, blockchain?: string }
 *
 * Ablauf:
 *  1. Transaktionen aller Wallets parallel laden (adressgenaue Filterung)
 *  2. Chronologisch zusammenführen
 *  3. Historische CHF-Kurse laden
 *  4. Jahresschlusskurs 31.12. holen (HISTORISCH, nie live)
 *  5. FIFO über ALLE Wallets kombiniert berechnen
 *  6. Steuerwert EINMAL berechnen
 *  7. Konsistenzprüfung
 *  8. Vollständiges Ergebnis zurückgeben
 */
export async function POST(req) {
  try {
    const {
      wallets,
      taxYear,
      canton    = "ZH",
      blockchain = "bitcoin",
    } = await req.json();

    if (!Array.isArray(wallets) || wallets.length === 0) {
      return NextResponse.json({ error: "wallets[] erforderlich (min. 1 Adresse)" }, { status: 400 });
    }
    if (!taxYear || typeof taxYear !== "number") {
      return NextResponse.json({ error: "taxYear (number) erforderlich" }, { status: 400 });
    }

    const coinGeckoId  = COINGECKO_IDS[blockchain]  || "bitcoin";
    const hauptSymbol  = HAUPT_SYMBOL[blockchain]    || "BTC";
    const { isAbgeschlossen, isLaufend, stichtagDatum, hinweis } = getJahresStatus(taxYear);

    console.log("[analyze] Start:", { blockchain, taxYear, wallets: wallets.length, stichtagDatum });

    // ─── Schritt 1: Transaktionen aller Wallets parallel laden ────────────────
    let aktuellerKurs = 0;

    const walletErgebnisse = await Promise.allSettled(
      wallets.map(async (wallet) => {
        if (blockchain === "bitcoin") {
          // mempool.space mit adressgenauer Filterung
          const rawTxs  = await fetchAllTransactions(wallet);
          const parsed  = parseTxsForAddress(rawTxs, wallet);
          return {
            wallet,
            transaktionen: parsed.map((tx) => ({
              datum:    new Date(tx.timestamp * 1000).toISOString(),
              hash:     tx.txid,
              typ:      tx.type,
              betrag:   tx.amount,
              waehrung: hauptSymbol,
              wallet,
            })),
          };
        }
        // ETH/SOL: via eigene API-Routen (diese sind aufwendiger)
        const endpunkt = blockchain === "ethereum"
          ? `/api/wallet/ethereum?address=${encodeURIComponent(wallet)}`
          : `/api/wallet/solana?address=${encodeURIComponent(wallet)}`;

        const antwort = await fetch(
          `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}${endpunkt}`,
          { cache: "no-store" }
        );
        if (!antwort.ok) throw new Error(`API ${antwort.status}: ${wallet}`);
        const daten = await antwort.json();
        if (daten.aktuellerKurs > aktuellerKurs) aktuellerKurs = daten.aktuellerKurs;
        return { wallet, transaktionen: daten.transaktionen || [] };
      })
    );

    const fehlgeschlageneWallets = walletErgebnisse
      .map((r, i) => (r.status === "rejected" ? wallets[i] : null))
      .filter(Boolean);

    if (fehlgeschlageneWallets.length > 0) {
      console.warn("[analyze] Fehlgeschlagene Wallets:", fehlgeschlageneWallets);
    }

    // Alle Transaktionen aus erfolgreichen Wallets zusammenführen
    const alleTxsFlat = walletErgebnisse
      .filter((r) => r.status === "fulfilled")
      .flatMap((r) => r.value.transaktionen);

    // ─── Schritt 2: Chronologisch sortieren (für FIFO) ────────────────────────
    const sortedTxs = alleTxsFlat.sort((a, b) => new Date(a.datum) - new Date(b.datum));

    // ─── Schritt 3: Historische CHF-Kurse für alle Transaktionen ─────────────
    const hauptsymbolTxs = sortedTxs.filter((tx) => tx.waehrung === hauptSymbol);
    const priceMap = await fetchAllHistoricalPrices(hauptsymbolTxs, coinGeckoId);

    const txsMitPreisen = sortedTxs.map((tx) => {
      if (tx.waehrung !== hauptSymbol) return tx;
      const datumStr = tx.datum.substring(0, 10);
      const histKurs = priceMap[datumStr]?.price ?? 0;
      return {
        ...tx,
        chfZeitpunkt: histKurs > 0 ? parseFloat((tx.betrag * histKurs).toFixed(2)) : null,
        chfHeute:     tx.betrag * aktuellerKurs,
      };
    });

    // ─── Schritt 4: Jahresschlusskurs 31.12. (historisch, NIE live) ──────────
    const kursStichtag = await getHistoricalPriceChf(coinGeckoId, stichtagDatum);

    if (!kursStichtag || kursStichtag.price <= 0) {
      if (isAbgeschlossen) {
        return NextResponse.json(
          { error: `Kein historischer Kurs für ${stichtagDatum}. Bitte später erneut versuchen.` },
          { status: 503 }
        );
      }
      // Laufendes Jahr: live-Kurs aus Bitcoin-API als Näherung
      kursStichtag.price = aktuellerKurs;
      kursStichtag.source = "live (laufendes Jahr)";
    }

    console.log(
      "[analyze] Stichtagskurs:", coinGeckoId, stichtagDatum,
      "CHF", kursStichtag.price, `(${kursStichtag.source})`
    );

    // ─── Schritt 5: FIFO über ALLE Wallets kombiniert ────────────────────────
    const fifo = calculateFIFO(txsMitPreisen, kursStichtag.price, taxYear);

    // ─── Schritt 6: Steuerwert EINMAL berechnen ───────────────────────────────
    // Alle nachgelagerten Module (PDF, XML) übernehmen diesen Wert direkt.
    const steuerwert = Math.round(fifo.endbestandAmount * kursStichtag.price * 100) / 100;

    // ─── Schritt 7: Konsistenzprüfung ─────────────────────────────────────────
    validateSteuerDaten({
      steuerwert,
      endbestandBTC:  fifo.endbestandAmount,
      kurs3112:       kursStichtag.price,
      totalTaxValue:  steuerwert,
    });

    console.log(
      "[analyze] OK – Endbestand:", fifo.endbestandAmount.toFixed(8), hauptSymbol,
      "× CHF", kursStichtag.price, "= CHF", steuerwert
    );

    // ─── Schritt 8: Vollständiges Ergebnis zurückgeben ────────────────────────
    return NextResponse.json({
      // Wallet-Info
      wallets,
      taxYear,
      canton,
      blockchain,
      isLaufend,
      isAbgeschlossen,
      stichtagDatum,
      hinweis,
      fehlgeschlageneWallets,

      // Transaktionen (chronologisch, mit CHF-Kursen)
      transaktionen: txsMitPreisen,
      aktuellerKurs,

      // Bilanz
      anfangsbestandBTC: fifo.anfangsbestandAmount,
      endbestandBTC:     fifo.endbestandAmount,
      kurs3112:          kursStichtag.price,
      kursQuelle:        kursStichtag.source,

      // Steuerwert – EINZIGE QUELLE für PDF und XML
      steuerwert,
      totalTaxValue:        steuerwert,
      totalGrossRevenueA:   0,
      totalGrossRevenueB:   0,
      totalWithHoldingTax:  0,

      // FIFO-Details
      realisiertGV:    fifo.realizedGainChf,
      unrealisiertGV:  fifo.unrealizedGainChf,
      kostenbasis:     fifo.kostenbasisChf,
    });
  } catch (fehler) {
    console.error("[analyze] Unerwarteter Fehler:", fehler);
    return NextResponse.json(
      { error: "Analyse fehlgeschlagen: " + fehler.message },
      { status: 500 }
    );
  }
}
