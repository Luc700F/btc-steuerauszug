// ─────────────────────────────────────────────────────────────────────────────
// __tests__/price-service.test.js
// Zweck: Historische CHF-Kurse via app/lib/historicalPrice.js
// ─────────────────────────────────────────────────────────────────────────────
import { getHistoricalCHFPrice, batchHistoricalPrices } from "../app/lib/historicalPrice";

const TIMEOUT = 20_000;

describe("getHistoricalCHFPrice – BTC", () => {
  test("gibt Preis > 0 für bekanntes Datum zurück", async () => {
    const kurs = await getHistoricalCHFPrice("BTC", "2024-10-31");
    expect(kurs).toBeGreaterThan(0);
  }, TIMEOUT);

  test("gibt null zurück für unbekanntes Symbol", async () => {
    const kurs = await getHistoricalCHFPrice("COIN_EXISTIERT_NICHT_XYZ", "2024-01-01");
    expect(kurs).toBeNull();
  }, TIMEOUT);

  test("Cache: zweiter Aufruf gibt denselben Wert zurück", async () => {
    const k1 = await getHistoricalCHFPrice("BTC", "2024-06-15");
    const k2 = await getHistoricalCHFPrice("BTC", "2024-06-15");
    expect(k1).toBe(k2);
  }, TIMEOUT);
});

describe("getHistoricalCHFPrice – ETH / SOL", () => {
  test("ETH Preis ist number oder null (nicht undefined)", async () => {
    const kurs = await getHistoricalCHFPrice("ETH", "2024-10-31");
    expect(kurs === null || typeof kurs === "number").toBe(true);
    if (kurs !== null) expect(kurs).toBeGreaterThan(0);
  }, TIMEOUT);

  test("SOL Preis ist number oder null (nicht undefined)", async () => {
    const kurs = await getHistoricalCHFPrice("SOL", "2024-10-31");
    expect(kurs === null || typeof kurs === "number").toBe(true);
    if (kurs !== null) expect(kurs).toBeGreaterThan(0);
  }, TIMEOUT);
});

describe("batchHistoricalPrices", () => {
  test("verarbeitet mehrere Abfragen und gibt Map zurück", async () => {
    const abfragen = [
      { symbol: "BTC", datumStr: "2024-01-15" },
      { symbol: "BTC", datumStr: "2024-06-01" },
    ];
    const kursMap = await batchHistoricalPrices(abfragen);
    // Map muss die erwarteten Keys enthalten (Wert kann null sein bei API-Ausfall)
    expect(kursMap.has("BTC-2024-01-15")).toBe(true);
    expect(kursMap.has("BTC-2024-06-01")).toBe(true);
    // Wenn ein Preis zurückgegeben wird, muss er > 0 sein
    const k1 = kursMap.get("BTC-2024-01-15");
    const k2 = kursMap.get("BTC-2024-06-01");
    if (k1 !== null) expect(k1).toBeGreaterThan(0);
    if (k2 !== null) expect(k2).toBeGreaterThan(0);
  }, TIMEOUT);

  test("dedupliziert gleiche Symbol+Datum-Kombinationen", async () => {
    const abfragen = [
      { symbol: "BTC", datumStr: "2024-03-01" },
      { symbol: "BTC", datumStr: "2024-03-01" }, // Duplikat
    ];
    const kursMap = await batchHistoricalPrices(abfragen);
    expect(kursMap.size).toBe(1);
  }, TIMEOUT);
});
