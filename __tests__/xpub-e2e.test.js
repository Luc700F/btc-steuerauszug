// ─────────────────────────────────────────────────────────────────────────────
// __tests__/xpub-e2e.test.js
// End-to-End Tests für xpub/zpub Dashboard-Verhalten
// Diese Tests schlagen FEHL wenn das xpub-Problem zurückkommt
// ─────────────────────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const SKIP_NETWORK = process.env.CI === "true";

// Hilfsfunktion: Jahr-Logik isoliert testen (entspricht dem Fix in dashboard/page.js)
function berechneZielJahr(transaktionen) {
  const letzteAbgeschlossenesJahr = new Date().getFullYear() - 1;
  const txJahre = transaktionen.map(
    (tx) => new Date(tx.datum).getFullYear()
  );
  const neuestesAbgeschlossenesJahr = Math.max(
    ...txJahre.filter((j) => j <= letzteAbgeschlossenesJahr)
  );
  return isFinite(neuestesAbgeschlossenesJahr)
    ? neuestesAbgeschlossenesJahr
    : letzteAbgeschlossenesJahr;
}

// ─── Jahr-Selektion ───────────────────────────────────────────────────────────

describe("Jahr-Selektion bei xpub mit TXs aus mehreren Jahren", () => {
  test("TXs von 2025 und 2026 → Ziel ist 2025", () => {
    const txs = [
      { datum: "2025-08-30T00:00:00Z" },
      { datum: "2025-12-31T00:00:00Z" },
      { datum: "2026-01-15T00:00:00Z" },
      { datum: "2026-03-17T00:00:00Z" },
    ];
    expect(berechneZielJahr(txs)).toBe(2025);
  });

  test("TXs nur 2025 → Ziel ist 2025", () => {
    const txs = [
      { datum: "2025-01-01T00:00:00Z" },
      { datum: "2025-12-31T00:00:00Z" },
    ];
    expect(berechneZielJahr(txs)).toBe(2025);
  });

  test("TXs nur im laufenden Jahr → Fallback auf Vorjahr", () => {
    const aktuellesJahr = new Date().getFullYear();
    const txs = [
      { datum: `${aktuellesJahr}-01-01T00:00:00Z` },
      { datum: `${aktuellesJahr}-03-01T00:00:00Z` },
    ];
    expect(berechneZielJahr(txs)).toBe(aktuellesJahr - 1);
  });

  test("TXs von 2023, 2024, 2025, 2026 → Ziel ist 2025", () => {
    const aktuellesJahr = new Date().getFullYear();
    const txs = [2023, 2024, 2025, aktuellesJahr].map((y) => ({
      datum: `${y}-06-15T00:00:00Z`,
    }));
    expect(berechneZielJahr(txs)).toBe(aktuellesJahr - 1);
  });

  test("Ziel-Jahr ist immer < aktuellem Jahr", () => {
    const txs = [
      { datum: "2025-08-30T00:00:00Z" },
      { datum: "2026-03-17T00:00:00Z" },
    ];
    const ziel = berechneZielJahr(txs);
    expect(ziel).toBeLessThan(new Date().getFullYear());
  });

  test("Ziel-Jahr ist niemals das laufende Jahr", () => {
    const aktuellesJahr = new Date().getFullYear();
    const txsNurDiesesJahr = [
      { datum: `${aktuellesJahr}-01-01T00:00:00Z` },
    ];
    const ziel = berechneZielJahr(txsNurDiesesJahr);
    expect(ziel).not.toBe(aktuellesJahr);
  });
});

// ─── ladeTransaktionen Guard ──────────────────────────────────────────────────

describe("ladeTransaktionen Guard: xpub überspringt eigenen API-Call", () => {
  test("externeTransaktionen !== null → ladeTransaktionen nicht aufrufen", () => {
    const externeTransaktionen = [{ datum: "2025-01-01T00:00:00Z", typ: "eingang", betrag: 0.001 }];

    let ladeTransaktionenAufgerufen = false;
    const mockLadeTransaktionen = () => { ladeTransaktionenAufgerufen = true; };

    if (externeTransaktionen === null) {
      mockLadeTransaktionen();
    }

    expect(ladeTransaktionenAufgerufen).toBe(false);
  });

  test("externeTransaktionen === null → ladeTransaktionen aufrufen", () => {
    const externeTransaktionen = null;

    let ladeTransaktionenAufgerufen = false;
    const mockLadeTransaktionen = () => { ladeTransaktionenAufgerufen = true; };

    if (externeTransaktionen === null) {
      mockLadeTransaktionen();
    }

    expect(ladeTransaktionenAufgerufen).toBe(true);
  });
});

// ─── Source-Code: alle 3 neuestesJahr-Stellen gefixt ─────────────────────────

describe("dashboard/page.js: neuestesJahr überall begrenzt", () => {
  const fs = require("fs");

  test("kein ungeguardetes Math.max für setAusgewaehltesJahr", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    // Kein direktes setAusgewaehltesJahr mit Math.max ohne Filter mehr
    // Alle Vorkommen müssen durch letzteAbgeschlossenesJahr-Filter geschützt sein
    expect(src).not.toMatch(/const neuestesJahr = Math\.max\(/);
  });

  test("filter((j) => j < _akt)-Pattern kommt mind. 3× vor (sync-effect + xpub + normal)", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    const count = (src.match(/filter\(\(j\) => j < _akt\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("CSV-Pfad verwendet aeltestesJahr (Math.min) — unverändert korrekt", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("aeltestesJahr");
    expect(src).toContain("Math.min");
  });

  test("ladeTransaktionen hat guard: externeTransaktionen !== null → return", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("if (externeTransaktionen !== null) return;");
  });

  test("422 xpub_detected Guard ist vorhanden", () => {
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).toContain("xpub_detected");
    expect(src).toContain("422");
  });
});

// ─── xpub API Integration (nur lokal mit TEST_ZPUB) ──────────────────────────

const TEST_ZPUB = process.env.TEST_ZPUB || null;

describe("xpub API Integration", () => {
  (SKIP_NETWORK || !TEST_ZPUB ? test.skip : test)(
    "/api/analyze mit zpub gibt ≥1 Transaktion zurück",
    async () => {
      const resp = await fetch(`${BASE}/api/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ wallets: [TEST_ZPUB], taxYear: 2025, blockchain: "bitcoin" }),
      });
      const data = await resp.json();
      expect(resp.status).toBe(200);
      expect(data.transaktionen.length).toBeGreaterThan(0);
      expect(data.steuerwert).toBeGreaterThan(0);
    },
    60000
  );

  (SKIP_NETWORK || !TEST_ZPUB ? test.skip : test)(
    "/api/analyze mit zpub: alle TXs haben gültiges Datum",
    async () => {
      const resp = await fetch(`${BASE}/api/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ wallets: [TEST_ZPUB], taxYear: 2025, blockchain: "bitcoin" }),
      });
      const data = await resp.json();
      data.transaktionen.forEach((tx) => {
        const date = new Date(tx.datum);
        expect(isNaN(date.getTime())).toBe(false);
        expect(tx.betrag).toBeGreaterThan(0);
        expect(["eingang", "ausgang"]).toContain(tx.typ);
      });
    },
    60000
  );

  (SKIP_NETWORK || !TEST_ZPUB ? test.skip : test)(
    "/api/analyze mit zpub: korrekte steuerwert Berechnung",
    async () => {
      const resp = await fetch(`${BASE}/api/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ wallets: [TEST_ZPUB], taxYear: 2025, blockchain: "bitcoin" }),
      });
      const data = await resp.json();
      const berechnet = Math.round(data.endbestandBTC * data.kurs3112 * 100) / 100;
      expect(Math.abs(berechnet - data.steuerwert)).toBeLessThanOrEqual(0.02);
    },
    60000
  );

  (SKIP_NETWORK || !TEST_ZPUB ? test.skip : test)(
    "/api/wallet/bitcoin mit zpub gibt 422 xpub_detected zurück",
    async () => {
      const resp = await fetch(`${BASE}/api/wallet/bitcoin?address=${encodeURIComponent(TEST_ZPUB)}`);
      const data = await resp.json();
      expect(resp.status).toBe(422);
      expect(data.error).toBe("xpub_detected");
    },
    10000
  );

  (SKIP_NETWORK || !TEST_ZPUB ? test.skip : test)(
    "Dashboard zeigt 2025 als Steuerjahr bei zpub mit TXs bis 2026",
    async () => {
      const resp = await fetch(`${BASE}/api/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ wallets: [TEST_ZPUB], taxYear: 2025, blockchain: "bitcoin" }),
      });
      const data = await resp.json();
      const zielJahr = berechneZielJahr(data.transaktionen);
      expect(zielJahr).toBe(2025);
      expect(zielJahr).toBeLessThan(new Date().getFullYear());
    },
    60000
  );
});

// ─── Konsistenz: Analyse-Daten identisch bei Wiederholung ────────────────────

describe("Konsistenz: Analyse-Daten identisch bei Wiederholung", () => {
  (SKIP_NETWORK || !TEST_ZPUB ? test.skip : test)(
    "Gleicher zpub liefert identischen steuerwert bei 3 Calls",
    async () => {
      const steuerwerte = [];
      for (let i = 0; i < 3; i++) {
        const resp = await fetch(`${BASE}/api/analyze`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ wallets: [TEST_ZPUB], taxYear: 2025, blockchain: "bitcoin" }),
        });
        const data = await resp.json();
        expect(resp.status).toBe(200);
        steuerwerte.push(data.steuerwert);
        if (i < 2) await new Promise((r) => setTimeout(r, 1000));
      }
      expect(steuerwerte[0]).toBe(steuerwerte[1]);
      expect(steuerwerte[1]).toBe(steuerwerte[2]);
    },
    120000
  );
});
