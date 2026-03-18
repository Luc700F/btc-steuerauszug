/**
 * eCH-0196 v2.2.0 XML-Generator + Validator Tests
 *
 * Prüft korrekte Valorennummern (BTC/ETH/SOL), XML-Struktur,
 * Steuerwert, Transaktionen und Kanton.
 */

import { KRYPTO_META, getKryptoMeta, normalizeBlockchain } from "../lib/krypto-meta";
import { generateXML } from "../lib/xml-generator";
import { validateXML } from "../lib/xml-validator";

// ─── krypto-meta.js ───────────────────────────────────────────────────────────

describe("krypto-meta: KRYPTO_META Konstanten", () => {
  test("BTC valorNumber = '3841927'", () => {
    expect(KRYPTO_META.btc.valorNumber).toBe("3841927");
  });

  test("ETH valorNumber = '24476758'", () => {
    expect(KRYPTO_META.eth.valorNumber).toBe("24476758");
  });

  test("SOL valorNumber = '130548049'", () => {
    expect(KRYPTO_META.sol.valorNumber).toBe("130548049");
  });

  test("Alle drei Assets haben securityCategory = 'CRYPTO'", () => {
    expect(KRYPTO_META.btc.securityCategory).toBe("CRYPTO");
    expect(KRYPTO_META.eth.securityCategory).toBe("CRYPTO");
    expect(KRYPTO_META.sol.securityCategory).toBe("CRYPTO");
  });

  test("Alle drei Assets haben country = 'CH'", () => {
    expect(KRYPTO_META.btc.country).toBe("CH");
    expect(KRYPTO_META.eth.country).toBe("CH");
    expect(KRYPTO_META.sol.country).toBe("CH");
  });

  test("Alle drei Assets haben quotationType = 'PIECE'", () => {
    expect(KRYPTO_META.btc.quotationType).toBe("PIECE");
    expect(KRYPTO_META.eth.quotationType).toBe("PIECE");
    expect(KRYPTO_META.sol.quotationType).toBe("PIECE");
  });
});

describe("krypto-meta: getKryptoMeta()", () => {
  test("'bitcoin' → BTC-Metadaten", () => {
    expect(getKryptoMeta("bitcoin").valorNumber).toBe("3841927");
  });

  test("'btc' → BTC-Metadaten", () => {
    expect(getKryptoMeta("btc").valorNumber).toBe("3841927");
  });

  test("'ethereum' → ETH-Metadaten", () => {
    expect(getKryptoMeta("ethereum").valorNumber).toBe("24476758");
  });

  test("'eth' → ETH-Metadaten", () => {
    expect(getKryptoMeta("eth").valorNumber).toBe("24476758");
  });

  test("'solana' → SOL-Metadaten", () => {
    expect(getKryptoMeta("solana").valorNumber).toBe("130548049");
  });

  test("'sol' → SOL-Metadaten", () => {
    expect(getKryptoMeta("sol").valorNumber).toBe("130548049");
  });

  test("Unbekannte Blockchain → BTC-Fallback", () => {
    expect(getKryptoMeta("xyz").valorNumber).toBe("3841927");
  });
});

describe("krypto-meta: normalizeBlockchain()", () => {
  test("'bitcoin' → 'btc'", () => {
    expect(normalizeBlockchain("bitcoin")).toBe("btc");
  });

  test("'ethereum' → 'eth'", () => {
    expect(normalizeBlockchain("ethereum")).toBe("eth");
  });

  test("'solana' → 'sol'", () => {
    expect(normalizeBlockchain("solana")).toBe("sol");
  });

  test("Grossbuchstaben werden normalisiert", () => {
    expect(normalizeBlockchain("Bitcoin")).toBe("btc");
    expect(normalizeBlockchain("ETHEREUM")).toBe("eth");
  });

  test("Unbekannt → 'btc'", () => {
    expect(normalizeBlockchain("polkadot")).toBe("btc");
  });
});

// ─── xml-generator.js ────────────────────────────────────────────────────────

const BTC_DATA = {
  blockchain:    "bitcoin",
  walletAddress: "bc1qtest1234",
  kanton:        "ZH",
  jahr:          2025,
  endbestand:    0.00355787,
  steuerwert:    249.02,
  kurs31Dez:     69990.44,
  anfangsbestand: 0,
  transaktionen: [
    { date: "2025-06-01", type: "in", amount: 0.00355787, chfKurs: 69990.44, chfWert: 249.02 },
  ],
};

const ETH_DATA = {
  blockchain:    "ethereum",
  walletAddress: "0xtest5678",
  kanton:        "BE",
  jahr:          2025,
  endbestand:    0.5,
  steuerwert:    1750.00,
  kurs31Dez:     3500.00,
  transaktionen: [
    { date: "2025-03-15", type: "in", amount: 0.5, chfKurs: 3500.00, chfWert: 1750.00 },
  ],
};

const SOL_DATA = {
  blockchain:    "solana",
  walletAddress: "soltest9999",
  kanton:        "AG",
  jahr:          2025,
  endbestand:    5.0,
  steuerwert:    1100.00,
  kurs31Dez:     220.00,
  transaktionen: [
    { date: "2025-04-01", type: "in", amount: 5.0, chfKurs: 220.00, chfWert: 1100.00 },
  ],
};

describe("xml-generator: generateXML() – Grundstruktur", () => {
  let xml;
  beforeAll(() => { xml = generateXML(BTC_DATA); });

  test("Gibt einen nicht-leeren String zurück", () => {
    expect(typeof xml).toBe("string");
    expect(xml.length).toBeGreaterThan(200);
  });

  test("Enthält XML-Deklaration", () => {
    expect(xml).toContain('<?xml version="1.0"');
  });

  test("Enthält eCH-0196 Namespace", () => {
    expect(xml).toContain("eCH-0196");
  });

  test("Enthält minorVersion=\"22\" (eCH-0196 v2.2.0)", () => {
    expect(xml).toContain('minorVersion="22"');
  });

  test("Enthält <taxStatementType> Root-Element", () => {
    expect(xml).toContain("taxStatementType");
  });

  test("Enthält <institution> mit btcSteuerauszug.ch", () => {
    expect(xml).toContain("btcSteuerauszug.ch");
  });
});

describe("xml-generator: generateXML() – BTC (Valorennummer 3841927)", () => {
  let xml;
  beforeAll(() => { xml = generateXML(BTC_DATA); });

  test("Valorennummer = '3841927'", () => {
    expect(xml).toContain('valorNumber="3841927"');
  });

  test("totalTaxValue = '249.02'", () => {
    expect(xml).toContain('totalTaxValue="249.02"');
  });

  test("taxPeriod = '2025'", () => {
    expect(xml).toContain('taxPeriod="2025"');
  });

  test("canton = 'ZH'", () => {
    expect(xml).toContain('canton="ZH"');
  });

  test("Enthält periodFrom/periodTo für 2025", () => {
    expect(xml).toContain("2025-01-01");
    expect(xml).toContain("2025-12-31");
  });

  test("Enthält <taxValue> mit referenceDate 2025-12-31", () => {
    expect(xml).toContain("2025-12-31");
  });

  test("Enthält Transaktion vom 2025-06-01", () => {
    expect(xml).toContain("2025-06-01");
  });
});

describe("xml-generator: generateXML() – ETH (Valorennummer 24476758)", () => {
  let xml;
  beforeAll(() => { xml = generateXML(ETH_DATA); });

  test("Valorennummer = '24476758'", () => {
    expect(xml).toContain('valorNumber="24476758"');
  });

  test("totalTaxValue = '1750.00'", () => {
    expect(xml).toContain('totalTaxValue="1750.00"');
  });

  test("canton = 'BE'", () => {
    expect(xml).toContain('canton="BE"');
  });

  test("Enthält ETH Sicherheitsname", () => {
    expect(xml).toContain("Ether (ETH)");
  });
});

describe("xml-generator: generateXML() – SOL (Valorennummer 130548049)", () => {
  let xml;
  beforeAll(() => { xml = generateXML(SOL_DATA); });

  test("Valorennummer = '130548049'", () => {
    expect(xml).toContain('valorNumber="130548049"');
  });

  test("totalTaxValue = '1100.00'", () => {
    expect(xml).toContain('totalTaxValue="1100.00"');
  });

  test("canton = 'AG'", () => {
    expect(xml).toContain('canton="AG"');
  });

  test("Enthält SOL Sicherheitsname", () => {
    expect(xml).toContain("Solana (SOL)");
  });
});

describe("xml-generator: generateXML() – Edge Cases", () => {
  test("Leere Transaktionen → kein Crash", () => {
    const xml = generateXML({ ...BTC_DATA, transaktionen: [] });
    expect(xml).toContain("taxStatementType");
    expect(xml).toContain('valorNumber="3841927"');
  });

  test("Anfangsbestand > 0 → <stock> mit Anfangsbestand", () => {
    const xml = generateXML({ ...BTC_DATA, anfangsbestand: 0.001 });
    expect(xml).toContain("Anfangsbestand");
    expect(xml).toContain("2025-01-01");
  });

  test("steuerwert = 0 → totalTaxValue=\"0.00\"", () => {
    const xml = generateXML({ ...BTC_DATA, steuerwert: 0, endbestand: 0 });
    expect(xml).toContain('totalTaxValue="0.00"');
  });

  test("Verschiedene BTC-Adressen erzeugen unterschiedliche XMLs (id=UUID)", () => {
    const xml1 = generateXML({ ...BTC_DATA, walletAddress: "bc1qaaa" });
    const xml2 = generateXML({ ...BTC_DATA, walletAddress: "bc1qbbb" });
    expect(xml1).not.toBe(xml2);
  });
});

// ─── xml-validator.js ────────────────────────────────────────────────────────

describe("xml-validator: validateXML()", () => {
  test("Valides BTC-XML → true", () => {
    const xml = generateXML(BTC_DATA);
    expect(validateXML(xml, BTC_DATA)).toBe(true);
  });

  test("Valides ETH-XML → true", () => {
    const xml = generateXML(ETH_DATA);
    expect(validateXML(xml, ETH_DATA)).toBe(true);
  });

  test("Valides SOL-XML → true", () => {
    const xml = generateXML(SOL_DATA);
    expect(validateXML(xml, SOL_DATA)).toBe(true);
  });

  test("Leerer String → Error", () => {
    expect(() => validateXML("", {})).toThrow();
  });

  test("null → Error", () => {
    expect(() => validateXML(null, {})).toThrow();
  });

  test("Falscher Steuerwert → Error", () => {
    const xml = generateXML(BTC_DATA);
    expect(() => validateXML(xml, { ...BTC_DATA, steuerwert: 999.99 })).toThrow();
  });

  test("Falsches Jahr → Error", () => {
    const xml = generateXML(BTC_DATA);
    expect(() => validateXML(xml, { ...BTC_DATA, jahr: 2024 })).toThrow();
  });

  test("Falscher Kanton → Error", () => {
    const xml = generateXML(BTC_DATA);
    expect(() => validateXML(xml, { ...BTC_DATA, kanton: "BE" })).toThrow();
  });

  test("Falsche Blockchain (ETH statt BTC) → Error (valorNumber)", () => {
    const xml = generateXML(BTC_DATA);  // BTC-XML
    expect(() => validateXML(xml, { ...BTC_DATA, blockchain: "ethereum" })).toThrow();
  });

  test("ohne data → true (keine Checks die scheitern können)", () => {
    const xml = generateXML(BTC_DATA);
    expect(validateXML(xml)).toBe(true);
  });
});
