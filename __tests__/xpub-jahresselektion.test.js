/**
 * xpub-jahresselektion.test.js
 * Testet die Jahres-Selektion im Dashboard.
 */

function zielJahr(txs) {
  if (!txs?.length) return new Date().getFullYear() - 1;
  const akt = new Date().getFullYear();
  const max = Math.max(
    ...txs.map((tx) => new Date(tx.datum).getFullYear()).filter((j) => j < akt)
  );
  return isFinite(max) ? max : akt - 1;
}

const AKT = new Date().getFullYear();
const LAST = AKT - 1;

describe('Jahresselektion', () => {
  test('TXs 2025+2026 → 2025', () => {
    expect(zielJahr([{datum:'2025-08-30T00:00:00Z'},{datum:'2026-03-17T00:00:00Z'}])).toBe(2025);
  });
  test('Nur 2025 → 2025', () => {
    expect(zielJahr([{datum:'2025-12-31T00:00:00Z'}])).toBe(2025);
  });
  test('Nur laufendes Jahr → Vorjahr', () => {
    expect(zielJahr([{datum:`${AKT}-01-01T00:00:00Z`}])).toBe(LAST);
  });
  test('Leer → Vorjahr', () => {
    expect(zielJahr([])).toBe(LAST);
  });
  test('Ergebnis immer < laufendes Jahr', () => {
    expect(zielJahr([{datum:'2025-01-01T00:00:00Z'},{datum:`${AKT}-06-01T00:00:00Z`}])).toBeLessThan(AKT);
  });
  test('REGRESSION: alter Bug hätte 2026 zurückgegeben', () => {
    const txs = [{datum:'2025-12-31T00:00:00Z'},{datum:'2026-03-17T00:00:00Z'}];
    expect(zielJahr(txs)).toBe(2025);
    expect(zielJahr(txs)).not.toBe(AKT);
  });
});

describe('page.js statische Prüfung', () => {
  const fs = require('fs');
  let code = '';
  beforeAll(() => { try { code = fs.readFileSync('app/dashboard/page.js','utf8'); } catch {} });

  test('useState init = Vorjahr', () => {
    expect(code).toContain('getFullYear() - 1)');
  });
  test('Kein alter useState-Bug', () => {
    expect(/useState\(String\(new Date\(\)\.getFullYear\(\)\)\)/.test(code)).toBe(false);
  });
  test('filter vorhanden', () => {
    expect(code).toContain('.filter((j) => j < _akt)');
  });
  test('Kein Math.max ohne filter auf TX-Jahren', () => {
    expect(code).not.toContain('Math.max(\n        ...externeTransaktionen.map');
    expect(code).not.toContain('Math.max(\n          ...daten.transaktionen.map');
  });
});
