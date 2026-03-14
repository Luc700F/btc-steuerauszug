import { validateSteuerDaten } from "../lib/validate";
import { generateESteuerauszugXML } from "../lib/esteuerauszug";
import fs from "fs";

// ─── Referenz-Steuerdaten (anonymisiert) ──────────────────────────────────────
const ENDBESTAND  = 0.00355787;
const KURS_3112   = 69990.44;
const STEUERWERT  = Math.round(ENDBESTAND * KURS_3112 * 100) / 100; // 249.02

const VALID_STEUERDATEN = {
  wallets:          ["bc1qtestwalletaaa"],
  taxYear:          2025,
  canton:           "ZH",
  blockchain:       "bitcoin",
  endbestandBTC:    ENDBESTAND,
  kurs3112:         KURS_3112,
  steuerwert:       STEUERWERT,
  totalTaxValue:    STEUERWERT,
  totalGrossRevenueA:  0,
  totalGrossRevenueB:  0,
  totalWithHoldingTax: 0,
};

const VALID_XML_DATEN = {
  wallets:        ["bc1qtestwalletaaa"],
  taxYear:        2025,
  canton:         "ZH",
  totalSteuerwert: STEUERWERT,
  assets: [{
    symbol:        "BTC",
    valorennummer: "3841927",
    endbestand:    ENDBESTAND,
    kursStichtag:  KURS_3112,
    steuerwert:    STEUERWERT,
    positionId:    1,
    fifo:          { anfangsbestandAmount: 0 },
    transaktionen: [
      { date: "2025-07-25", type: "in", amount: 0.00052657, chfKurs: 93491.84, chfWert: 49.23 },
    ],
  }],
};

// ─── validate: Konsistenzprüfung ──────────────────────────────────────────────
describe("PDF-Generierung – validateSteuerDaten", () => {
  test("Keine Exception bei gültigen Daten", () => {
    expect(() => validateSteuerDaten(VALID_STEUERDATEN)).not.toThrow();
  });

  test("Exception wenn steuerwert ≠ endbestand × kurs", () => {
    const kaputt = { ...VALID_STEUERDATEN, steuerwert: 999, totalTaxValue: 999 };
    expect(() => validateSteuerDaten(kaputt)).toThrow();
  });

  test("Exception wenn kein Kurs (kurs3112 = 0)", () => {
    const kaputt = { ...VALID_STEUERDATEN, kurs3112: 0 };
    expect(() => validateSteuerDaten(kaputt)).toThrow();
  });

  test("Exception wenn negativer Endbestand", () => {
    const kaputt = { ...VALID_STEUERDATEN, endbestandBTC: -0.001, steuerwert: -70, totalTaxValue: -70 };
    expect(() => validateSteuerDaten(kaputt)).toThrow();
  });

  test("Exception wenn totalTaxValue ≠ steuerwert", () => {
    const kaputt = { ...VALID_STEUERDATEN, totalTaxValue: STEUERWERT + 1 };
    expect(() => validateSteuerDaten(kaputt)).toThrow();
  });
});

// ─── XML Konsistenz ───────────────────────────────────────────────────────────
describe("PDF-Generierung – XML Steuerwert-Konsistenz", () => {
  test("XML totalTaxValue = steuerwert (identisch mit PDF S.1)", () => {
    const xml = generateESteuerauszugXML(VALID_XML_DATEN, { name: "Test User" });
    expect(xml).toContain(`totalTaxValue="${STEUERWERT.toFixed(2)}"`);
  });

  test("XML listOfSecurities totalTaxValue = taxStatementType totalTaxValue", () => {
    const xml = generateESteuerauszugXML(VALID_XML_DATEN, { name: "Test User" });
    // Muss mind. 2× vorkommen: taxStatementType + listOfSecurities
    const matches = (xml.match(new RegExp(`totalTaxValue="${STEUERWERT.toFixed(2)}"`, "g")) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  test("XML security taxValue = totalTaxValue (alle drei identisch)", () => {
    const xml = generateESteuerauszugXML(VALID_XML_DATEN, { name: "Test User" });
    const wertStr = STEUERWERT.toFixed(2);
    expect(xml).toContain(`<value>${wertStr}</value>`);
  });
});

// ─── PDF-Generator: kein Neuberechnen ────────────────────────────────────────
describe("PDF-Generierung – Keine Neuberechnung in steuerauszug/route.js", () => {
  test("steuerwertGesamt für hauptSymbol verwendet jahresendKurs (nicht alleTokenKurse)", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    // Fix: für hauptSymbol muss jahresendKurs direkt verwendet werden
    expect(src).toContain("coinSym === hauptSymbol ? jahresendKurs");
  });

  test("XML-Generierung in steuerauszug/route.js verwendet generateESteuerauszugXML aus lib", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("import { generateESteuerauszugXML }");
    expect(src).toContain("generateESteuerauszugXML(xmlSteuerDaten");
  });
});

// ─── Cache & Timeout ──────────────────────────────────────────────────────────
describe("PDF-Generierung – Cache-Control und Timeouts", () => {
  test("steuerauszug/route.js hat maxDuration = 60", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("maxDuration = 60");
  });

  test("analyze/route.js hat maxDuration = 60", () => {
    const src = fs.readFileSync("app/api/analyze/route.js", "utf8");
    expect(src).toContain("maxDuration = 60");
  });

  test("vercel.json: analyze-Route mit maxDuration konfiguriert", () => {
    const vj = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
    const analyzeKey = "app/api/analyze/route.js";
    expect(vj.functions[analyzeKey]).toBeDefined();
    expect(vj.functions[analyzeKey].maxDuration).toBeGreaterThanOrEqual(30);
  });

  test("historicalPrice.js hat cache: no-store", () => {
    const src = fs.readFileSync("app/lib/historicalPrice.js", "utf8");
    expect(src).toContain("no-store");
  });
});

// ─── Total-Konsistenz verschiedene Szenarien ──────────────────────────────────
describe("PDF-Generierung – Total-Konsistenz", () => {
  test.each([
    [0.1,        96000,    9600.00],
    [0.5,        24000,    12000.00],
    [0.00001,    50000,    0.50],
    [1.0,        100000,   100000.00],
    [0.00355787, 69990.44, 249.02],
  ])("endbestand %f × kurs %f = CHF %f (gerundet auf 2 Stellen)", (btc, kurs, erwartet) => {
    const berechnet = Math.round(btc * kurs * 100) / 100;
    expect(berechnet).toBeCloseTo(erwartet, 1);

    // validateSteuerDaten darf keine Exception werfen
    const daten = {
      ...VALID_STEUERDATEN,
      endbestandBTC: btc,
      kurs3112:      kurs,
      steuerwert:    berechnet,
      totalTaxValue: berechnet,
    };
    expect(() => validateSteuerDaten(daten)).not.toThrow();
  });
});
