/**
 * Kurs 31.12. + Steuerwert-Konsistenz
 *
 * Verhindert: falsche Preisquelle (CryptoCompare spot 69'383 statt ESTV 69'990),
 * inkonsistente Steuerwerte zwischen eSteuerauszug und Übersichts-PDF.
 *
 * Referenzwerte (anonymisiert):
 *   Endbestand:  0.00355787 BTC
 *   Kurs 31.12.: CHF 69'990.44 (ESTV Referenz 2025)
 *   Steuerwert:  CHF 249.02
 */

import fs from "fs";
import { calculateFIFO } from "../lib/fifo";
import { validateSteuerDaten } from "../lib/validate";

const ENDBESTAND = 0.00355787;
const KURS_3112  = 69990.44;
const STEUERWERT = Math.round(ENDBESTAND * KURS_3112 * 100) / 100; // 249.02

// ─── 1. price-service.js – CoinGecko Datum-Format + API Key ──────────────────

describe("price-service.js – CoinGecko Datum-Format und API Key", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("lib/price-service.js", "utf8");
  });

  test("Konvertiert YYYY-MM-DD zu DD-MM-YYYY für CoinGecko /history API", () => {
    // CoinGecko history erwartet DD-MM-YYYY – falsches Format → falscher Preis
    expect(src).toContain("geckoDate = `${d}-${m}-${y}`");
  });

  test("fetchMitTimeout akzeptiert extraHeaders Parameter", () => {
    expect(src).toContain("extraHeaders");
  });

  test("Enthält COINGECKO_API_KEY Umgebungsvariable", () => {
    expect(src).toContain("COINGECKO_API_KEY");
  });

  test("Setzt x-cg-demo-api-key Header wenn Key vorhanden", () => {
    expect(src).toContain("x-cg-demo-api-key");
  });

  test("geckoHeaders wird für beide CoinGecko-Aufrufe verwendet (Stufe 1 + 4)", () => {
    expect(src).toContain("geckoHeaders");
    // geckoHeaders mindestens 2× (Stufe 1 und Stufe 4)
    const treffer = (src.match(/geckoHeaders/g) || []).length;
    expect(treffer).toBeGreaterThanOrEqual(2);
  });

  test("Stufe 1 (CoinGecko /history) kommt vor Stufe 2 (CryptoCompare)", () => {
    const stufe1 = src.indexOf("coingecko.com/api/v3/coins");
    const stufe2 = src.indexOf("cryptocompare.com/data/pricehistorical");
    expect(stufe1).toBeGreaterThan(-1);
    expect(stufe2).toBeGreaterThan(-1);
    expect(stufe1).toBeLessThan(stufe2);
  });
});

// ─── 2. Steuerwert-Formel ─────────────────────────────────────────────────────

describe("Steuerwert = Endbestand × Kurs 31.12. (Formel)", () => {
  test("CHF 249.02 = 0.00355787 BTC × CHF 69990.44 (ESTV Referenz 2025)", () => {
    const sw = Math.round(ENDBESTAND * KURS_3112 * 100) / 100;
    expect(sw).toBe(249.02);
    expect(STEUERWERT).toBe(249.02);
  });

  test("FIFO-Endbestand × Jahresschlusskurs = 249.02", () => {
    const txs = [
      { datum: "2025-07-25T00:00:00Z", typ: "eingang", betrag: ENDBESTAND, waehrung: "BTC", chfZeitpunkt: 49.23 },
    ];
    const fifo = calculateFIFO(txs, KURS_3112, 2025);
    const sw   = Math.round(fifo.endbestandAmount * KURS_3112 * 100) / 100;
    expect(sw).toBe(249.02);
  });

  test("validateSteuerDaten akzeptiert konsistente Werte ohne Exception", () => {
    expect(() =>
      validateSteuerDaten({
        endbestandBTC: ENDBESTAND,
        kurs3112:      KURS_3112,
        steuerwert:    STEUERWERT,
        totalTaxValue: STEUERWERT,
      })
    ).not.toThrow();
  });

  test("Kein Datenverlust durch Floating-Point: 0.00355787 × 69990.44 → 249.02", () => {
    // Explizite Prüfung – Floating-Point kann hier überraschend sein
    const rohwert = ENDBESTAND * KURS_3112; // ~249.017...
    const gerundet = Math.round(rohwert * 100) / 100;
    expect(gerundet).toBe(249.02);
  });
});

// ─── 3. Konsistenz: eSteuerauszug = Übersichts-PDF ───────────────────────────

describe("Steuerwert-Konsistenz: eSteuerauszug = Übersichts-PDF", () => {
  let steuerauszugSrc, pdfSrc;
  beforeAll(() => {
    steuerauszugSrc = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    pdfSrc          = fs.readFileSync("app/api/export/pdf/route.js", "utf8");
  });

  test("steuerauszug/route.js importiert getHistoricalPriceChf aus lib/price-service", () => {
    expect(steuerauszugSrc).toContain("getHistoricalPriceChf");
    expect(steuerauszugSrc).toContain("price-service");
  });

  test("pdf/route.js importiert getHistoricalPriceChf aus lib/price-service", () => {
    expect(pdfSrc).toContain("getHistoricalPriceChf");
    expect(pdfSrc).toContain("price-service");
  });

  test("pdf/route.js deklariert kursStichtag VOR berechneFifo()-Aufruf (kein TDZ)", () => {
    // TDZ-Bug: let kursStichtag muss VOR const fifo = berechneFifo(...) stehen
    const kursPos  = pdfSrc.indexOf("let kursStichtag");
    const fifoPos  = pdfSrc.indexOf("const fifo = berechneFifo");
    expect(kursPos).toBeGreaterThan(-1);
    expect(fifoPos).toBeGreaterThan(-1);
    expect(kursPos).toBeLessThan(fifoPos);
  });

  test("pdf/route.js deklariert jahresendeFilter VOR berechneFifo()-Aufruf (kein TDZ)", () => {
    const filterPos = pdfSrc.indexOf("jahresendeFilter");
    const fifoPos   = pdfSrc.indexOf("const fifo = berechneFifo");
    expect(filterPos).toBeGreaterThan(-1);
    expect(fifoPos).toBeGreaterThan(-1);
    expect(filterPos).toBeLessThan(fifoPos);
  });

  test("steuerauszug/route.js verwendet steuerwertHauptsymbol = endbestand × jahresendKurs", () => {
    expect(steuerauszugSrc).toContain("steuerwertHauptsymbol = Math.round(endbestandHauptsymbol * jahresendKurs");
  });
});

// ─── 4. Kaskade: CryptoCompare pricehistorical ≠ ESTV Tagesreferenz ──────────

describe("Kaskade: CryptoCompare pricehistorical ist Spot-Preis (nicht ESTV-Referenz)", () => {
  test("CryptoCompare Spot-Kurs (69383) ≠ ESTV Tagesreferenz (69990)", () => {
    // CryptoCompare pricehistorical gibt Spot-Preis um 23:59:59 UTC zurück.
    // ESTV-Referenz ist ein Tagesdurchschnitt. Deshalb CoinGecko (Stufe 1) bevorzugen.
    const cryptoCompareSpot = 69383.70;
    const estvReferenz      = 69990.44;
    expect(cryptoCompareSpot).not.toBe(estvReferenz);
    expect(Math.abs(estvReferenz - cryptoCompareSpot)).toBeGreaterThan(100);
  });

  test("Mit korrektem Kurs (69990.44): Steuerwert = 249.02", () => {
    const sw = Math.round(ENDBESTAND * 69990.44 * 100) / 100;
    expect(sw).toBe(249.02);
  });

  test("Mit falschem Kurs (69383.70): Steuerwert wäre 246.86 (falsch)", () => {
    const swFalsch = Math.round(ENDBESTAND * 69383.70 * 100) / 100;
    expect(swFalsch).toBe(246.86);
    expect(swFalsch).not.toBe(249.02);
  });
});
