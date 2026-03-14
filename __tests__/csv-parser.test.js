import { detectCurrencyFromCSV, parseCsvZeile } from "../lib/csv-parser";

describe("CSV Parser", () => {
  describe("detectCurrencyFromCSV", () => {
    test("erkennt Bitcoin aus SATOSHI-Einträgen", () => {
      const rows = [
        { unit: "SATOSHI", amount: 93792 },
        { unit: "SATOSHI", amount: 94562 },
      ];
      expect(detectCurrencyFromCSV(rows)).toBe("BTC");
    });

    test("erkennt Ethereum aus WEI-Einträgen", () => {
      const rows = [
        { unit: "WEI", amount: 1e18 },
        { unit: "WEI", amount: 5e17 },
      ];
      expect(detectCurrencyFromCSV(rows)).toBe("ETH");
    });

    test("erkennt direkte Währungsangabe BTC", () => {
      const rows = [
        { unit: "BTC", amount: 0.5 },
        { unit: "BTC", amount: 0.1 },
      ];
      expect(detectCurrencyFromCSV(rows)).toBe("BTC");
    });

    test("erkennt LINK direkt", () => {
      const rows = [{ unit: "LINK", amount: 6.5 }];
      expect(detectCurrencyFromCSV(rows)).toBe("LINK");
    });

    test("gibt UNKNOWN bei leerer Liste zurück", () => {
      expect(detectCurrencyFromCSV([])).toBe("UNKNOWN");
    });

    test("gibt UNKNOWN bei null zurück", () => {
      expect(detectCurrencyFromCSV(null)).toBe("UNKNOWN");
    });

    test("wählt häufigste Einheit bei gemischten Einträgen", () => {
      const rows = [
        { unit: "BTC", amount: 0.1 },
        { unit: "BTC", amount: 0.2 },
        { unit: "ETH", amount: 1 },
      ];
      expect(detectCurrencyFromCSV(rows)).toBe("BTC");
    });
  });

  describe("parseCsvZeile", () => {
    test("parsed einfache CSV-Zeile", () => {
      const result = parseCsvZeile("2025-01-01,received,0.5,BTC");
      expect(result).toEqual(["2025-01-01", "received", "0.5", "BTC"]);
    });

    test("entfernt Anführungszeichen", () => {
      const result = parseCsvZeile('"2025-01-01","received","0.5","BTC"');
      expect(result).toEqual(["2025-01-01", "received", "0.5", "BTC"]);
    });

    test("unterstützt Semikolon als Trennzeichen", () => {
      const result = parseCsvZeile("2025-01-01;received;0.5;BTC", ";");
      expect(result).toEqual(["2025-01-01", "received", "0.5", "BTC"]);
    });
  });
});
