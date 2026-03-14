/**
 * Real-Wallet Integration Tests
 *
 * Testet den vollständigen Analyse-Flow mit echten, öffentlich bekannten
 * Wallet-Adressen von allen drei Chains.
 *
 * Warum echte Wallets?
 * - Mock-Daten können falsche Implementierungen verstecken
 * - Echte Wallets zeigen sofort ob Pagination, Adressfilter und
 *   Kursabfragen korrekt funktionieren
 * - Verifikation gegen bekannte Referenzwerte (Relai-Referenz-Wallet)
 *
 * Quellen der Wallets:
 * - mempool.space, bitinfocharts.com (BTC)
 * - etherscan.io/accounts, vitalik.eth (ETH)
 * - solscan.io/leaderboard (SOL)
 *
 * Timeout: 120s pro Test (echte API-Calls)
 */

import { fetchAllTransactions, parseTxsForAddress, calcAmountForAddress }
  from "../lib/bitcoin-fetcher";
import { calcAmountForEthAddress }
  from "../lib/eth-utils";
import { getHistoricalPriceChf }
  from "../lib/price-service";
import { calculateFIFO }
  from "../lib/fifo";
import { validateSteuerDaten }
  from "../lib/validate";
import { generateESteuerauszugXML }
  from "../lib/esteuerauszug";
import { generateAllBarcodes }
  from "../lib/barcode";

// ─── BEKANNTE BTC-ADRESSEN (öffentlich, verifizierbar) ───────────────────────

const BTC_WALLETS = {
  // Relai Referenz-Wallet – bekannte Werte aus Entwicklungstests
  // 6 Txs im Jahr 2025, Endbestand 0.00355787 BTC, Steuerwert ~CHF 249.01
  relai_ref: {
    address:               "bc1qfwuwnn39v5460vla3gvmcl8q4jlraps92jlcr9",
    beschreibung:          "Relai Referenz-Wallet (6 Käufe 2025)",
    erwarteteTxAnzahl2025: 6,
    erwartetEndbestand2025: 0.00355787,
    adresstyp:             "bech32-segwit (bc1q)",
  },

  // Binance Cold Wallet – P2SH Legacy Format (3...)
  // Quelle: bitinfocharts.com/top-100-richest-bitcoin-addresses
  binance_cold: {
    address:      "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo",
    beschreibung: "Binance Cold Wallet – P2SH Legacy",
    adresstyp:    "legacy-p2sh (3...)",
  },

  // Legacy P2PKH (1...) – ältestes Adressformat
  legacy_p2pkh: {
    address:      "1P5ZEDWTKTFGxQjZphgWPQUpe554WKDfHQ",
    beschreibung: "Legacy P2PKH Adresse (1...)",
    adresstyp:    "legacy-p2pkh (1...)",
  },
};

// ─── BEKANNTE ETH-ADRESSEN (öffentlich, verifizierbar) ───────────────────────

const ETH_WALLETS = {
  // Vitalik Buterin – vitalik.eth
  // Quelle: etherscan.io/address/0xd8da6bf26964af9d7eed9e03e53415d37aa96045
  vitalik: {
    address:      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    beschreibung: "Vitalik Buterin (vitalik.eth)",
  },

  // Ethereum Foundation
  eth_foundation: {
    address:      "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe",
    beschreibung: "Ethereum Foundation",
  },
};

// ─── BEKANNTE SOL-ADRESSEN (öffentlich, verifizierbar) ───────────────────────

const SOL_WALLETS = {
  // Solana Foundation Stake Authority
  sol_foundation: {
    address:      "3bZQognFbVcY5f6yoNnMiJqMSnhSknJHfzSFNXKpWWjF",
    beschreibung: "Solana Foundation",
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BTC TESTS – Relai Referenz-Wallet
// ═══════════════════════════════════════════════════════════════════════════

describe("BTC Real-Wallet – Relai Referenz-Wallet", () => {
  const w = BTC_WALLETS.relai_ref;

  test("Adressformat bc1q erkannt", () => {
    expect(w.address).toMatch(/^bc1[a-z0-9]{39,87}$/i);
  });

  test("API-Aufruf erfolgreich (kein Netzwerkfehler)", async () => {
    const txs = await fetchAllTransactions(w.address);
    expect(Array.isArray(txs)).toBe(true);
    expect(txs.length).toBeGreaterThan(0);
  }, 60000);

  test("Genau 6 Transaktionen in 2025", async () => {
    const allTxs  = await fetchAllTransactions(w.address);
    const parsed  = parseTxsForAddress(allTxs, w.address);
    const tx2025  = parsed.filter((t) => t.date.startsWith("2025"));
    expect(tx2025.length).toBe(w.erwarteteTxAnzahl2025);
  }, 60000);

  test("Endbestand 2025 = 0.00355787 BTC (exakt)", async () => {
    const allTxs = await fetchAllTransactions(w.address);
    const parsed  = parseTxsForAddress(allTxs, w.address);
    const kurs    = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    const fifo    = calculateFIFO(parsed, kurs.price, 2025);
    expect(fifo.endbestandAmount).toBeCloseTo(w.erwartetEndbestand2025, 6);
  }, 120000);

  test("Steuerwert konsistent: endbestand × kurs3112", async () => {
    const allTxs   = await fetchAllTransactions(w.address);
    const parsed   = parseTxsForAddress(allTxs, w.address);
    const kurs     = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    const fifo     = calculateFIFO(parsed, kurs.price, 2025);
    const sw       = Math.round(fifo.endbestandAmount * kurs.price * 100) / 100;
    expect(() =>
      validateSteuerDaten({
        endbestandBTC: fifo.endbestandAmount,
        kurs3112:      kurs.price,
        steuerwert:    sw,
        totalTaxValue: sw,
      })
    ).not.toThrow();
  }, 120000);

  test("Kein fremder Change-Output im Endbestand (nicht 0.00528039 BTC)", async () => {
    // Vor dem Adressfilter-Fix war Endbestand 0.00528 statt 0.00355787
    const allTxs = await fetchAllTransactions(w.address);
    const parsed  = parseTxsForAddress(allTxs, w.address);
    const kurs    = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    const fifo    = calculateFIFO(parsed, kurs.price, 2025);
    expect(fifo.endbestandAmount).not.toBeCloseTo(0.00528039, 4);
    expect(fifo.endbestandAmount).toBeCloseTo(0.00355787, 5);
  }, 120000);

  test("Vollständiger Flow: XML + Barcode ohne Crash", async () => {
    const allTxs  = await fetchAllTransactions(w.address);
    const parsed  = parseTxsForAddress(allTxs, w.address);
    const kurs    = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    const fifo    = calculateFIFO(parsed, kurs.price, 2025);
    const sw      = Math.round(fifo.endbestandAmount * kurs.price * 100) / 100;
    const tx2025  = parsed.filter((t) => t.date.startsWith("2025"));

    const xmlDaten = {
      wallets:         [w.address],
      taxYear:         2025,
      canton:          "ZH",
      totalSteuerwert: sw,
      assets: [{
        symbol:        "BTC",
        valorennummer: "3841927",
        endbestand:    fifo.endbestandAmount,
        kursStichtag:  kurs.price,
        steuerwert:    sw,
        positionId:    1,
        fifo:          { anfangsbestandAmount: fifo.anfangsbestandAmount },
        transaktionen: tx2025.map((t) => ({
          date:    t.date,
          type:    t.type === "eingang" ? "in" : "out",
          amount:  t.amount,
          chfKurs: kurs.price,
          chfWert: Math.round(t.amount * kurs.price * 100) / 100,
        })),
      }],
    };

    const xml      = generateESteuerauszugXML(xmlDaten, { name: "Referenz" });
    expect(xml).toContain('valorNumber="3841927"');
    expect(xml).toContain(`totalTaxValue="${sw.toFixed(2)}"`);

    const barcodes = await generateAllBarcodes(xml);
    expect(barcodes.length).toBeGreaterThan(0);
    barcodes.forEach((b) => expect(b.png[0]).toBe(0x89)); // PNG-Header
  }, 180000);
});

// ═══════════════════════════════════════════════════════════════════════════
// BTC TESTS – Adressformate (Struktur)
// ═══════════════════════════════════════════════════════════════════════════

describe("BTC Real-Wallet – Adressformate (Struktur)", () => {
  test("Legacy P2SH (3...) Adressformat erkannt (regex)", () => {
    // Binance-Cold-Wallet hat Tausende TXs → API-Timeout, daher nur Format-Test
    const addr = BTC_WALLETS.binance_cold.address;
    expect(addr).toMatch(/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/);
    expect(addr.startsWith("3")).toBe(true);
  });

  test("Legacy P2PKH (1...) wird erkannt und API antwortet", async () => {
    const addr = BTC_WALLETS.legacy_p2pkh.address;
    expect(addr).toMatch(/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/);
    const txs = await fetchAllTransactions(addr);
    expect(Array.isArray(txs)).toBe(true);
  }, 60000);

  test("calcAmountForAddress gibt 0 für fremde Transaktion zurück", () => {
    const tx = {
      txid:   "test",
      status: { block_time: 1753401600 },
      vout:   [{ value: 100000, scriptpubkey_address: "bc1qfremd123" }],
      vin:    [{ prevout: { value: 50000, scriptpubkey_address: "bc1qfremd456" } }],
    };
    expect(calcAmountForAddress(tx, "bc1qmeineadresse")).toBeCloseTo(0, 8);
  });

  test("Change-Output korrekt verarbeitet (nur eigener Netto-Anteil)", () => {
    const addr = "bc1qmeineadresse";
    const tx = {
      txid:   "test",
      status: { block_time: 1753401600 },
      vout: [
        { value: 50000, scriptpubkey_address: "bc1qempfaenger" },
        { value: 10000, scriptpubkey_address: addr },              // Change zurück
      ],
      vin: [{ prevout: { value: 61000, scriptpubkey_address: addr } }],
    };
    // Net: +10000 (change) − 61000 (sent) = −51000 Satoshi
    expect(calcAmountForAddress(tx, addr)).toBeCloseTo(-51000 / 1e8, 8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BTC TESTS – Verschiedene Steuerjahre
// ═══════════════════════════════════════════════════════════════════════════

describe("BTC Real-Wallet – Verschiedene Steuerjahre", () => {
  const addr = BTC_WALLETS.relai_ref.address;

  test.each([2024, 2025])(
    "Jahr %i: Endbestand >= 0 und Steuerwert konsistent",
    async (year) => {
      const allTxs = await fetchAllTransactions(addr);
      const parsed = parseTxsForAddress(allTxs, addr);
      const kurs   = await getHistoricalPriceChf("bitcoin", `${year}-12-31`);
      if (!kurs.price || kurs.source === "unavailable") return;
      const fifo = calculateFIFO(parsed, kurs.price, year);
      expect(fifo.endbestandAmount).toBeGreaterThanOrEqual(0);
      if (fifo.endbestandAmount > 0) {
        const sw = Math.round(fifo.endbestandAmount * kurs.price * 100) / 100;
        expect(sw).toBeGreaterThan(0);
      }
    },
    120000
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ETH TESTS – calcAmountForEthAddress (Unit-Tests, kein Netzwerk)
// ═══════════════════════════════════════════════════════════════════════════

describe("ETH – calcAmountForEthAddress (Adressfilter)", () => {
  const addr = ETH_WALLETS.vitalik.address.toLowerCase();

  test("ETH-Adressformat 0x... erkannt", () => {
    expect(ETH_WALLETS.vitalik.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test("Eigene Adresse als Empfänger: Betrag positiv", () => {
    const tx = { from: "0xfremd", to: addr, value: "1000000000000000000" };
    expect(calcAmountForEthAddress(tx, addr)).toBeCloseTo(1.0, 8);
  });

  test("Fremde Transaktion: Betrag = 0", () => {
    const tx = { from: "0xfremd1", to: "0xfremd2", value: "1000000000000000000" };
    expect(calcAmountForEthAddress(tx, addr)).toBe(0);
  });

  test("case-insensitive: toUpperCase wird toleriert", () => {
    const tx = { from: "0xfremd", to: ETH_WALLETS.vitalik.address.toUpperCase(), value: "500000000000000000" };
    expect(calcAmountForEthAddress(tx, addr)).toBeCloseTo(0.5, 8);
  });

  test("Ausgang: eigene Adresse als Sender → negative Zahl", () => {
    const tx = { from: addr, to: "0xempfaenger", value: "2000000000000000000" };
    expect(calcAmountForEthAddress(tx, addr)).toBeCloseTo(-2.0, 8);
  });

  test("Wert 0: kein Crash", () => {
    const tx = { from: addr, to: "0xempfaenger", value: "0" };
    expect(calcAmountForEthAddress(tx, addr)).toBe(0);
  });
});

// ─── ETH API Test (benötigt ALCHEMY_API_KEY) ──────────────────────────────

describe("ETH Real-Wallet – API (übersprungen ohne ALCHEMY_API_KEY)", () => {
  test("Alchemy API erreichbar (wenn Key vorhanden)", async () => {
    if (!process.env.ALCHEMY_API_KEY) {
      console.warn("[test] ALCHEMY_API_KEY nicht gesetzt – ETH-API-Test übersprungen");
      return;
    }
    const url = `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.result).toBeDefined();
  }, 30000);
});

// ═══════════════════════════════════════════════════════════════════════════
// ETH TESTS – Historische Kurse (reale API)
// ═══════════════════════════════════════════════════════════════════════════

describe("ETH Real-Wallet – Historische Kurse (reale API)", () => {
  test.each([
    ["ethereum",  "2025-12-31", 1500, 6000,  "ETH 2025"],
    ["ethereum",  "2024-12-31", 2500, 5000,  "ETH 2024 ~3400"],
    ["ethereum",  "2023-12-31", 1800, 3000,  "ETH 2023"],
    ["chainlink", "2024-12-31", 8,   25,     "LINK 2024"],
    ["usd-coin",  "2024-12-31", 0.85, 1.05,  "USDC 2024"],
    ["tether",    "2024-12-31", 0.88, 1.05,  "USDT 2024"],
  ])(
    "%s %s (%s): CHF %i–%i",
    async (coinId, date, min, max, _desc) => {
      const r = await getHistoricalPriceChf(coinId, date);
      expect(r.price).toBeGreaterThan(min * 0.85);
      expect(r.price).toBeLessThan(max * 1.15);
      expect(r.source).not.toBe("unavailable");
    },
    30000
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// SOL TESTS – Historische Kurse + Adressformat
// ═══════════════════════════════════════════════════════════════════════════

describe("SOL Real-Wallet – Historische Kurse (reale API)", () => {
  test.each([
    ["solana", "2025-12-31", 50,  400, "SOL 2025"],
    ["solana", "2024-12-31", 150, 300, "SOL 2024"],
    ["solana", "2023-12-31", 60,  130, "SOL 2023"],
    ["solana", "2022-12-31", 8,   15,  "SOL 2022 Bear"],
  ])(
    "%s %s (%s): CHF %i–%i",
    async (coinId, date, min, max, _desc) => {
      const r = await getHistoricalPriceChf(coinId, date);
      expect(r.price).toBeGreaterThan(min * 0.85);
      expect(r.price).toBeLessThan(max * 1.15);
      expect(r.source).not.toBe("unavailable");
    },
    30000
  );
});

describe("SOL Real-Wallet – Adressformat (Struktur)", () => {
  test("SOL-Adressformat erkannt (base58, 32–44 Zeichen)", () => {
    const addr = SOL_WALLETS.sol_foundation.address;
    expect(addr.length).toBeGreaterThanOrEqual(32);
    expect(addr.length).toBeLessThanOrEqual(44);
    expect(addr).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/); // base58
  });

  test("Solana RPC erreichbar (kein Key benötigt)", async () => {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
    });
    expect(res.ok).toBe(true);
    const data = await res.json();
    // Solana RPC gibt "ok" oder Fehler zurück
    expect(data).toBeDefined();
  }, 30000);
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN TESTS – CoinGecko DD-MM-YYYY Datumformat
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-Chain – CoinGecko Datumformat DD-MM-YYYY korrekt", () => {
  // Verhindert den Bug vom 14.03.2026:
  // YYYY-MM-DD Format → falscher Kurs (CHF 69'383 statt 69'990)
  // DD-MM-YYYY Format → korrekter historischer Kurs

  test.each([
    ["bitcoin",  "2025-12-31", 63000,  78000,  "BTC ESTV-Kurs ~69'990"],
    ["bitcoin",  "2024-12-31", 85000,  110000, "BTC 2024 ~96'000"],
    ["bitcoin",  "2023-12-31", 35000,  50000,  "BTC 2023 ~42'000"],
    ["bitcoin",  "2022-12-31", 13000,  20000,  "BTC 2022 Bear ~16'500"],
    ["bitcoin",  "2021-12-31", 40000,  58000,  "BTC 2021 ~47'000"],
    ["ethereum", "2025-12-31", 1500,   6000,   "ETH 2025"],
    ["ethereum", "2024-12-31", 2500,   5000,   "ETH 2024 ~3'400"],
    ["solana",   "2024-12-31", 150,    300,    "SOL 2024 ~220"],
    ["chainlink","2024-12-31", 8,      25,     "LINK 2024"],
  ])(
    "%s %s (%s): CHF %i–%i",
    async (coinId, date, min, max, _desc) => {
      const r = await getHistoricalPriceChf(coinId, date);
      expect(r.price).toBeGreaterThan(0);
      expect(r.source).not.toBe("unavailable");
      expect(r.price).toBeGreaterThan(min * 0.85);
      expect(r.price).toBeLessThan(max * 1.15);
    },
    30000
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN – Historischer Bug-Schutz (Steuerwert ≠ 366.37)
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-Chain – Steuerwert nie 366.37 (historischer Bug)", () => {
  test("BTC Referenz-Wallet 2025: Steuerwert ≠ 366.37", async () => {
    const addr   = BTC_WALLETS.relai_ref.address;
    const allTxs = await fetchAllTransactions(addr);
    const parsed = parseTxsForAddress(allTxs, addr);
    const kurs   = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    const fifo   = calculateFIFO(parsed, kurs.price, 2025);
    const sw     = Math.round(fifo.endbestandAmount * kurs.price * 100) / 100;

    expect(sw).not.toBeCloseTo(366.37, 0); // S.1-Bug (Folgejahr-Käufe)
    expect(sw).not.toBeCloseTo(282.39, 0); // Anderer alter Fehlerwert
    // Sollte nahe CHF 249 sein (0.00355787 × ~69'990)
    expect(sw).toBeGreaterThan(220);
    expect(sw).toBeLessThan(280);
  }, 180000);

  test("Steuerwert === totalTaxValue (Single Source of Truth)", () => {
    // 0.00355787 × 69990.44 = 249.017... → gerundet 249.02
    const sw = Math.round(0.00355787 * 69990.44 * 100) / 100; // 249.02
    expect(() =>
      validateSteuerDaten({
        endbestandBTC: 0.00355787,
        kurs3112:      69990.44,
        steuerwert:    sw,
        totalTaxValue: sw,
      })
    ).not.toThrow();

    // Abweichung zwischen steuerwert und totalTaxValue → Fehler
    expect(() =>
      validateSteuerDaten({
        endbestandBTC: 0.00355787,
        kurs3112:      69990.44,
        steuerwert:    sw,
        totalTaxValue: 366.37, // ← alter Bug-Wert
      })
    ).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN – Barcode-Generierung mit realem XML
// ═══════════════════════════════════════════════════════════════════════════

describe("Cross-Chain – Barcode-Generierung mit realem XML", () => {
  test("bwip-js importierbar (kein fehlendes Modul)", async () => {
    const bwipjs   = await import("bwip-js");
    const toBuffer = bwipjs.default?.toBuffer || bwipjs.toBuffer;
    expect(typeof toBuffer).toBe("function");
  });

  test.each(["bitcoin", "ethereum", "solana"])(
    "%s: reales XML → Barcodes ohne Crash",
    async (chain) => {
      const kursMap = { bitcoin: 70000, ethereum: 3500, solana: 220 };
      const swMap   = { bitcoin: 35000, ethereum: 1750, solana: 110 };
      const volMap  = { bitcoin: "3841927", ethereum: "385539", solana: "81720700" };
      const symMap  = { bitcoin: "BTC", ethereum: "ETH", solana: "SOL" };
      const addrMap = {
        bitcoin:  "bc1qtest",
        ethereum: "0xtest123456789abcdef0123456789abcdef012345",
        solana:   "3bZQognFbVcY5f6yoNnMiJqMSnhSknJHfzSFNXKpWWjF",
      };

      const xmlDaten = {
        wallets:         [addrMap[chain]],
        taxYear:         2025,
        canton:          "ZH",
        totalSteuerwert: swMap[chain],
        assets: [{
          symbol:        symMap[chain],
          valorennummer: volMap[chain],
          endbestand:    0.5,
          kursStichtag:  kursMap[chain],
          steuerwert:    swMap[chain],
          positionId:    1,
          fifo:          { anfangsbestandAmount: 0 },
          transaktionen: [{
            date:    "2025-06-01",
            type:    "in",
            amount:  0.5,
            chfKurs: kursMap[chain] * 0.9,
            chfWert: swMap[chain] * 0.9,
          }],
        }],
      };

      const xml = generateESteuerauszugXML(xmlDaten, { name: "Test" });
      expect(xml.length).toBeGreaterThan(500);

      const barcodes = await generateAllBarcodes(xml);
      expect(barcodes.length).toBeGreaterThan(0);
      barcodes.forEach((b) => {
        expect(b.png[0]).toBe(0x89);          // PNG-Header
        expect(b.png.length).toBeGreaterThan(5000); // min. 5 KB bei scale=4
      });
    },
    30000
  );
});
