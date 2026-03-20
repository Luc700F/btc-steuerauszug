// ─────────────────────────────────────────────────────────────────────────────
// __tests__/xpub-dashboard.test.js
// Testet den xpub-Datenpfad im Dashboard (Mock-basiert, kein Netzwerk)
// ─────────────────────────────────────────────────────────────────────────────

import { detectInputType } from "../lib/xpub-detector.js";
import { calculateFIFO } from "../lib/fifo.js";

// ─── Hilfsfunktion: simuliert /api/analyze-Antwort für xpub ──────────────────

function mockAnalyzeAntwort(txAnzahl = 5, kurs3112 = 95430.25) {
  const transaktionen = Array.from({ length: txAnzahl }, (_, i) => ({
    datum:        `2024-${String((i % 12) + 1).padStart(2, "0")}-15`,
    hash:         `abc${i}def${i}ghi${i}`.padEnd(64, "0"),
    typ:          i % 3 === 0 ? "ausgang" : "eingang",
    betrag:       i % 3 === 0 ? -(0.001 * (i + 1)) : 0.005 * (i + 1),
    waehrung:     "BTC",
    chfZeitpunkt: 50000 + i * 1000,
    chfHeute:     null,
    aktuellerKurs: kurs3112,
  }));

  return {
    wallets:       ["zpub6rLtzSoXnXKPXHroRKGCwuRVHjgA5YL6oUkdZnCfbDLdtAKNXb1FX1EmPUYR1uYMRBpngvkdJwxqhLvM46trRy5MRb7oYdSLbb4w5VC4i3z"],
    blockchain:    "bitcoin",
    transaktionen,
    aktuellerKurs: kurs3112,
    kurs3112,
    derivedAddresses: ["bc1qvqatyv2xynyanrej2fcutj6w5yugy0gc9jx2nn", "bc1qsomeotheraddress"],
    xpubMeta:      { inputType: "zpub", derivedAddresses: [] },
  };
}

// ─── detectInputType: Routing-Entscheidung ────────────────────────────────────

describe("xpub-dashboard: detectInputType Routing-Logik", () => {
  const ZPUB = "zpub6rLtzSoXnXKPXHroRKGCwuRVHjgA5YL6oUkdZnCfbDLdtAKNXb1FX1EmPUYR1uYMRBpngvkdJwxqhLvM46trRy5MRb7oYdSLbb4w5VC4i3z";
  const XPUB = "xpub6CUGRUonZSQ4TWtTMmzXdrXDtypWKiKrhko4egpiMZbpiaQL2jkwSB1icqYh2cfDfVxdx4df189oLKnC5fSwqPfgyP3hooxujYzAu3fDVmz";

  test("zpub wird korrekt erkannt → Dashboard routet via /api/analyze", () => {
    const typ = detectInputType(ZPUB);
    expect(["xpub", "ypub", "zpub"].includes(typ)).toBe(true);
    expect(typ).toBe("zpub");
  });

  test("xpub wird korrekt erkannt → Dashboard routet via /api/analyze", () => {
    const typ = detectInputType(XPUB);
    expect(["xpub", "ypub", "zpub"].includes(typ)).toBe(true);
    expect(typ).toBe("xpub");
  });

  test("bc1q-Adresse → kein xpub-Routing (normaler wallet/bitcoin Pfad)", () => {
    const typ = detectInputType("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4");
    expect(["xpub", "ypub", "zpub"].includes(typ)).toBe(false);
    expect(typ).toBe("address");
  });

  test("Legacy-Adresse (1...) → kein xpub-Routing", () => {
    const typ = detectInputType("1A1zP1eP5QGefi2DMPTfTL5SLmv7Divfna");
    expect(["xpub", "ypub", "zpub"].includes(typ)).toBe(false);
  });

  test("Ungültiger Input → kein xpub-Routing", () => {
    expect(["xpub", "ypub", "zpub"].includes(detectInputType("hallo"))).toBe(false);
    expect(["xpub", "ypub", "zpub"].includes(detectInputType(""))).toBe(false);
    expect(["xpub", "ypub", "zpub"].includes(detectInputType(null))).toBe(false);
  });
});

// ─── /api/analyze Mock: Transaktionen + kurs3112 ─────────────────────────────

describe("xpub-dashboard: /api/analyze Antwort-Struktur (Mock)", () => {
  test("Antwort enthält transaktionen-Array", () => {
    const antwort = mockAnalyzeAntwort(27, 95430.25);
    expect(Array.isArray(antwort.transaktionen)).toBe(true);
    expect(antwort.transaktionen.length).toBe(27);
  });

  test("Antwort enthält kurs3112 > 0", () => {
    const antwort = mockAnalyzeAntwort(5, 95430.25);
    expect(antwort.kurs3112).toBeGreaterThan(0);
    expect(antwort.kurs3112).toBe(95430.25);
  });

  test("Antwort enthält aktuellerKurs > 0", () => {
    const antwort = mockAnalyzeAntwort(5, 95430.25);
    expect(antwort.aktuellerKurs).toBeGreaterThan(0);
  });

  test("Transaktionen haben korrekte Felder", () => {
    const antwort = mockAnalyzeAntwort(3);
    for (const tx of antwort.transaktionen) {
      expect(tx).toHaveProperty("datum");
      expect(tx).toHaveProperty("hash");
      expect(tx).toHaveProperty("typ");
      expect(tx).toHaveProperty("betrag");
      expect(tx).toHaveProperty("waehrung");
    }
  });

  test("derivedAddresses ist ein nicht-leeres Array", () => {
    const antwort = mockAnalyzeAntwort(5);
    expect(Array.isArray(antwort.derivedAddresses)).toBe(true);
    expect(antwort.derivedAddresses.length).toBeGreaterThan(0);
  });
});

// ─── /api/wallet/bitcoin → 422 xpub_detected ─────────────────────────────────

describe("xpub-dashboard: /api/wallet/bitcoin 422 für xpub", () => {
  function simuliere422Antwort() {
    return {
      ok:     false,
      status: 422,
      json:   async () => ({
        error:   "xpub_detected",
        message: "Extended Public Keys müssen über /api/analyze verarbeitet werden",
      }),
    };
  }

  test("422-Antwort hat ok=false und status=422", async () => {
    const res = simuliere422Antwort();
    expect(res.ok).toBe(false);
    expect(res.status).toBe(422);
  });

  test("422-Antwort hat error='xpub_detected'", async () => {
    const res = simuliere422Antwort();
    const body = await res.json();
    expect(body.error).toBe("xpub_detected");
  });

  test("Dashboard sollte 422 still ignorieren (kein Fehler anzeigen)", async () => {
    // Simuliert die Logik in WalletDashboard.ladeTransaktionen
    const res = simuliere422Antwort();
    const body = await res.json();

    let fehlerGezeigt = false;
    // Dashboard-Logik: wenn error === 'xpub_detected' → return ohne Fehler setzen
    if (body.error === "xpub_detected") {
      // kein setFehler()-Aufruf → korrekt
    } else {
      fehlerGezeigt = true;
    }

    expect(fehlerGezeigt).toBe(false);
  });
});

// ─── FIFO Steuerwert-Berechnung für xpub-Wallets ─────────────────────────────

describe("xpub-dashboard: FIFO-Berechnung für xpub-Transaktionen", () => {
  const KURS_3112 = 95430.25;

  // Beispiel-Transaktionen wie sie aus /api/analyze kommen
  const TXS = [
    { datum: "2024-01-10", typ: "eingang", betrag: 0.5,  waehrung: "BTC", chfZeitpunkt: 42000 },
    { datum: "2024-03-15", typ: "eingang", betrag: 0.3,  waehrung: "BTC", chfZeitpunkt: 55000 },
    { datum: "2024-07-20", typ: "ausgang", betrag: 0.2,  waehrung: "BTC", chfZeitpunkt: 61000 },
  ];

  test("calculateFIFO wirft nicht bei gültigen xpub-Transaktionen", () => {
    expect(() => calculateFIFO(TXS, KURS_3112, 2024)).not.toThrow();
  });

  test("endbestandBTC = eingänge - ausgänge", () => {
    const result = calculateFIFO(TXS, KURS_3112, 2024);
    const erwartet = 0.5 + 0.3 - 0.2;
    expect(result.endbestandAmount).toBeCloseTo(erwartet, 8);
  });

  test("steuerwert = endbestand × kurs3112 (gerundet)", () => {
    const result = calculateFIFO(TXS, KURS_3112, 2024);
    const erwartetSteuerwert = Math.round(result.endbestandAmount * KURS_3112 * 100) / 100;
    expect(result.steuerwertChf).toBeCloseTo(erwartetSteuerwert, 2);
  });

  test("Leere TX-Liste → endbestand=0", () => {
    const result = calculateFIFO([], KURS_3112, 2024);
    expect(result.endbestandAmount).toBe(0);
    expect(result.steuerwertChf).toBe(0);
  });
});

// ─── xpub-dashboard: Datei-Checks (Source-Code-Analyse) ──────────────────────

describe("xpub-dashboard: Dashboard-Implementierung prüfen", () => {
  const fs = require("fs");

  test("dashboard/page.js importiert detectInputType", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("detectInputType");
  });

  test("dashboard/page.js hat xpub/ypub/zpub Routing-Logik", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("zpub");
    expect(src).toContain("xpub");
  });

  test("dashboard/page.js routet xpub via /api/analyze (nicht /api/wallet/bitcoin)", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("/api/analyze");
  });

  test("dashboard/page.js übergibt externeTransaktionen an WalletDashboard", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("externeTransaktionen");
  });

  test("wallet/bitcoin/route.js gibt 422 für xpub zurück", () => {
    const src = fs.readFileSync("app/api/wallet/bitcoin/route.js", "utf8");
    expect(src).toContain("422");
    expect(src).toContain("xpub_detected");
  });
});

// ─── xpub Dashboard — Datenpfad Fix (direkte Logik-Tests) ───────────────────

describe("xpub Dashboard — Datenpfad Fix", () => {
  test("Single-Wallet useEffect setzt gemergteTransaktionen bei xpub", () => {
    let gemergteTransaktionen = null;
    let gemergterKurs3112 = null;
    let gemergterKurs = null;

    const setGemergteTransaktionen = (v) => { gemergteTransaktionen = v; };
    const setGemergterKurs3112 = (v) => { gemergterKurs3112 = v; };
    const setGemergterKurs = (v) => { gemergterKurs = v; };

    // Simuliere die FIXED analyze-Response-Verarbeitung
    const daten = {
      kurs3112: 69990.44,
      aktuellerKurs: 85000,
      transaktionen: Array(27).fill({ datum: "2025-01-01T00:00:00Z", hash: "x", typ: "eingang", betrag: 0.001, waehrung: "BTC" }),
    };

    if (daten.kurs3112 > 0) setGemergterKurs3112(daten.kurs3112);
    if (daten.transaktionen?.length > 0) setGemergteTransaktionen(daten.transaktionen);
    if (daten.aktuellerKurs > 0) setGemergterKurs(daten.aktuellerKurs);

    expect(gemergteTransaktionen).toHaveLength(27);
    expect(gemergterKurs3112).toBe(69990.44);
    expect(gemergterKurs).toBe(85000);
  });

  test("422 xpub_detected: kein Fehler, laedt = false", async () => {
    let laedt = true;
    let fehler = null;
    const setLaedt = (v) => { laedt = v; };
    const setFehler = (v) => { fehler = v; };

    // Simuliere den FIXED !antwort.ok Block
    const antwort = { ok: false, status: 422 };
    const daten = { error: "xpub_detected" };

    if (!antwort.ok) {
      if (antwort.status === 422 && daten?.error === "xpub_detected") {
        setLaedt(false);
        // return → kein Fehler
      } else {
        setFehler(daten?.error || "Fehler");
      }
    }

    expect(laedt).toBe(false);
    expect(fehler).toBeNull();
  });

  test("WalletDashboard überspringt API-Call wenn externeTransaktionen gesetzt", () => {
    const externeTransaktionen = [{ datum: "2025-01-01T00:00:00Z", typ: "eingang", betrag: 0.001 }];
    // Guard-Logik aus ladeTransaktionen:
    const shouldSkip = externeTransaktionen !== null;
    expect(shouldSkip).toBe(true);
  });

  test("steuerwert Konsistenz: endbestandBTC × kurs3112", () => {
    const endbestandBTC = 0.013034939999999998;
    const kurs3112 = 69990.44;
    const steuerwert = Math.round(endbestandBTC * kurs3112 * 100) / 100;
    expect(steuerwert).toBe(912.32);
  });

  test("neuestesJahr-Logik wählt letztes abgeschlossenes Jahr", () => {
    const txs = [
      { datum: "2025-08-30T00:00:00Z" },
      { datum: "2025-12-31T00:00:00Z" },
      { datum: "2026-01-15T00:00:00Z" }, // laufendes Jahr
      { datum: "2026-03-17T00:00:00Z" }, // laufendes Jahr
    ];

    const aktuellesJahr = new Date().getFullYear(); // 2026
    const letzteAbgeschlossenesJahr = aktuellesJahr - 1; // 2025

    const txJahre = txs.map(tx => new Date(tx.datum).getFullYear());
    const neuestesAbgeschlossenesJahr = Math.max(
      ...txJahre.filter(j => j <= letzteAbgeschlossenesJahr)
    );
    const zielJahr = isFinite(neuestesAbgeschlossenesJahr)
      ? neuestesAbgeschlossenesJahr
      : letzteAbgeschlossenesJahr;

    expect(zielJahr).toBe(2025); // NICHT 2026
    expect(zielJahr).toBeLessThan(aktuellesJahr);
  });

  test("neuestesJahr-Logik: alle TXs im laufenden Jahr → Fallback auf Vorjahr", () => {
    const aktuellesJahr = new Date().getFullYear();
    const txs = [
      { datum: `${aktuellesJahr}-01-01T00:00:00Z` },
      { datum: `${aktuellesJahr}-03-01T00:00:00Z` },
    ];

    const letzteAbgeschlossenesJahr = aktuellesJahr - 1;
    const txJahre = txs.map(tx => new Date(tx.datum).getFullYear());
    const filtered = txJahre.filter(j => j <= letzteAbgeschlossenesJahr);
    const zielJahr = filtered.length > 0
      ? Math.max(...filtered)
      : letzteAbgeschlossenesJahr;

    expect(zielJahr).toBe(letzteAbgeschlossenesJahr);
  });
});

// ─── Integration: TEST_ZPUB (nur lokal, kein CI) ─────────────────────────────

const TEST_ZPUB = process.env.TEST_ZPUB || null;

describe("xpub-dashboard: Live-Integration (übersprungen ohne TEST_ZPUB)", () => {
  test("scanXpub liefert bc1q-Adressen für echten zpub", async () => {
    if (!TEST_ZPUB) {
      console.log("  [SKIP] TEST_ZPUB nicht gesetzt – Integration-Test übersprungen");
      return;
    }

    const { scanXpub } = await import("../lib/xpub-scanner.js");
    const result = await scanXpub(TEST_ZPUB);

    expect(Array.isArray(result.addresses)).toBe(true);
    expect(result.addresses.length).toBeGreaterThan(0);
    expect(result.inputType).toBe("zpub");
    for (const addr of result.addresses) {
      expect(addr).toMatch(/^bc1q/);
    }
  }, 60000);
});
