import { getJahresStatus } from "../lib/jahres-utils";
import { validateSteuerDaten } from "../lib/validate";
import { calculateFIFO } from "../lib/fifo";
import { generateESteuerauszugXML } from "../lib/esteuerauszug";
import fs from "fs";

// ─── Referenz-Werte (anonymisiert) ───────────────────────────────────────────
const ENDBESTAND  = 0.00355787;  // BTC
const KURS_3112   = 69990.44;    // CHF/BTC am 31.12.2025
const STEUERWERT  = Math.round(ENDBESTAND * KURS_3112 * 100) / 100; // 249.02

// ─── 1. getJahresStatus – stichtagDatum = 31.12. für abgeschlossene Jahre ────
describe("Jahresschluss-Datum: stichtagDatum = YYYY-12-31", () => {
  test("Jahr 2022 (abgeschlossen): stichtagDatum = '2022-12-31'", () => {
    const { stichtagDatum, isAbgeschlossen } = getJahresStatus(2022);
    expect(stichtagDatum).toBe("2022-12-31");
    expect(isAbgeschlossen).toBe(true);
  });

  test("Jahr 2023 (abgeschlossen): stichtagDatum = '2023-12-31'", () => {
    const { stichtagDatum, isAbgeschlossen } = getJahresStatus(2023);
    expect(stichtagDatum).toBe("2023-12-31");
    expect(isAbgeschlossen).toBe(true);
  });

  test("Jahr 2024 (abgeschlossen): stichtagDatum = '2024-12-31'", () => {
    const { stichtagDatum, isAbgeschlossen } = getJahresStatus(2024);
    expect(stichtagDatum).toBe("2024-12-31");
    expect(isAbgeschlossen).toBe(true);
  });

  test("Jahr 2025 (abgeschlossen): stichtagDatum = '2025-12-31'", () => {
    const { stichtagDatum, isAbgeschlossen } = getJahresStatus(2025);
    expect(stichtagDatum).toBe("2025-12-31");
    expect(isAbgeschlossen).toBe(true);
  });

  test("Laufendes Jahr: isLaufend = true, stichtagDatum = heute", () => {
    const aktuellesJahr = new Date().getFullYear();
    const { isLaufend, stichtagDatum } = getJahresStatus(aktuellesJahr);
    expect(isLaufend).toBe(true);
    const heute = new Date().toISOString().slice(0, 10);
    expect(stichtagDatum).toBe(heute);
  });
});

// ─── 2. FIFO × Jahresschlusskurs = Steuerwert ────────────────────────────────
describe("Steuerwert = FIFO-Endbestand × Jahresschlusskurs", () => {
  const txs = [
    {
      datum: "2025-07-25T00:00:00Z",
      typ: "eingang",
      betrag: ENDBESTAND,
      waehrung: "BTC",
      chfZeitpunkt: Math.round(ENDBESTAND * 93491.84 * 100) / 100,
    },
  ];

  test("FIFO-Endbestand korrekt (1 Transaktion)", () => {
    const fifo = calculateFIFO(txs, KURS_3112, 2025);
    expect(fifo.endbestandAmount).toBeCloseTo(ENDBESTAND, 8);
  });

  test("Steuerwert = endbestand × kurs3112 (auf 2 Stellen gerundet)", () => {
    const fifo = calculateFIFO(txs, KURS_3112, 2025);
    const berechnet = Math.round(fifo.endbestandAmount * KURS_3112 * 100) / 100;
    expect(berechnet).toBe(STEUERWERT); // 249.02
  });

  test("STEUERWERT ist CHF 249.02 (0.00355787 × 69990.44)", () => {
    expect(STEUERWERT).toBe(249.02);
  });

  test("validateSteuerDaten wirft keine Exception", () => {
    const fifo = calculateFIFO(txs, KURS_3112, 2025);
    const berechnet = Math.round(fifo.endbestandAmount * KURS_3112 * 100) / 100;
    expect(() =>
      validateSteuerDaten({
        endbestandBTC:  fifo.endbestandAmount,
        kurs3112:       KURS_3112,
        steuerwert:     berechnet,
        totalTaxValue:  berechnet,
      })
    ).not.toThrow();
  });

  test("FIFO mit Kauf + Teilverkauf: Endbestand korrekt", () => {
    const txsVerkauf = [
      { datum: "2024-01-10T00:00:00Z", typ: "eingang", betrag: 0.01, waehrung: "BTC", chfZeitpunkt: 430 },
      { datum: "2024-06-15T00:00:00Z", typ: "ausgang", betrag: 0.003, waehrung: "BTC", chfZeitpunkt: 170 },
    ];
    const fifo = calculateFIFO(txsVerkauf, 89500, 2024);
    expect(fifo.endbestandAmount).toBeCloseTo(0.007, 8);
    const sw = Math.round(fifo.endbestandAmount * 89500 * 100) / 100;
    expect(sw).toBeCloseTo(626.50, 1);
  });
});

// ─── 3. XML: totalTaxValue = Steuerwert vom 31.12. ───────────────────────────
describe("XML totalTaxValue = berechneter Steuerwert (Jahresschlusskurs)", () => {
  const xmlDaten = {
    wallets:         ["bc1qtestwalletaaa"],
    taxYear:         2025,
    canton:          "ZH",
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
        { date: "2025-07-25", type: "in", amount: ENDBESTAND, chfKurs: 93491.84, chfWert: 49.23 },
      ],
    }],
  };

  test("XML enthält totalTaxValue = 249.02", () => {
    const xml = generateESteuerauszugXML(xmlDaten, { name: "Referenz-Nutzer" });
    expect(xml).toContain(`totalTaxValue="${STEUERWERT.toFixed(2)}"`);
  });

  test("XML totalTaxValue taucht mind. 2× auf (taxStatementType + listOfSecurities)", () => {
    const xml = generateESteuerauszugXML(xmlDaten, { name: "Referenz-Nutzer" });
    const treffer = (xml.match(new RegExp(`totalTaxValue="${STEUERWERT.toFixed(2)}"`, "g")) || []).length;
    expect(treffer).toBeGreaterThanOrEqual(2);
  });

  test("XML security value = totalTaxValue", () => {
    const xml = generateESteuerauszugXML(xmlDaten, { name: "Referenz-Nutzer" });
    expect(xml).toContain(`<value>${STEUERWERT.toFixed(2)}</value>`);
  });
});

// ─── 4. steuerauszug/route.js – Kursquelle ist jahresendKurs ─────────────────
describe("steuerauszug/route.js – Steuerwert basiert auf historischem Jahresschlusskurs", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
  });

  test("Ruft getHistoricalPriceChf (lib/price-service) für Jahresschlusskurs ab", () => {
    // steuerauszug/route.js verwendet lib/price-service.js (gleiche Quelle wie analyze)
    expect(src).toContain("getHistoricalPriceChf");
  });

  test("Variable jahresendKurs wird verwendet", () => {
    expect(src).toContain("jahresendKurs");
  });

  test("steuerwertHauptsymbol = endbestandHauptsymbol × jahresendKurs", () => {
    expect(src).toContain("steuerwertHauptsymbol = Math.round(endbestandHauptsymbol * jahresendKurs");
  });

  test("Hauptsymbol in S.2-Tabelle: coinKurs = jahresendKurs (nicht live-Kurs)", () => {
    expect(src).toContain("coinSym === hauptSymbol ? jahresendKurs");
  });

  test("steuerwertGesamt-Berechnung nutzt jahresendKurs für Hauptsymbol", () => {
    expect(src).toContain("sym === hauptSymbol ? jahresendKurs");
  });

  test("XML totalSteuerwert = steuerwertHauptsymbol (konsistent mit PDF)", () => {
    expect(src).toContain("totalSteuerwert: steuerwertHauptsymbol");
  });
});

// ─── 5. analyze/route.js – Steuerwert-Kette ──────────────────────────────────
describe("analyze/route.js – Steuerwert wird einmal berechnet und weitergegeben", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("app/api/analyze/route.js", "utf8");
  });

  test("Berechnet steuerwert = fifo.endbestandAmount × kursStichtag.price", () => {
    expect(src).toContain("fifo.endbestandAmount * kursStichtag.price");
  });

  test("Verwendet getHistoricalPriceChf für 31.12.-Kurs", () => {
    expect(src).toContain("getHistoricalPriceChf");
    expect(src).toContain("stichtagDatum");
  });

  test("totalTaxValue identisch mit steuerwert", () => {
    expect(src).toContain("totalTaxValue:        steuerwert");
  });
});

// ─── 6. Multi-Jahr: Steuerwert-Berechnung für alle Steuerjahre ───────────────
describe("Multi-Jahr: Steuerwert korrekt für alle abgeschlossenen Jahre", () => {
  const SZENARIEN = [
    [2020, 0.1,          23400,    2340.00],
    [2021, 0.05,         42000,    2100.00],
    [2022, 0.2,          17000,    3400.00],
    [2023, 0.01,         41000,    410.00],
    [2024, 0.005,        89500,    447.50],
    [2025, 0.00355787,   69990.44, 249.02],
  ];

  test.each(SZENARIEN)(
    "Jahr %d: %f BTC × CHF %f = CHF %f",
    (year, btc, kurs, erwartet) => {
      const { isAbgeschlossen, stichtagDatum } = getJahresStatus(year);
      // Alle Test-Szenarien sind abgeschlossene Jahre → stichtagDatum = 31.12.
      expect(isAbgeschlossen).toBe(true);
      expect(stichtagDatum).toBe(`${year}-12-31`);

      const berechnet = Math.round(btc * kurs * 100) / 100;
      expect(berechnet).toBeCloseTo(erwartet, 1);

      // Konsistenzprüfung via validateSteuerDaten
      expect(() =>
        validateSteuerDaten({
          endbestandBTC: btc,
          kurs3112:      kurs,
          steuerwert:    berechnet,
          totalTaxValue: berechnet,
        })
      ).not.toThrow();
    }
  );
});

// ─── 7. Multi-Chain: BTC / ETH / SOL Jahresschlusskurs-Logik ─────────────────
describe("Multi-Chain: analyze/route.js verwendet COINGECKO_IDS je Chain", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("app/api/analyze/route.js", "utf8");
  });

  test("COINGECKO_IDS enthält bitcoin, ethereum, solana", () => {
    expect(src).toContain(`bitcoin:  "bitcoin"`);
    expect(src).toContain(`ethereum: "ethereum"`);
    expect(src).toContain(`solana:   "solana"`);
  });

  test("Berechnung via getJahresStatus (einheitliche stichtagDatum-Logik)", () => {
    expect(src).toContain("getJahresStatus");
    expect(src).toContain("stichtagDatum");
  });
});
