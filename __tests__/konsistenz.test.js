import { generateESteuerauszugXML } from "../lib/esteuerauszug";
import { validateSteuerDaten } from "../lib/validate";
import { buildSeitenbarcodeData, encodeCode128C } from "../lib/code128c";
import { ESTV_JAHRESKURSE } from "../lib/price-service";

// 0.00355787 × 69990.44 = 249.02 (gerundet auf 2 Stellen)
const ENDBESTAND = 0.00355787;
const KURS_3112  = 69990.44;
const STEUERWERT = Math.round(ENDBESTAND * KURS_3112 * 100) / 100; // 249.02

const baseDaten = {
  wallets: ["bc1qtest"],
  taxYear: 2025,
  canton: "ZH",
  endbestandBTC: ENDBESTAND,
  kurs3112: KURS_3112,
  steuerwert: STEUERWERT,
  totalTaxValue: STEUERWERT,
  totalGrossRevenueA: 0,
  totalGrossRevenueB: 0,
  totalWithHoldingTax: 0,
};

const xmlDaten = {
  wallets: ["bc1qtest"],
  taxYear: 2025,
  canton: "ZH",
  totalSteuerwert: STEUERWERT,
  assets: [
    {
      symbol: "BTC",
      valorennummer: "3841927",
      endbestand: ENDBESTAND,
      kursStichtag: KURS_3112,
      steuerwert: STEUERWERT,
      positionId: 1,
      fifo: { anfangsbestandAmount: 0 },
      transaktionen: [
        {
          date: "2025-07-25",
          type: "in",
          amount: 0.00052657,
          chfKurs: 93491.84,
          chfWert: 49.23,
        },
      ],
    },
  ],
};

// ─── validateSteuerDaten ──────────────────────────────────────────────────────
describe("validateSteuerDaten – Konsistenzprüfung", () => {
  test("OK bei konsistenten Daten", () => {
    expect(() => validateSteuerDaten(baseDaten)).not.toThrow();
  });

  test("Fehler wenn Steuerwert ≠ Endbestand × Kurs", () => {
    const falsch = { ...baseDaten, steuerwert: 300.00, totalTaxValue: 300.00 };
    expect(() => validateSteuerDaten(falsch)).toThrow();
  });

  test("Fehler wenn XML totalTaxValue ≠ PDF steuerwert", () => {
    const falsch = { ...baseDaten, totalTaxValue: 300 };
    expect(() => validateSteuerDaten(falsch)).toThrow();
  });

  test("Fehler wenn kein Kurs vorhanden", () => {
    const falsch = { ...baseDaten, kurs3112: 0 };
    expect(() => validateSteuerDaten(falsch)).toThrow();
  });

  test("Fehler bei negativem Endbestand", () => {
    const falsch = { ...baseDaten, endbestandBTC: -0.001, steuerwert: -69.99, totalTaxValue: -69.99 };
    expect(() => validateSteuerDaten(falsch)).toThrow();
  });
});

// ─── XML Konsistenz ───────────────────────────────────────────────────────────
describe("eSteuerauszug XML – Konsistenz", () => {
  test("XML totalTaxValue = steuerwert (2 Dezimalstellen weil >= CHF 100)", () => {
    const xml = generateESteuerauszugXML(xmlDaten, { name: "Test User" });
    expect(xml).toContain(`totalTaxValue="${STEUERWERT.toFixed(2)}"`);
  });

  test("Transaktion erscheint als stock im XML", () => {
    const xml = generateESteuerauszugXML(xmlDaten, { name: "Test User" });
    expect(xml).toContain("<stock>");
    expect(xml).toContain("<mutation>true</mutation>");
  });

  test("Kein doppelter Endbestand-Stock (nur Transaktionen + optionaler Anfangsbestand)", () => {
    const xml = generateESteuerauszugXML(xmlDaten, { name: "Test User" });
    const stockCount = (xml.match(/<stock>/g) || []).length;
    // 0 Anfangsbestand (anfangsbestandAmount=0) + 1 Transaktion = 1 stock
    expect(stockCount).toBe(1);
  });

  test("Anfangsbestand erscheint wenn > 0", () => {
    const datenMitAnfang = {
      ...xmlDaten,
      assets: [{ ...xmlDaten.assets[0], fifo: { anfangsbestandAmount: 0.002 } }],
    };
    const xml = generateESteuerauszugXML(datenMitAnfang, {});
    expect(xml).toContain("<mutation>false</mutation>");
    expect(xml).toContain("<referenceDate>2025-01-01</referenceDate>");
  });

  test("Namespace korrekt", () => {
    const xml = generateESteuerauszugXML(xmlDaten, {});
    expect(xml).toContain('xmlns="urn:ech:xmlns:eCH-0196:2"');
  });
});

// ─── Seitenbarcode (CODE128C) ─────────────────────────────────────────────────
describe("Seitenbarcode – buildSeitenbarcodeData + encodeCode128C", () => {
  test("buildSeitenbarcodeData gibt korrekten 18-stelligen String zurück", () => {
    expect(buildSeitenbarcodeData("3841927", 2025, 1, 3)).toBe("038419272025001003");
    expect(buildSeitenbarcodeData("3841927", 2025, 2, 3)).toBe("038419272025002003");
    expect(buildSeitenbarcodeData("3841927", 2025, 3, 3)).toBe("038419272025003003");
  });

  test("buildSeitenbarcodeData gibt immer gerade Zeichenanzahl zurück (CODE128C-Pflicht)", () => {
    const result = buildSeitenbarcodeData("3841927", 2025, 1, 3);
    expect(result.length % 2).toBe(0);
  });

  test("Valorennummer wird auf 8 Stellen aufgefüllt", () => {
    expect(buildSeitenbarcodeData("3841927", 2025, 1, 3).substring(0, 8)).toBe("03841927");
  });

  test("Gesamtlänge = 18 Zeichen", () => {
    expect(buildSeitenbarcodeData("3841927", 2025, 5, 10).length).toBe(18);
  });

  test("encodeCode128C wirft bei ungerader Ziffernanzahl", () => {
    expect(() => encodeCode128C("12345")).toThrow();
  });

  test("encodeCode128C gibt nur 0 und 1 zurück", () => {
    const bits = encodeCode128C("038419272025001003");
    expect(bits).toMatch(/^[01]+$/);
  });

  test("Steuerübersichts-Route ruft drawSeitenbarcode NICHT auf", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/api/export/pdf/route.js", "utf8");
    expect(src).not.toContain("drawSeitenbarcode");
    expect(src).not.toContain("seitenbarcode");
  });

  test("eSteuerauszug-Route ruft drawSeitenbarcode AUF", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("drawSeitenbarcode");
  });

  test("CONTENT_LEFT ist grösser als Barcode-Breite plus Margin", () => {
    const { BARCODE_W, BARCODE_MARGIN, CONTENT_LEFT } = require("../lib/pdf-layout.js");
    expect(CONTENT_LEFT).toBeGreaterThan(BARCODE_W + BARCODE_MARGIN);
  });
});

// ─── Steuerwert-Konsistenz verschiedene Jahre ─────────────────────────────────
describe("Steuerwert-Berechnung – verschiedene Jahre", () => {
  test.each([
    [2020, 0.1,       24000,    2400.00],
    [2021, 0.05,      60000,    3000.00],
    [2022, 0.2,       16000,    3200.00],
    [2023, 0.3,       34000,   10200.00],
    [2024, 0.15,      96000,   14400.00],
    [2025, 0.00355787, 69990.44, 249.01],
  ])("Jahr %i: %f BTC × CHF %f ≈ CHF %f", (year, btc, kurs, erwartet) => {
    const berechnet = Math.round(btc * kurs * 100) / 100;
    expect(berechnet).toBeCloseTo(erwartet, 0);
  });
});

// ─── ESTV Jahreskurse ─────────────────────────────────────────────────────────
describe("ESTV Jahreskurse – verbindliche ESTV-Kursliste per 31.12.", () => {
  test("ESTV_JAHRESKURSE ist exportiert und enthält bitcoin", () => {
    expect(typeof ESTV_JAHRESKURSE).toBe("object");
    expect(ESTV_JAHRESKURSE).toHaveProperty("bitcoin");
  });

  test("ESTV BTC 2025 = CHF 69'990.44 (Relai-Referenz)", () => {
    expect(ESTV_JAHRESKURSE.bitcoin[2025]).toBe(69_990.44);
  });

  test("ESTV BTC 2024 vorhanden (> 0)", () => {
    expect(ESTV_JAHRESKURSE.bitcoin[2024]).toBeGreaterThan(0);
  });

  test("Steuerwert 2025 mit ESTV-Kurs korrekt: 0.00355787 BTC × CHF 69'990.44 = CHF 249.02", () => {
    const endbestand = 0.00355787;
    const kurs = ESTV_JAHRESKURSE.bitcoin[2025];
    const steuerwert = Math.round(endbestand * kurs * 100) / 100;
    expect(steuerwert).toBe(249.02);
  });

  test("price-service.js deklariert ESTV als Stufe 0 (vor CoinGecko)", () => {
    const fs = require("fs");
    const src = fs.readFileSync("lib/price-service.js", "utf8");
    // ESTV-Check muss VOR dem CoinGecko-Block stehen
    const idxEstv    = src.indexOf("ESTV_JAHRESKURSE");
    const idxGecko   = src.indexOf("coingecko.com");
    expect(idxEstv).toBeGreaterThan(-1);
    expect(idxEstv).toBeLessThan(idxGecko);
  });

  test("analyze/route.js berechnet Steuerwert EINMAL (kein mehrfaches fifo.endbestand × kurs)", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/api/analyze/route.js", "utf8");
    expect(src).toContain("Steuerwert EINMAL");
    // Kein direktes endbestandAmount * kurs außer an der einen definierten Stelle
    const matches = src.match(/endbestandAmount\s*\*\s*kursStichtag/g) || [];
    expect(matches.length).toBe(1);
  });
});

// ─── Multi-Wallet Bugs (BUG 1 + BUG 2 + BUG 3) ───────────────────────────────
describe("Multi-Wallet Bugs – Fixes verifizieren", () => {
  test("BUG 1: steuerauszug/route.js hat immer genau 1 Barcode-Seite (2-Zeilen-Grid)", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    // Keine dynamische Barcode-Seitenanzahl mehr – immer 1 Barcode-Seite
    expect(src).toContain("gesamtSeiten = 1 + txSeitenAnz + 1");
    expect(src).not.toContain("col === 0 && b > 0");  // kein multi-page loop
  });

  test("BUG 1: steuerauszug/route.js 2-Zeilen-Grid mit dynamischer Höhe (needsTwoRows)", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("needsTwoRows");
    expect(src).toContain("BARCODE_GAP_Y");
  });

  test("BUG 2: Dashboard TransaktionsTabelle key enthält Wallet-Adresse (kein tx.hash-Collision)", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).not.toContain("key={tx.hash || index}");
    expect(src).toMatch(/key=\{`\$\{tx\.wallet/);
  });

  test("BUG 3: pdf/route.js portfolioWertGesamt priorisiert kursStichtag für Hauptwährung", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/api/export/pdf/route.js", "utf8");
    expect(src).toContain("sym === hauptwaehrung ? kursStichtag");
  });

  test("BUG 3: Dashboard Multi-Wallet analyze verwendet taxYear - 1 (ESTV-Kurs)", () => {
    const fs = require("fs");
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    const matches = src.match(/getFullYear\(\)\s*-\s*1/g) || [];
    // Sowohl single-wallet als auch multi-wallet useEffect nutzen getFullYear() - 1
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
