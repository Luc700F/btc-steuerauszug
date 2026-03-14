import { NextResponse } from "next/server";
import { batchHistoricalPrices } from "../../../lib/historicalPrice";

// Vercel Function Timeout
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

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

// ─── Bekannte SPL-Token-Mints → Symbol + CryptoCompare-Symbol + Dezimalen ────
const SPL_TOKENS = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC",  decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT",  decimals: 6 },
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { symbol: "MSOL",  decimals: 9 },
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": { symbol: "ETH",   decimals: 8 },
  "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E": { symbol: "BTC",   decimals: 6 },
  SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt: { symbol: "SRM",   decimals: 6 },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK",  decimals: 5 },
  EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm: { symbol: "WIF",   decimals: 6 },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP",   decimals: 6 },
  HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt8: { symbol: "PYTH",  decimals: 6 },
  rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof: { symbol: "RNDR",  decimals: 8 },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY",   decimals: 6 },
};

const warte = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Solana RPC aufrufen (mit Retry bei 429) ──────────────────────────────────
async function solanaRpc(methode, params, versuche = 3) {
  for (let versuch = 0; versuch < versuche; versuch++) {
    if (versuch > 0) await warte(1000 * versuch);
    const antwort = await fetchMitTimeout(SOLANA_RPC, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method: methode, params }),
    }, 10_000);
    const daten = await antwort.json();
    if (daten.error) {
      if (daten.error.code === 429 && versuch < versuche - 1) continue;
      throw new Error(daten.error.message || "RPC Fehler");
    }
    return daten.result;
  }
}

// ─── SOL Balance holen ────────────────────────────────────────────────────────
async function holeSolBalance(adresse) {
  try {
    const ergebnis = await solanaRpc("getBalance", [adresse]);
    return (ergebnis?.value ?? 0) / 1e9;
  } catch (e) {
    console.warn("[SOL] getBalance Fehler:", e.message);
    return 0;
  }
}

// ─── SPL-Token-Balances via getTokenAccountsByOwner ──────────────────────────
async function holeSplBalances(adresse) {
  try {
    const ergebnis = await solanaRpc("getTokenAccountsByOwner", [
      adresse,
      { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
      { encoding: "jsonParsed" },
    ]);

    const balances = {};
    for (const konto of ergebnis?.value || []) {
      const info = konto.account?.data?.parsed?.info;
      if (!info) continue;
      const mint    = info.mint;
      const menge   = info.tokenAmount?.uiAmount || 0;
      const tokenInfo = SPL_TOKENS[mint];
      if (tokenInfo && menge > 0) {
        balances[tokenInfo.symbol] = (balances[tokenInfo.symbol] || 0) + menge;
      }
    }
    return balances;
  } catch (e) {
    console.warn("[SOL] getTokenAccountsByOwner Fehler:", e.message);
    return {};
  }
}

// ─── SPL-Token-Änderungen aus einer Transaktion extrahieren ──────────────────
function extrahiereSplAenderungen(tx, adresse) {
  const aenderungen = [];
  const pre  = tx.meta?.preTokenBalances  || [];
  const post = tx.meta?.postTokenBalances || [];

  for (const postEntry of post) {
    if (postEntry.owner !== adresse) continue;
    const mint      = postEntry.mint;
    const tokenInfo = SPL_TOKENS[mint];
    if (!tokenInfo) continue;

    const nachBetrag = postEntry.uiTokenAmount?.uiAmount || 0;
    const preEntry   = pre.find(
      (p) => p.accountIndex === postEntry.accountIndex && p.mint === mint
    );
    const vorBetrag  = preEntry?.uiTokenAmount?.uiAmount || 0;
    const differenz  = nachBetrag - vorBetrag;
    if (Math.abs(differenz) < 1e-9) continue;

    aenderungen.push({
      symbol: tokenInfo.symbol,
      betrag: Math.abs(differenz),
      typ:    differenz > 0 ? "eingang" : "ausgang",
    });
  }
  return aenderungen;
}

// ─── API Route: Solana-Transaktionen laden ──────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const adresse = searchParams.get("address");

  if (!adresse) {
    return NextResponse.json({ error: "Solana-Adresse fehlt" }, { status: 400 });
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(adresse)) {
    return NextResponse.json(
      { error: "Ungültige Solana-Adresse (Base58, 32–44 Zeichen erwartet)" },
      { status: 400 }
    );
  }

  const cmcKey = process.env.COINMARKETCAP_API_KEY;

  try {
    // ─── Schritt 1: SOL-Kurs + erste Signaturen + Balances parallel ────────
    const [ersteSignaturen, solKursRoh, solBalance, splBalances] = await Promise.all([
      solanaRpc("getSignaturesForAddress", [adresse, { limit: 50 }]),
      cmcKey
        ? fetchMitTimeout(
            "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=SOL&convert=CHF",
            { headers: { "X-CMC_PRO_API_KEY": cmcKey } },
            8_000
          ).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      holeSolBalance(adresse),
      holeSplBalances(adresse),
    ]);

    let aktuellerSolKurs = 0;
    let solKursquelle    = "";

    const cmcSolKurs = solKursRoh?.data?.SOL?.quote?.CHF?.price;
    if (cmcSolKurs > 0) {
      aktuellerSolKurs = cmcSolKurs;
      solKursquelle    = "CoinMarketCap";
    }

    if (aktuellerSolKurs === 0) {
      try {
        const ccAntwort = await fetchMitTimeout("https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=CHF", {}, 8_000);
        if (ccAntwort.ok) {
          const ccDaten = await ccAntwort.json();
          if (ccDaten?.CHF > 0) {
            aktuellerSolKurs = ccDaten.CHF;
            solKursquelle    = "CryptoCompare";
          }
        }
      } catch (e) {
        console.warn("[SOL] CryptoCompare Kurs Fehler:", e.message);
      }
    }

    if (aktuellerSolKurs === 0) {
      return NextResponse.json(
        { error: "Kein SOL/CHF Kurs verfügbar." },
        { status: 503 }
      );
    }

    // ─── Pagination: bis 100 Signaturen sammeln ────────────────────────────
    const MAX_SIGS = 100;
    let alleSignaturen = [...(ersteSignaturen || [])];
    if (alleSignaturen.length === 50 && alleSignaturen.length < MAX_SIGS) {
      try {
        const before = alleSignaturen[alleSignaturen.length - 1]?.signature;
        const weitereSignaturen = await solanaRpc("getSignaturesForAddress", [
          adresse, { limit: 50, before },
        ]);
        if (Array.isArray(weitereSignaturen)) {
          alleSignaturen.push(...weitereSignaturen);
        }
      } catch (e) {
        console.warn("[SOL] Pagination Fehler:", e.message);
      }
    }

    // ─── Schritt 2: Transaktionsdetails laden ─────────────────────────────
    const alleTransaktionen   = [];
    const gefundeneSplSymbole = new Set();

    for (const sig of alleSignaturen) {
      if (sig.err || !sig.blockTime) continue;
      try {
        await warte(250); // Rate-Limit-Schutz
        const tx = await solanaRpc("getTransaction", [
          sig.signature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ]);
        if (!tx?.meta || !tx?.transaction?.message?.accountKeys) continue;

        const konten   = tx.transaction.message.accountKeys;
        const datum    = new Date(sig.blockTime * 1000);
        const datumStr = datum.toISOString().slice(0, 10);

        // SOL-Balance-Änderung
        const kontoIndex = konten.findIndex((k) =>
          typeof k === "string" ? k === adresse : k?.pubkey === adresse
        );
        if (kontoIndex !== -1) {
          const differenzLamports =
            (tx.meta.postBalances[kontoIndex] || 0) - (tx.meta.preBalances[kontoIndex] || 0);
          const solBetrag = Math.abs(differenzLamports) / 1e9;

          if (differenzLamports !== 0 && solBetrag > 0) {
            alleTransaktionen.push({
              _datumStr:    datumStr,
              _symbol:      "SOL",
              datum:        datum.toISOString(),
              hash:         sig.signature,
              typ:          differenzLamports > 0 ? "eingang" : "ausgang",
              betrag:       solBetrag,
              waehrung:     "SOL",
              chfZeitpunkt: null,
              chfHeute:     0,
            });
          }
        }

        // SPL-Token-Änderungen
        for (const spl of extrahiereSplAenderungen(tx, adresse)) {
          gefundeneSplSymbole.add(spl.symbol);
          alleTransaktionen.push({
            _datumStr:    datumStr,
            _symbol:      spl.symbol,
            datum:        datum.toISOString(),
            hash:         sig.signature,
            typ:          spl.typ,
            betrag:       spl.betrag,
            waehrung:     spl.symbol,
            chfZeitpunkt: null,
            chfHeute:     0,
          });
        }
      } catch {
        continue;
      }
    }

    // ─── Schritt 3: Aktuelle Kurse für SPL-Tokens ─────────────────────────
    const aktuelleKurse = { SOL: aktuellerSolKurs };

    if (gefundeneSplSymbole.size > 0) {
      const splSymbole = [...gefundeneSplSymbole];

      if (cmcKey) {
        try {
          const cmcAntwort = await fetchMitTimeout(
            `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${splSymbole.join(",")}&convert=CHF`,
            { headers: { "X-CMC_PRO_API_KEY": cmcKey } },
            8_000
          );
          if (cmcAntwort.ok) {
            const cmcDaten = await cmcAntwort.json();
            for (const sym of splSymbole) {
              const kurs = cmcDaten?.data?.[sym]?.quote?.CHF?.price;
              if (kurs > 0) aktuelleKurse[sym] = kurs;
            }
          }
        } catch {}
      }

      // CryptoCompare als Fallback
      const ohneKurs = splSymbole.filter((sym) => !aktuelleKurse[sym]);
      if (ohneKurs.length > 0) {
        const ccErgebnisse = await Promise.all(
          ohneKurs.map((sym) =>
            fetchMitTimeout(`https://min-api.cryptocompare.com/data/price?fsym=${sym}&tsyms=CHF`, {}, 8_000)
              .then((r) => r.json())
              .then((d) => [sym, d?.CHF || null])
              .catch(() => [sym, null])
          )
        );
        for (const [sym, kurs] of ccErgebnisse) {
          if (kurs > 0) aktuelleKurse[sym] = kurs;
        }
      }
    }

    // ─── Schritt 4: Historische Kurse via 4-stufigem Fallback ─────────────
    const abfragen = [];
    const gesehenKeys = new Set();
    for (const tx of alleTransaktionen) {
      const key = `${tx._symbol}-${tx._datumStr}`;
      if (!gesehenKeys.has(key)) {
        gesehenKeys.add(key);
        abfragen.push({ symbol: tx._symbol, datumStr: tx._datumStr });
      }
    }

    const kursMap = await batchHistoricalPrices(abfragen.slice(0, 25), cmcKey);

    // ─── Schritt 5: CHF-Werte berechnen und Transaktionen finalisieren ────
    for (const tx of alleTransaktionen) {
      const histKurs    = kursMap.get(`${tx._symbol}-${tx._datumStr}`) ?? null;
      const aktuellerKurs = aktuelleKurse[tx.waehrung] ?? 0;
      tx.chfZeitpunkt   = histKurs !== null ? parseFloat((tx.betrag * histKurs).toFixed(2)) : null;
      tx.chfHeute       = parseFloat((tx.betrag * aktuellerKurs).toFixed(2));
      delete tx._datumStr;
      delete tx._symbol;
    }

    alleTransaktionen.sort((a, b) => new Date(b.datum) - new Date(a.datum));

    const coins = ["SOL", ...[...gefundeneSplSymbole].sort()];

    // Balances zusammenführen (RPC + getTokenAccountsByOwner)
    const alleBalances = { SOL: solBalance, ...splBalances };

    return NextResponse.json({
      adresse,
      blockchain:    "solana",
      transaktionen: alleTransaktionen,
      balances:      alleBalances,
      aktuellerKurs: aktuellerSolKurs,
      kurse:         aktuelleKurse,
      kursquelle:    solKursquelle,
      apiGenutzt:    "Solana Public RPC",
      coins,
    });
  } catch (fehler) {
    console.error("[SOL] Fehler:", fehler);
    return NextResponse.json(
      { error: "Fehler beim Laden der Solana-Transaktionen: " + fehler.message },
      { status: 500 }
    );
  }
}
