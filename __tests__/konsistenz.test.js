import { generateESteuerauszugXML } from "../lib/esteuerauszug";
import { validateSteuerDaten } from "../lib/validate";

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
