import { parseBitBoxCSV } from "../lib/csv-parser.js";

// ─── Beispiel-CSV im BitBox-Format ────────────────────────────────────────────
const SAMPLE_CSV = `Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note
2025-12-31T08:54:30+01:00,received,70081,satoshi,,,bc1q5qhy...,38f541d2...,
2025-08-30T06:46:57Z,received,335477,satoshi,,,bc1q4dfp...,199e3780...,`;

const MIXED_CSV = `Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note
2026-01-07T12:00:00Z,received,500000,satoshi,,,bc1qabc...,txhash1,
2026-01-15T08:30:00+01:00,sent,200000,satoshi,,,bc1qdef...,txhash2,
2025-12-31T00:00:00Z,received,0.005,BTC,,,bc1qghi...,txhash3,`;

// ─── BitBox CSV Parser Tests ───────────────────────────────────────────────────

describe("BitBox CSV Parser – parseBitBoxCSV", () => {
  test("Funktion ist exportiert", () => {
    expect(typeof parseBitBoxCSV).toBe("function");
  });

  test("Leerer String gibt leeres Array zurück", () => {
    expect(parseBitBoxCSV("")).toEqual([]);
    expect(parseBitBoxCSV(null)).toEqual([]);
  });

  test("Nur Header ohne Datenzeilen gibt leeres Array zurück", () => {
    const csv = "Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note";
    expect(parseBitBoxCSV(csv)).toEqual([]);
  });

  test("Satoshi wird korrekt in BTC konvertiert", () => {
    const rows = parseBitBoxCSV(SAMPLE_CSV);
    expect(rows).toHaveLength(2);
    expect(rows[0].betrag).toBeCloseTo(0.00070081, 8);
    expect(rows[1].betrag).toBeCloseTo(0.00335477, 8);
  });

  test("received wird als eingang erkannt", () => {
    const rows = parseBitBoxCSV(SAMPLE_CSV);
    rows.forEach((r) => expect(r.typ).toBe("eingang"));
  });

  test("sent wird als ausgang erkannt", () => {
    const rows = parseBitBoxCSV(MIXED_CSV);
    const sent = rows.find((r) => r.typ === "ausgang");
    expect(sent).toBeDefined();
  });

  test("Timestamps mit Timezone-Offset (+01:00) werden korrekt geparst", () => {
    const rows = parseBitBoxCSV(SAMPLE_CSV);
    expect(rows[0].datum).toContain("2025-12-31");
  });

  test("Timestamps mit Z (UTC) werden korrekt geparst", () => {
    const rows = parseBitBoxCSV(SAMPLE_CSV);
    expect(rows[1].datum).toContain("2025-08-30");
  });

  test("Währung BTC (nicht Satoshi) wird direkt übernommen", () => {
    const rows = parseBitBoxCSV(MIXED_CSV);
    const btcRow = rows.find((r) => r.betrag === 0.005);
    expect(btcRow).toBeDefined();
    expect(btcRow.waehrung).toBe("BTC");
  });

  test("Leere Fee-Felder werfen keinen Fehler", () => {
    expect(() => parseBitBoxCSV(SAMPLE_CSV)).not.toThrow();
  });

  test("Ungültige Zeitstempel werden übersprungen", () => {
    const csv = `Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note
invalid_date,received,1000,satoshi,,,bc1q...,hash,
2025-06-01T00:00:00Z,received,500,satoshi,,,bc1q...,hash2,`;
    const rows = parseBitBoxCSV(csv);
    expect(rows).toHaveLength(1); // Nur die gültige Zeile
  });

  test("Unbekannte Typen (fee, etc.) werden übersprungen", () => {
    const csv = `Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note
2025-06-01T00:00:00Z,fee,100,satoshi,,,bc1q...,hash,
2025-06-02T00:00:00Z,received,1000,satoshi,,,bc1q...,hash2,`;
    const rows = parseBitBoxCSV(csv);
    expect(rows).toHaveLength(1); // fee wird übersprungen
    expect(rows[0].typ).toBe("eingang");
  });

  test("Header-Erkennung ist case-insensitiv", () => {
    const csv = `time,type,amount,unit,fee,fee unit,address,transaction id,note
2025-01-01T00:00:00Z,received,100,satoshi,,,bc1q...,hash,`;
    const rows = parseBitBoxCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].betrag).toBeCloseTo(0.000001, 8);
  });

  test("Transaction-Hash wird korrekt übernommen", () => {
    const rows = parseBitBoxCSV(SAMPLE_CSV);
    expect(rows[0].hash).toBe("38f541d2...");
    expect(rows[1].hash).toBe("199e3780...");
  });

  test("Rückgabe-Objekte haben alle Pflichtfelder", () => {
    const rows = parseBitBoxCSV(SAMPLE_CSV);
    for (const row of rows) {
      expect(row).toHaveProperty("datum");
      expect(row).toHaveProperty("typ");
      expect(row).toHaveProperty("betrag");
      expect(row).toHaveProperty("waehrung");
      expect(row).toHaveProperty("hash");
    }
  });
});
