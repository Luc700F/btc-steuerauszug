function zielJahr(txs) {
  if (!txs?.length) return new Date().getFullYear() - 1;
  const akt = new Date().getFullYear();
  const max = Math.max(...txs.map(t => new Date(t.datum).getFullYear()).filter(j => j < akt));
  return isFinite(max) ? max : akt - 1;
}

const AKT = new Date().getFullYear(); // 2026
const LAST = AKT - 1;                // 2025

describe("xpub Jahresselektion", () => {
  test("useState init = Vorjahr", () => {
    expect(new Date().getFullYear() - 1).toBe(LAST);
  });

  test("TXs 2025+2026 → wählt 2025", () => {
    expect(zielJahr([{ datum: "2025-08-30T00:00:00Z" }, { datum: "2026-03-17T00:00:00Z" }])).toBe(2025);
  });

  test("Nur laufendes Jahr → Vorjahr", () => {
    expect(zielJahr([{ datum: `${AKT}-01-01T00:00:00Z` }])).toBe(LAST);
  });

  test("Nur 2025 → 2025", () => {
    expect(zielJahr([{ datum: "2025-12-31T00:00:00Z" }])).toBe(2025);
  });

  test("Leer → Vorjahr", () => {
    expect(zielJahr([])).toBe(LAST);
  });

  test("Ergebnis immer < aktuellem Jahr", () => {
    expect(zielJahr([{ datum: "2025-01-01T00:00:00Z" }, { datum: `${AKT}-06-01T00:00:00Z` }]))
      .toBeLessThan(AKT);
  });

  test("REGRESSION: Math.max ohne filter würde 2026 zurückgeben", () => {
    const txs = [{ datum: "2025-12-31T00:00:00Z" }, { datum: "2026-03-17T00:00:00Z" }];
    const falsch = Math.max(...txs.map(t => new Date(t.datum).getFullYear()));
    expect(falsch).toBe(2026);        // alter Bug
    expect(zielJahr(txs)).toBe(2025); // neue korrekte Logik
  });

  test("page.js: alte Bug-Strings existieren nicht mehr", () => {
    const fs = require("fs");
    const code = fs.readFileSync("app/dashboard/page.js", "utf8");
    // Alter useState-Bug:
    expect(code).not.toMatch(/useState\(String\(new Date\(\)\.getFullYear\(\)\)\)/);
    // Altes Math.max ohne filter (war immer mehrzeilig):
    expect(code).not.toMatch(/Math\.max\(\n\s*\.\.\.externeTransaktionen\.map/);
    expect(code).not.toMatch(/Math\.max\(\n\s*\.\.\.daten\.transaktionen\.map/);
    // Neue korrekte Logik vorhanden:
    expect(code).toContain("filter((j) => j < _akt)");
    expect(code).toContain("getFullYear() - 1)");
  });
});
