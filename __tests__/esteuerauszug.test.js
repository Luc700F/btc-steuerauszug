import { generateESteuerauszugXML } from "../lib/esteuerauszug";

// ─── Basis-Steuerdaten für BTC ────────────────────────────────────────────────
const baseDaten = {
  wallets: ["bc1qtest"],
  taxYear: 2025,
  canton: "ZH",
  totalSteuerwert: 950,
  assets: [
    {
      symbol: "BTC",
      valorennummer: "3841927",
      endbestand: 0.01,
      kursStichtag: 95000,
      steuerwert: 950,
      positionId: 1,
      fifo: { anfangsbestandAmount: 0 },
      transaktionen: [],
    },
  ],
};

describe("eSteuerauszug XML – Grundstruktur", () => {
  test("generiert valides XML mit Deklaration", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("taxStatementType");
    expect(xml).toContain("urn:ech:xmlns:eCH-0196:2");
  });

  test("minorVersion ist 22", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('minorVersion="22"');
  });

  test("totalTaxValue korrekt", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('totalTaxValue="950.00"');
  });

  test("Valorennummer Bitcoin korrekt (valorNumber-Attribut)", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('valorNumber="3841927"');
  });

  test("taxPeriod und periodFrom/periodTo korrekt", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('taxPeriod="2025"');
    expect(xml).toContain('periodFrom="2025-01-01"');
    expect(xml).toContain('periodTo="2025-12-31"');
  });

  test("canton korrekt", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('canton="ZH"');
  });

  test("quantity hat 8 Dezimalstellen", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain("0.01000000");
  });

  test("unitPrice korrekt als Kind-Element", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain("<unitPrice>95000.00</unitPrice>");
  });

  test("institution ist btcSteuerauszug.ch", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain("<name>btcSteuerauszug.ch</name>");
  });

  test("depotNumber entspricht wallet-Adresse", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain('depotNumber="bc1qtest"');
  });

  test("referenceDate in taxValue ist 31. Dezember des Steuerjahres", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain("<referenceDate>2025-12-31</referenceDate>");
  });

  test("value in taxValue = totalTaxValue", () => {
    const xml = generateESteuerauszugXML(baseDaten, {});
    expect(xml).toContain("<value>950.00</value>");
  });

  test("XML-Zeichen werden korrekt escaped (XSS-Schutz)", () => {
    const xmlMitSonderzeichen = generateESteuerauszugXML(baseDaten, {
      name: 'Test <User> & "Company"',
    });
    expect(xmlMitSonderzeichen).toContain(
      "Test &lt;User&gt; &amp; &quot;Company&quot;"
    );
    expect(xmlMitSonderzeichen).not.toContain("<User>");
  });
});

describe("eSteuerauszug XML – Kundendaten", () => {
  test("Kundenname im client-Element", () => {
    const xml = generateESteuerauszugXML(baseDaten, { name: "Max Muster" });
    expect(xml).toContain("<n>Max Muster</n>");
  });

  test("Ohne Kundendaten: leerer client-Tag", () => {
    const xml = generateESteuerauszugXML(baseDaten);
    expect(xml).toContain('clientNumber="bc1qtest"');
  });
});

describe("eSteuerauszug XML – Assets ohne Bestand", () => {
  test("Asset mit Steuerwert 0 und Endbestand 0 erscheint nicht im XML", () => {
    const daten = {
      ...baseDaten,
      assets: [
        ...baseDaten.assets,
        {
          symbol: "SHIB",
          valorennummer: "124609870",
          endbestand: 0,
          kursStichtag: 0,
          steuerwert: 0,
          positionId: 2,
          fifo: { anfangsbestandAmount: 0 },
          transaktionen: [],
        },
      ],
    };
    const xml = generateESteuerauszugXML(daten, {});
    expect(xml).not.toContain("SHIB");
  });
});
