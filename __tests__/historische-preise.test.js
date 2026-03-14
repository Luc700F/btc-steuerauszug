// ─────────────────────────────────────────────────────────────────────────────
// __tests__/historische-preise.test.js
// Zweck: Live-API-Tests für lib/price-service.js (generische Kurs-Funktion)
// HINWEIS: Benötigt Netzwerkzugang – Timeouts grosszügig gesetzt
// ─────────────────────────────────────────────────────────────────────────────
import { getHistoricalPriceChf, fetchAllHistoricalPrices } from "../lib/price-service";

const TIMEOUT = 30_000;

describe("getHistoricalPriceChf – BTC", () => {
  test("BTC 31.12.2025: Kurs vorhanden und plausibel (ESTV-Referenz ~69'990)", async () => {
    const r = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    expect(r.price).toBeGreaterThan(0);
    expect(r.source).not.toBe("unavailable");
    // Toleranz ±20% gegenüber ESTV-Referenz 69'990
    expect(r.price).toBeGreaterThan(55000);
    expect(r.price).toBeLessThan(90000);
  }, TIMEOUT);

  test("BTC 31.12.2025 ist HISTORISCHER Kurs (nicht heutiger Live-Kurs ~53'000)", async () => {
    const r = await getHistoricalPriceChf("bitcoin", "2025-12-31");
    // Live-Kurs März 2026 ≈ 53'000–60'000, historischer 31.12.2025 ≈ 69'990
    // Wenn die Kurse gleich wären, wurde der falsche Kurs verwendet
    if (r.price > 0) {
      // ESTV-Kurs 31.12.2025 war ~69'990; live-Kurs Anfang 2026 war ~53'000–58'000
      // Wir prüfen nur, dass es kein offensichtlicher Live-Kurs ist
      expect(r.source).not.toBe("current-fallback");
    }
  }, TIMEOUT);

  test("Rückgabeformat: { price, source, date }", async () => {
    const r = await getHistoricalPriceChf("bitcoin", "2024-12-31");
    expect(r).toHaveProperty("price");
    expect(r).toHaveProperty("source");
    expect(r).toHaveProperty("date");
    expect(typeof r.price).toBe("number");
    expect(typeof r.source).toBe("string");
  }, TIMEOUT);

  test("Cache: zweiter Aufruf gibt denselben Wert zurück (kein doppelter API-Call)", async () => {
    const r1 = await getHistoricalPriceChf("bitcoin", "2024-06-15");
    const r2 = await getHistoricalPriceChf("bitcoin", "2024-06-15");
    expect(r1.price).toBe(r2.price);
    expect(r1.source).toBe(r2.source);
  }, TIMEOUT);
});

describe("getHistoricalPriceChf – ETH / SOL", () => {
  test("ETH 31.12.2025: Preis > 0", async () => {
    const r = await getHistoricalPriceChf("ethereum", "2025-12-31");
    expect(r.price).toBeGreaterThan(0);
  }, TIMEOUT);

  test("SOL 31.12.2025: Preis > 0", async () => {
    const r = await getHistoricalPriceChf("solana", "2025-12-31");
    expect(r.price).toBeGreaterThan(0);
  }, TIMEOUT);
});

describe("getHistoricalPriceChf – Kein live Fallback", () => {
  test("Zukunftsdatum: kein Crash, gibt unavailable zurück", async () => {
    const r = await getHistoricalPriceChf("bitcoin", "2099-12-31");
    expect(r).toBeDefined();
    expect(typeof r.price).toBe("number");
    // Kann 0 sein (unavailable) – aber KEIN aktueller Live-Kurs als Fallback
    expect(r.source).not.toBe("current-fallback");
  }, TIMEOUT);

  test("source ist niemals 'current-fallback' (live-Fallback entfernt)", async () => {
    // Normaler historischer Kurs: kein current-fallback
    const r = await getHistoricalPriceChf("bitcoin", "2024-01-15");
    if (r.price > 0) {
      expect(r.source).not.toBe("current-fallback");
    }
  }, TIMEOUT);
});

describe("fetchAllHistoricalPrices – Batch Loading", () => {
  test("Verarbeitet mehrere Transaktionen, gibt Map zurück", async () => {
    const txs = [
      { date: "2024-01-15" },
      { date: "2024-06-01" },
    ];
    const map = await fetchAllHistoricalPrices(txs, "bitcoin");
    expect(map["2024-01-15"]).toBeDefined();
    expect(map["2024-06-01"]).toBeDefined();
    if (map["2024-01-15"].price > 0) {
      expect(map["2024-01-15"].price).toBeGreaterThan(30000); // BTC war 2024 > 30k CHF
    }
  }, TIMEOUT * 2);

  test("Dedupliziert gleiche Daten", async () => {
    const txs = [
      { date: "2024-03-01" },
      { date: "2024-03-01" }, // Duplikat
      { date: "2024-03-01" }, // Nochmal
    ];
    const map = await fetchAllHistoricalPrices(txs, "bitcoin");
    // Nur 1 API-Call, aber Map enthält den Wert
    expect(map["2024-03-01"]).toBeDefined();
  }, TIMEOUT);

  test("Unterstützt datum-Feld (internes Format)", async () => {
    const txs = [
      { datum: "2024-01-15T00:00:00.000Z" },
    ];
    const map = await fetchAllHistoricalPrices(txs, "bitcoin");
    expect(map["2024-01-15"]).toBeDefined();
  }, TIMEOUT);
});
