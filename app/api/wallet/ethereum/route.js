import { NextResponse } from "next/server";
import { batchHistoricalPrices } from "../../../lib/historicalPrice";

// Bekannte CoinGecko-IDs für gängige ERC-20 Token (Fallback für Kurse)
const GECKO_IDS = {
  LINK: "chainlink", UNI: "uniswap", AAVE: "aave", MKR: "maker",
  SNX: "synthetix-network-token", CRV: "curve-dao-token", LDO: "lido-dao",
  COMP: "compound-governance-token", USDC: "usd-coin", USDT: "tether",
  DAI: "dai", PAXG: "pax-gold", XAUT: "tether-gold", VNXAU: "vnx-gold",
  GRT: "the-graph", ENS: "ethereum-name-service", IMX: "immutable-x",
  APE: "apecoin", SHIB: "shiba-inu", MATIC: "matic-network", ARB: "arbitrum",
  OP: "optimism",
};

// Vercel Function Timeout
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ─── Alchemy JSON-RPC Request ─────────────────────────────────────────────────
async function alchemyRequest(url, method, params) {
  const antwort = await fetchMitTimeout(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }, 12_000);
  if (!antwort.ok) throw new Error(`Alchemy HTTP ${antwort.status}`);
  const daten = await antwort.json();
  if (daten.error) throw new Error(daten.error.message || "Alchemy Fehler");
  return daten.result;
}

// ─── ETH Balance via eth_getBalance ──────────────────────────────────────────
async function holeEthBalance(alchemyUrl, adresse) {
  try {
    const hexWert = await alchemyRequest(alchemyUrl, "eth_getBalance", [adresse, "latest"]);
    // BigInt verwenden um Präzisionsverlust bei grossen Werten zu vermeiden
    const wei = BigInt(hexWert);
    const WEI_PER_ETH = BigInt("1000000000000000000");
    const ganz = wei / WEI_PER_ETH;
    const rest = wei % WEI_PER_ETH;
    return Number(ganz) + Number(rest) / 1e18;
  } catch (e) {
    console.warn("[ETH] eth_getBalance Fehler:", e.message);
    return null;
  }
}

// ─── ERC-20 Balances via alchemy_getTokenBalances + alchemy_getTokenMetadata ─
async function holeTokenBalances(alchemyUrl, adresse) {
  try {
    const ergebnis = await alchemyRequest(alchemyUrl, "alchemy_getTokenBalances", [adresse]);

    const tokenListe = (ergebnis?.tokenBalances || []).filter((t) => {
      if (!t.tokenBalance || t.tokenBalance === "0x") return false;
      try { return BigInt(t.tokenBalance) > 0n; } catch { return false; }
    });

    const balances    = {};
    const tokenNamen  = {};
    for (const token of tokenListe.slice(0, 25)) {
      try {
        const meta     = await alchemyRequest(alchemyUrl, "alchemy_getTokenMetadata", [token.contractAddress]);
        const symbol   = meta?.symbol?.toUpperCase()?.trim();
        const decimals = meta?.decimals ?? 18;
        if (!symbol) continue;
        const balance = parseInt(token.tokenBalance, 16) / Math.pow(10, decimals);
        if (balance >= 0.000001) {
          balances[symbol]   = balance;
          tokenNamen[symbol] = meta?.name?.trim() || symbol;
        }
      } catch {
        // Metadaten nicht verfügbar → Token überspringen
      }
    }

    return { balances, tokenNamen };
  } catch (e) {
    console.warn("[ETH] alchemy_getTokenBalances Fehler:", e.message);
    return { balances: {}, tokenNamen: {} };
  }
}

// ─── Scam/Spam Token erkennen ─────────────────────────────────────────────────
const SCAM_KEYWORDS = ["CLAIM", "REWARD", "VISIT", "WEBSITE", "FREE", "AIRDROP", "BONUS", "GIVEAWAY"];
const URL_MUSTER    = /\.(org|com|io|net|xyz|app|finance|exchange|site|online)\b/i;

function istScamToken(symbol, name, cmcKurs, chfWert) {
  const n = (name || symbol || "").toUpperCase();
  if (URL_MUSTER.test(name || symbol))                return true;
  if (SCAM_KEYWORDS.some((kw) => n.includes(kw)))    return true;
  if ((name || "").length > 40)                       return true;
  if (chfWert > 50000 && !(cmcKurs > 0))             return true;
  return false;
}

// ─── Aktuellen Kurs via CoinMarketCap (Batch) ─────────────────────────────────
async function holeCmcKurse(symbole, cmcKey) {
  if (!cmcKey || symbole.length === 0) return {};
  try {
    const antwort = await fetchMitTimeout(
      `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbole.join(",")}&convert=CHF`,
      { headers: { "X-CMC_PRO_API_KEY": cmcKey } },
      8_000
    );
    if (!antwort.ok) return {};
    const daten = await antwort.json();
    const kurse = {};
    for (const sym of symbole) {
      const td   = daten?.data?.[sym];
      const kurs = Array.isArray(td) ? td[0]?.quote?.CHF?.price : td?.quote?.CHF?.price;
      if (kurs > 0) kurse[sym] = kurs;
    }
    return kurse;
  } catch (e) {
    console.warn("[ETH] CMC Fehler:", e.message);
    return {};
  }
}

// ─── Alchemy: Asset Transfers laden (eingehend + ausgehend) – mit Pagination ─
async function ladeAlchemyTransfers(alchemyUrl, adresse) {
  const holeAlle = async (adressTyp) => {
    const transfers = [];
    let pageKey = undefined;
    while (transfers.length < 200) {
      const ergebnis = await alchemyRequest(alchemyUrl, "alchemy_getAssetTransfers", [{
        fromBlock:    "0x0",
        toBlock:      "latest",
        [adressTyp]:  adresse,
        category:     ["external", "erc20"],
        maxCount:     "0x64",
        order:        "desc",
        withMetadata: true,
        ...(pageKey ? { pageKey } : {}),
      }]);
      transfers.push(...(ergebnis?.transfers || []));
      if (!ergebnis?.pageKey) break;
      pageKey = ergebnis.pageKey;
    }
    return transfers;
  };

  const [eingehend, ausgehend] = await Promise.all([
    holeAlle("toAddress"),
    holeAlle("fromAddress"),
  ]);

  return [
    ...eingehend.map((t) => ({ ...t, typ: "eingang" })),
    ...ausgehend.map((t) => ({ ...t, typ: "ausgang" })),
  ];
}

// ─── Etherscan V2: Transaktionen laden (Fallback) ────────────────────────────
async function ladeEtherscanTransfers(adresse, etherscanKey) {
  const base = "https://api.etherscan.io/v2/chainid/1/api";
  const [txAntwort, tokAntwort] = await Promise.all([
    fetchMitTimeout(`${base}?module=account&action=txlist&address=${adresse}&sort=desc&page=1&offset=100&apikey=${etherscanKey}`, {}, 10_000),
    fetchMitTimeout(`${base}?module=account&action=tokentx&address=${adresse}&sort=desc&page=1&offset=100&apikey=${etherscanKey}`, {}, 10_000),
  ]);

  const txRoh  = txAntwort.ok  ? await txAntwort.json()  : null;
  const tokRoh = tokAntwort.ok ? await tokAntwort.json() : null;

  if (txRoh?.status === "0" && txRoh.message !== "No transactions found") {
    throw new Error(`Etherscan: ${txRoh.result || txRoh.message}`);
  }

  const txListe  = Array.isArray(txRoh?.result)  ? txRoh.result.filter((t) => t.isError === "0" && parseFloat(t.value) > 0) : [];
  const tokListe = Array.isArray(tokRoh?.result) ? tokRoh.result : [];
  return [
    ...txListe.map((tx) => ({
      hash:  tx.hash,
      asset: "ETH",
      value: parseFloat(tx.value) / 1e18,
      typ:   tx.to?.toLowerCase() === adresse.toLowerCase() ? "eingang" : "ausgang",
      metadata: { blockTimestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString() },
    })),
    ...tokListe
      .filter((tx) => tx.tokenSymbol && tx.value)
      .map((tx) => ({
        hash:  tx.hash,
        asset: tx.tokenSymbol.toUpperCase(),
        value: parseFloat(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal) || 18),
        typ:   tx.to?.toLowerCase() === adresse.toLowerCase() ? "eingang" : "ausgang",
        metadata: { blockTimestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString() },
      })),
  ];
}

// ─── API Route: Ethereum + ERC-20 Transaktionen + Balances laden ─────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const adresse = searchParams.get("address");

  if (!adresse) {
    return NextResponse.json({ error: "Ethereum-Adresse fehlt" }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(adresse)) {
    return NextResponse.json({ error: "Ungültige Ethereum-Adresse" }, { status: 400 });
  }

  const alchemyKey   = process.env.ALCHEMY_API_KEY;
  const etherscanKey = process.env.ETHERSCAN_API_KEY;
  const cmcKey       = process.env.COINMARKETCAP_API_KEY;

  if (!alchemyKey && !etherscanKey) {
    return NextResponse.json({
      adresse,
      blockchain:    "ethereum",
      transaktionen: [],
      balances:      {},
      aktuellerKurs: 0,
      coins:         ["ETH"],
      fehler: "Kein API-Key vorhanden. Bitte ALCHEMY_API_KEY oder ETHERSCAN_API_KEY in .env.local setzen.",
    });
  }

  const alchemyUrl = alchemyKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}` : null;

  try {
    // ─── Schritt 1: Aktuellen ETH/CHF Kurs holen ──────────────────────────
    let aktuellerEthKurs = 0;
    let kursquelle       = "";

    const cmcKurse = await holeCmcKurse(["ETH"], cmcKey);
    if (cmcKurse.ETH > 0) {
      aktuellerEthKurs = cmcKurse.ETH;
      kursquelle       = "CoinMarketCap";
    } else {
      try {
        const ccAntwort = await fetchMitTimeout(
          "https://min-api.cryptocompare.com/data/price?fsym=ETH&tsyms=CHF",
          {},
          8_000
        );
        if (ccAntwort.ok) {
          const ccDaten = await ccAntwort.json();
          if (ccDaten?.CHF > 0) {
            aktuellerEthKurs = ccDaten.CHF;
            kursquelle       = "CryptoCompare";
          }
        }
      } catch {}
    }

    if (aktuellerEthKurs === 0) {
      return NextResponse.json(
        { error: "Kein ETH/CHF Kurs verfügbar. Bitte später erneut versuchen." },
        { status: 503 }
      );
    }

    // ─── Schritt 2: Transaktionen + Balances parallel laden ───────────────
    let alleRohenTransfers = [];
    let apiGenutzt         = "";
    let balances           = {};
    let tokenNamen         = {};

    if (alchemyKey) {
      apiGenutzt = "Alchemy";
      const [transfers, ethBalance, tokenErgebnis] = await Promise.all([
        ladeAlchemyTransfers(alchemyUrl, adresse),
        holeEthBalance(alchemyUrl, adresse),
        holeTokenBalances(alchemyUrl, adresse),
      ]);
      alleRohenTransfers = transfers;
      if (ethBalance !== null) balances.ETH = ethBalance;
      Object.assign(balances,   tokenErgebnis.balances);
      Object.assign(tokenNamen, tokenErgebnis.tokenNamen);
    } else {
      apiGenutzt = "Etherscan V2";
      alleRohenTransfers = await ladeEtherscanTransfers(adresse, etherscanKey);
    }

    // ─── Schritt 3: Transfers normalisieren ───────────────────────────────
    const rohTransaktionen = alleRohenTransfers
      .filter((t) => (t.value || 0) > 0 && t.metadata?.blockTimestamp)
      .map((t) => {
        const datum    = new Date(t.metadata.blockTimestamp);
        const datumStr = datum.toISOString().slice(0, 10);
        return {
          datum,
          datumStr,
          hash:     t.hash,
          typ:      t.typ,
          betrag:   parseFloat(t.value) || 0,
          waehrung: (t.asset || "ETH").toUpperCase(),
        };
      })
      .filter((t) => t.betrag > 0);

    // ─── Schritt 4: Aktuelle Kurse für alle Token ─────────────────────────
    const alleSymbole   = [...new Set(rohTransaktionen.map((t) => t.waehrung))];
    const aktuelleKurse = { ETH: aktuellerEthKurs };

    const tokenSymbole = alleSymbole.filter((s) => s !== "ETH");
    if (tokenSymbole.length > 0) {
      const batchKurse = await holeCmcKurse(tokenSymbole, cmcKey);
      Object.assign(aktuelleKurse, batchKurse);

      // CryptoCompare als Fallback für Token ohne CMC-Kurs
      const ohneKurs = tokenSymbole.filter((s) => !aktuelleKurse[s]);
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

    // Stufe 3: CoinGecko simple/price für Token ohne Kurs
    const nochOhneKurs = alleSymbole.filter((s) => !aktuelleKurse[s]);
    if (nochOhneKurs.length > 0) {
      const geckoIds = nochOhneKurs.map((s) => GECKO_IDS[s]).filter(Boolean).join(",");
      if (geckoIds) {
        try {
          const geckoAntwort = await fetchMitTimeout(
            `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=chf`,
            {},
            8_000
          );
          if (geckoAntwort.ok) {
            const geckoDaten = await geckoAntwort.json();
            for (const sym of nochOhneKurs) {
              const id = GECKO_IDS[sym];
              const kurs = geckoDaten[id]?.chf;
              if (kurs > 0) aktuelleKurse[sym] = kurs;
            }
          }
        } catch (e) {
          console.warn("[ETH] CoinGecko Fallback Fehler:", e.message);
        }
      }
    }

    const kursNichtVerfuegbar = alleSymbole.filter((s) => !aktuelleKurse[s]);
    if (kursNichtVerfuegbar.length > 0) {
      console.warn(`[ETH] Kein CHF-Kurs für: ${kursNichtVerfuegbar.join(", ")}`);
    }

    // ─── Scam-Token identifizieren und entfernen ──────────────────────────
    const scamSymbole = new Set();
    for (const [sym, bal] of Object.entries(balances)) {
      if (sym === "ETH") continue;
      const name    = tokenNamen[sym] || sym;
      const kurs    = aktuelleKurse[sym] || 0;
      if (istScamToken(sym, name, kurs, bal * kurs)) scamSymbole.add(sym);
    }
    for (const sym of scamSymbole) {
      delete balances[sym];
      delete aktuelleKurse[sym];
    }
    if (scamSymbole.size > 0) {
      console.info(`[ETH] Scam-Token entfernt: ${[...scamSymbole].join(", ")}`);
    }

    // ─── Schritt 5: Historische Kurse via 4-stufigem Fallback ─────────────
    const abfragen = [];
    const gesehenKeys = new Set();
    for (const sym of alleSymbole) {
      const txDaten = rohTransaktionen.filter((t) => t.waehrung === sym).slice(0, 15);
      for (const tx of txDaten) {
        const key = `${sym}-${tx.datumStr}`;
        if (!gesehenKeys.has(key)) {
          gesehenKeys.add(key);
          abfragen.push({ symbol: sym, datumStr: tx.datumStr });
        }
      }
    }

    const kursMap = await batchHistoricalPrices(abfragen, cmcKey);

    // ─── Schritt 6: Transaktionen finalisieren ────────────────────────────
    const rohTransaktionenGefiltert = rohTransaktionen.filter(
      (t) => !scamSymbole.has(t.waehrung)
    );
    const transaktionen = rohTransaktionenGefiltert.map((tx) => {
      const histKurs = kursMap.get(`${tx.waehrung}-${tx.datumStr}`) ?? null;
      const aktKurs  = aktuelleKurse[tx.waehrung] ?? null;
      return {
        datum:        tx.datum.toISOString(),
        hash:         tx.hash,
        typ:          tx.typ,
        betrag:       tx.betrag,
        waehrung:     tx.waehrung,
        chfZeitpunkt: histKurs !== null ? parseFloat((tx.betrag * histKurs).toFixed(2)) : null,
        chfHeute:     aktKurs  !== null ? parseFloat((tx.betrag * aktKurs ).toFixed(2)) : null,
      };
    });

    transaktionen.sort((a, b) => new Date(b.datum) - new Date(a.datum));

    const alleSymboleNachFilter = [...new Set(rohTransaktionenGefiltert.map((t) => t.waehrung))];
    const coins = ["ETH", ...alleSymboleNachFilter.filter((s) => s !== "ETH").sort()];
    return NextResponse.json({
      adresse,
      blockchain:          "ethereum",
      transaktionen,
      balances,
      aktuellerKurs:       aktuellerEthKurs,
      kurse:               aktuelleKurse,
      kursquelle,
      apiGenutzt,
      coins,
      kursNichtVerfuegbar,
      scamAnzahl:          scamSymbole.size,
    });
  } catch (fehler) {
    console.error("[ETH] Fehler:", fehler);
    return NextResponse.json(
      { error: "Fehler beim Laden der Ethereum-Transaktionen: " + fehler.message },
      { status: 500 }
    );
  }
}
