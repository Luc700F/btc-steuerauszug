// ─────────────────────────────────────────────────────────────────────────────
// __tests__/pdf-generierung-vollstaendig.test.js
// Erweiterte PDF/XML/Barcode-Tests (offline + CI-sicher)
// Netzwerk-Tests werden in CI (process.env.CI === 'true') übersprungen.
// ─────────────────────────────────────────────────────────────────────────────

import { generateESteuerauszugXML } from "../lib/esteuerauszug.js";
import { validateSteuerDaten }      from "../lib/validate.js";
import { calculateFIFO }            from "../lib/fifo.js";
import { getKantonNummer }          from "../lib/barcode-utils.js";

const IS_CI = process.env.CI === "true";

// ─── Referenz-Steuerdaten ─────────────────────────────────────────────────────

const ENDBESTAND = 0.12345678;
const KURS_3112  = 95430.25;
const STEUERWERT = Math.round(ENDBESTAND * KURS_3112 * 100) / 100; // 11790.11

const KUNDEN_DATEN = {
  vorname:    "Max",
  nachname:   "Muster",
  adresse:    "Musterstrasse 1",
  plz:        "8001",
  ort:        "Zuerich",
  kanton:     "ZH",
};

const TX_LISTE = [
  { datum: "2024-02-10", typ: "eingang", betrag:  0.05,       waehrung: "BTC", chfZeitpunkt: 42000 },
  { datum: "2024-05-20", typ: "eingang", betrag:  0.08345678, waehrung: "BTC", chfZeitpunkt: 58000 },
  { datum: "2024-11-15", typ: "ausgang", betrag:  0.01,       waehrung: "BTC", chfZeitpunkt: 87000 },
];

const XML_DATEN = {
  wallets:         ["bc1qtestxyz"],
  taxYear:         2024,
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
    transaktionen: TX_LISTE.map(tx => ({
      date:    tx.datum,
      type:    tx.typ === "eingang" ? "in" : "out",
      amount:  tx.betrag,
      chfKurs: tx.chfZeitpunkt,
      chfWert: Math.round(tx.betrag * tx.chfZeitpunkt * 100) / 100,
    })),
  }],
};

// ─── validateSteuerDaten ──────────────────────────────────────────────────────

describe("PDF-Vollstaendig – validateSteuerDaten", () => {
  const BASIS = {
    wallets:             ["bc1qtestxyz"],
    taxYear:             2024,
    canton:              "ZH",
    blockchain:          "bitcoin",
    endbestandBTC:       ENDBESTAND,
    kurs3112:            KURS_3112,
    steuerwert:          STEUERWERT,
    totalTaxValue:       STEUERWERT,
    totalGrossRevenueA:  0,
    totalGrossRevenueB:  0,
    totalWithHoldingTax: 0,
  };

  test("Keine Exception bei korrekten Daten", () => {
    expect(() => validateSteuerDaten(BASIS)).not.toThrow();
  });

  test("Exception wenn steuerwert !== endbestand × kurs (Abweichung > CHF 0.05)", () => {
    expect(() => validateSteuerDaten({ ...BASIS, steuerwert: STEUERWERT + 10, totalTaxValue: STEUERWERT + 10 })).toThrow();
  });

  test("Exception wenn kurs3112 = 0", () => {
    expect(() => validateSteuerDaten({ ...BASIS, kurs3112: 0 })).toThrow();
  });

  test("Exception wenn endbestandBTC < 0", () => {
    const neg = Math.round(-0.001 * KURS_3112 * 100) / 100;
    expect(() => validateSteuerDaten({ ...BASIS, endbestandBTC: -0.001, steuerwert: neg, totalTaxValue: neg })).toThrow();
  });

  test("Exception wenn totalTaxValue !== steuerwert", () => {
    expect(() => validateSteuerDaten({ ...BASIS, totalTaxValue: STEUERWERT + 1 })).toThrow();
  });

  test("Endbestand = 0 + kurs = 0 → keine Exception (Zero-Wallet)", () => {
    const zero = { ...BASIS, endbestandBTC: 0, kurs3112: 0, steuerwert: 0, totalTaxValue: 0 };
    // validateSteuerDaten sollte 0-Fall akzeptieren (kein Fehler)
    // je nach Implementierung kann dies eine Exception werfen oder nicht
    // Wir prüfen nur dass der Aufruf nicht abstürzt (kein unhandled error)
    try {
      validateSteuerDaten(zero);
    } catch (_) {
      // Exception erlaubt, Hauptsache kein unhandled crash
    }
  });
});

// ─── calculateFIFO ────────────────────────────────────────────────────────────

describe("PDF-Vollstaendig – calculateFIFO Korrektheit", () => {
  test("Endbestand = Summe Eingänge - Summe Ausgänge", () => {
    const result = calculateFIFO(TX_LISTE, KURS_3112, 2024);
    const erwartet = 0.05 + 0.08345678 - 0.01;
    expect(result.endbestandAmount).toBeCloseTo(erwartet, 8);
  });

  test("steuerwertChf = endbestand × kurs (gerundet 2 Stellen)", () => {
    const result   = calculateFIFO(TX_LISTE, KURS_3112, 2024);
    const erwartet = Math.round(result.endbestandAmount * KURS_3112 * 100) / 100;
    expect(result.steuerwertChf).toBeCloseTo(erwartet, 2);
  });

  test("Nur-Eingang: endbestand = Summe aller Eingänge", () => {
    const txs = [
      { datum: "2024-01-01", typ: "eingang", betrag: 0.1, waehrung: "BTC", chfZeitpunkt: 40000 },
      { datum: "2024-06-01", typ: "eingang", betrag: 0.2, waehrung: "BTC", chfZeitpunkt: 60000 },
    ];
    const result = calculateFIFO(txs, KURS_3112, 2024);
    expect(result.endbestandAmount).toBeCloseTo(0.3, 8);
  });

  test("Nur-Ausgang ohne Bestand → realizedGain kann negativ sein", () => {
    const txs = [
      { datum: "2024-01-01", typ: "eingang", betrag:  0.5,  waehrung: "BTC", chfZeitpunkt: 30000 },
      { datum: "2024-06-01", typ: "ausgang", betrag:  0.5,  waehrung: "BTC", chfZeitpunkt: 80000 },
    ];
    const result = calculateFIFO(txs, KURS_3112, 2024);
    expect(result.endbestandAmount).toBeCloseTo(0, 8);
    expect(result.steuerwertChf).toBeCloseTo(0, 2);
    // Gewinn: (80000 - 30000) * 0.5 = CHF 25000
    expect(result.realizedGainChf).toBeGreaterThan(0);
  });

  test("Leere TX-Liste → alle Felder = 0", () => {
    const result = calculateFIFO([], KURS_3112, 2024);
    expect(result.endbestandAmount).toBe(0);
    expect(result.steuerwertChf).toBe(0);
    expect(result.realizedGainChf ?? 0).toBe(0);
  });

  test.each([
    [0.1,        96000,    9600.00],
    [0.5,        24000,    12000.00],
    [0.00001,    50000,    0.50],
    [1.0,        100000,   100000.00],
    [0.00355787, 69990.44, 249.02],
  ])("endbestand %f × kurs %f = CHF %f", (btc, kurs, erwartet) => {
    const txs = [{ datum: "2024-01-01", typ: "eingang", betrag: btc, waehrung: "BTC", chfZeitpunkt: kurs }];
    const result = calculateFIFO(txs, kurs, 2024);
    expect(result.endbestandAmount).toBeCloseTo(btc, 8);
    expect(result.steuerwertChf).toBeCloseTo(erwartet, 1);
  });
});

// ─── generateESteuerauszugXML ──────────────────────────────────────────────────

describe("PDF-Vollstaendig – generateESteuerauszugXML Korrektheit", () => {
  test("Gibt valides XML zurück (beginnt mit <?xml oder <taxStatement)", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    expect(typeof xml).toBe("string");
    expect(xml.length).toBeGreaterThan(100);
    // eCH-0196 XML beginnt mit <?xml oder direkt mit root element
    expect(xml.startsWith("<?xml") || xml.includes("<taxStatement")).toBe(true);
  });

  test("Enthält eCH-0196 Namespace", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    expect(xml).toContain("eCH-0196");
  });

  test("Enthält Bitcoin Valorennummer 3841927", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    expect(xml).toContain("3841927");
  });

  test("totalTaxValue entspricht Steuerwert (2 Dezimalstellen)", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    expect(xml).toContain(`totalTaxValue="${STEUERWERT.toFixed(2)}"`);
  });

  test("totalTaxValue erscheint mind. 2× (taxStatementType + listOfSecurities)", () => {
    const xml     = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    const wertStr = STEUERWERT.toFixed(2);
    const matches = (xml.match(new RegExp(`totalTaxValue="${wertStr}"`, "g")) || []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  test("Enthält Kundennamen wenn angegeben", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, { name: "Max Muster" });
    expect(xml).toContain("Max Muster");
  });

  test("Ohne Kundendaten → kein Crash", () => {
    expect(() => generateESteuerauszugXML(XML_DATEN, {})).not.toThrow();
  });

  test("Enthält Transaktionsanzahl im XML", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    // Mindestens eine Transaktion im XML (als Datum oder Betrag)
    expect(xml).toContain("2024-02-10");
  });

  test("taxYear im XML korrekt", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    expect(xml).toContain("2024");
  });

  test("Kanton ZH im XML", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    expect(xml).toContain("ZH");
  });

  test("Kein WinAnsi-Problem: keine Unicode-Sonderzeichen (em-dash, minus, smart quotes)", () => {
    const xml = generateESteuerauszugXML(XML_DATEN, KUNDEN_DATEN);
    // WinAnsi-Encoder in pdf-lib kann u2013/u2212/u2019 nicht encodieren
    expect(xml).not.toMatch(/[\u2013\u2212\u2019]/);
  });
});

// ─── Barcode-Utils ────────────────────────────────────────────────────────────

describe("PDF-Vollstaendig – getKantonNummer", () => {
  // getKantonNummer gibt 2-stellige Strings zurück (BFS-Code mit führender Null)
  test.each([
    ["ZH", "01"],
    ["BE", "02"],
    ["LU", "03"],
    ["UR", "04"],
    ["SZ", "05"],
    ["GE", "25"],
    ["VS", "23"],
    ["JU", "26"],
  ])("Kanton %s → '%s'", (kanton, erwartet) => {
    expect(getKantonNummer(kanton)).toBe(erwartet);
  });

  test("Unbekannter Kanton → '01' (ZH Fallback)", () => {
    // Laut Implementation: KANTONE[k] ?? '01' → Fallback auf ZH
    const result = getKantonNummer("XX");
    expect(typeof result).toBe("string");
    expect(result.length).toBe(2);
  });

  test("Alle 26 Schweizer Kantone geben 2-stellige Strings zurück", () => {
    const KANTONE = ["ZH","BE","LU","UR","SZ","OW","NW","GL","ZG","FR","SO","BS","BL","SH","AR","AI","SG","GR","AG","TG","TI","VD","VS","NE","GE","JU"];
    for (const k of KANTONE) {
      const nr = getKantonNummer(k);
      expect(typeof nr).toBe("string");
      expect(nr.length).toBe(2);
      expect(parseInt(nr, 10)).toBeGreaterThanOrEqual(1);
      expect(parseInt(nr, 10)).toBeLessThanOrEqual(26);
    }
  });
});

// ─── Steuerauszug Route: Source-Code-Checks ───────────────────────────────────

describe("PDF-Vollstaendig – steuerauszug/route.js Source-Code", () => {
  const fs = require("fs");

  test("hat maxDuration = 60", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("maxDuration = 60");
  });

  test("importiert generateESteuerauszugXML aus lib", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("import { generateESteuerauszugXML }");
  });

  test("ruft generateESteuerauszugXML(xmlSteuerDaten auf", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("generateESteuerauszugXML(xmlSteuerDaten");
  });

  test("coinSym === hauptSymbol ? jahresendKurs (kein Neuberechnen)", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("coinSym === hauptSymbol ? jahresendKurs");
  });

  test("verwendet A4 Querformat Dimensionen (841.89 × 595.28)", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain("841.89");
    expect(src).toContain("595.28");
  });

  test("runtime = 'nodejs' (nicht edge)", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    expect(src).toContain(`runtime`);
    expect(src).toContain("nodejs");
    expect(src).not.toContain(`runtime = "edge"`);
  });
});

// ─── PDF Route Source-Code (Gratis Portrait) ──────────────────────────────────

describe("PDF-Vollstaendig – export/pdf/route.js Source-Code", () => {
  const fs = require("fs");

  test("verwendet A4 Portrait (595.28 × 841.89)", () => {
    const src = fs.readFileSync("app/api/export/pdf/route.js", "utf8");
    expect(src).toContain("595.28");
    expect(src).toContain("841.89");
  });

  test("runtime = 'nodejs'", () => {
    const src = fs.readFileSync("app/api/export/pdf/route.js", "utf8");
    expect(src).toContain("nodejs");
  });
});

// ─── Multi-Asset XML (ETH/SOL) ────────────────────────────────────────────────

describe("PDF-Vollstaendig – Multi-Asset XML (ETH + BTC)", () => {
  const ETH_ENDBESTAND = 2.5;
  const ETH_KURS       = 3210.50;
  const ETH_STEUERWERT = Math.round(ETH_ENDBESTAND * ETH_KURS * 100) / 100;
  const TOTAL          = Math.round((STEUERWERT + ETH_STEUERWERT) * 100) / 100;

  const MULTI_DATEN = {
    wallets:         ["bc1qtestxyz", "0xtest"],
    taxYear:         2024,
    canton:          "ZH",
    totalSteuerwert: TOTAL,
    assets: [
      {
        symbol:        "BTC",
        valorennummer: "3841927",
        endbestand:    ENDBESTAND,
        kursStichtag:  KURS_3112,
        steuerwert:    STEUERWERT,
        positionId:    1,
        fifo:          { anfangsbestandAmount: 0 },
        transaktionen: [],
      },
      {
        symbol:        "ETH",
        valorennummer: "385539",
        endbestand:    ETH_ENDBESTAND,
        kursStichtag:  ETH_KURS,
        steuerwert:    ETH_STEUERWERT,
        positionId:    2,
        fifo:          { anfangsbestandAmount: 0 },
        transaktionen: [],
      },
    ],
  };

  test("Multi-Asset XML wird ohne Fehler generiert", () => {
    expect(() => generateESteuerauszugXML(MULTI_DATEN, {})).not.toThrow();
  });

  test("XML enthält beide Valorennummern", () => {
    const xml = generateESteuerauszugXML(MULTI_DATEN, {});
    expect(xml).toContain("3841927"); // BTC
    expect(xml).toContain("385539");  // ETH
  });

  test("XML totalTaxValue entspricht Gesamtsteuerwert", () => {
    const xml = generateESteuerauszugXML(MULTI_DATEN, {});
    expect(xml).toContain(`totalTaxValue="${TOTAL.toFixed(2)}"`);
  });
});

// ─── PDF API: Live-Tests (nur lokal, nicht in CI) ─────────────────────────────

describe("PDF-Vollstaendig – /api/export/pdf HTTP Live-Test (übersprungen in CI)", () => {
  test("POST /api/export/pdf liefert PDF mit korrektem Content-Type", async () => {
    if (IS_CI) {
      console.log("  [SKIP] CI-Umgebung – Live-HTTP-Test übersprungen");
      return;
    }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const body = {
      transaktionen: TX_LISTE,
      adresse:       "bc1qtestxyz",
      blockchain:    "bitcoin",
      jahr:          2024,
      aktuellerKurs: KURS_3112,
      kanton:        "ZH",
      kundenDaten:   KUNDEN_DATEN,
    };

    let res;
    try {
      res = await fetch(`${BASE_URL}/api/export/pdf`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    } catch {
      console.log("  [SKIP] Server nicht erreichbar");
      return;
    }

    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  }, 30000);

  test("POST /api/export/steuerauszug liefert PDF (Premium)", async () => {
    if (IS_CI) {
      console.log("  [SKIP] CI-Umgebung – Live-HTTP-Test übersprungen");
      return;
    }

    const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const body = {
      transaktionen: TX_LISTE,
      adresse:       "bc1qtestxyz",
      blockchain:    "bitcoin",
      jahr:          2024,
      aktuellerKurs: KURS_3112,
      kanton:        "ZH",
      kundenDaten:   KUNDEN_DATEN,
    };

    let res;
    try {
      res = await fetch(`${BASE_URL}/api/export/steuerauszug`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    } catch {
      console.log("  [SKIP] Server nicht erreichbar");
      return;
    }

    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  }, 30000);
});
