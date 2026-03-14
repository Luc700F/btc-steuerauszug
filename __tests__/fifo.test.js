import { calculateFIFO } from "../lib/fifo";

describe("FIFO Berechnung", () => {
  // Testtransaktionen: Kauf 2024, Kauf+Verkauf 2025
  const testTxs = [
    { datum: "2024-06-01T00:00:00Z", typ: "eingang", betrag: 0.1, chfZeitpunkt: 50000 },
    { datum: "2025-03-01T00:00:00Z", typ: "eingang", betrag: 0.05, chfZeitpunkt: 80000 },
    { datum: "2025-09-01T00:00:00Z", typ: "ausgang", betrag: 0.05, chfZeitpunkt: 90000 },
  ];

  test("Anfangsbestand 01.01.2025 korrekt (0.1 BTC aus 2024)", () => {
    const result = calculateFIFO(testTxs, 95000, 2025);
    expect(result.anfangsbestandAmount).toBeCloseTo(0.1, 8);
  });

  test("Endbestand 31.12.2025 korrekt (0.1 BTC: 0.1 - 0.05 + 0.05)", () => {
    const result = calculateFIFO(testTxs, 95000, 2025);
    expect(result.endbestandAmount).toBeCloseTo(0.1, 8);
  });

  test("Realisierter G/V korrekt via FIFO", () => {
    // Verkauf 0.05 BTC zu 90'000 CHF
    // FIFO: ältester Kauf = 0.05 BTC à 50'000 CHF (aus dem 0.1er Kauf von 2024)
    // Erlös: 0.05 × 90'000 = 4'500
    // Basis: 0.05 × 50'000 = 2'500
    // G/V = 2'000 CHF
    const result = calculateFIFO(testTxs, 95000, 2025);
    expect(result.realizedGainChf).toBeCloseTo(2000, 0);
  });

  test("Steuerwert 31.12. korrekt (Bestand × Kurs)", () => {
    // Bestand 0.1 BTC × 95'000 = 9'500 CHF
    const result = calculateFIFO(testTxs, 95000, 2025);
    expect(result.steuerwertChf).toBeCloseTo(9500, 0);
  });

  test("Kein G/V ohne Verkäufe", () => {
    const nurKaeufe = [
      { datum: "2025-01-01T00:00:00Z", typ: "eingang", betrag: 0.5, chfZeitpunkt: 40000 },
    ];
    const result = calculateFIFO(nurKaeufe, 95000, 2025);
    expect(result.realizedGainChf).toBeCloseTo(0, 8);
  });

  test("Anfangsbestand 0 wenn keine Vorjahres-TXs", () => {
    const nurDiesesJahr = [
      { datum: "2025-05-01T00:00:00Z", typ: "eingang", betrag: 0.2, chfZeitpunkt: 60000 },
    ];
    const result = calculateFIFO(nurDiesesJahr, 95000, 2025);
    expect(result.anfangsbestandAmount).toBeCloseTo(0, 8);
  });

  test("Kostenbasis korrekt berechnet", () => {
    const result = calculateFIFO(testTxs, 95000, 2025);
    // Verbleibend: 0.05 BTC à 50'000 + 0.05 BTC à 80'000 = 2'500 + 4'000 = 6'500
    expect(result.kostenbasisChf).toBeCloseTo(6500, 0);
  });
});
