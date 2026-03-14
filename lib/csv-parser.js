// CSV-Parser-Hilfsfunktionen für Unit Tests

/**
 * Erkennt die Hauptwährung aus CSV-Zeilen (BitBox-Format).
 * Unterstützt: SATOSHI→BTC, WEI→ETH, oder direkte Währungsangaben.
 *
 * @param {Array<{unit: string, amount: number}>} rows
 * @returns {string} Währungskürzel (z.B. "BTC", "ETH", "LINK")
 */
export function detectCurrencyFromCSV(rows) {
  if (!rows || rows.length === 0) return "UNKNOWN";

  // Einheiten-Mapping
  const einheitenMap = {
    SATOSHI: "BTC",
    SAT: "BTC",
    WEI: "ETH",
    GWEI: "ETH",
  };

  // Häufigste Einheit ermitteln
  const einheitenZaehler = {};
  for (const row of rows) {
    const einheit = (row.unit || "").trim().toUpperCase();
    if (!einheit) continue;
    const mapped = einheitenMap[einheit] || einheit;
    einheitenZaehler[mapped] = (einheitenZaehler[mapped] || 0) + 1;
  }

  // Häufigste zurückgeben
  const eintraege = Object.entries(einheitenZaehler);
  if (eintraege.length === 0) return "UNKNOWN";
  eintraege.sort((a, b) => b[1] - a[1]);
  return eintraege[0][0];
}

/**
 * Parsed eine CSV-Zeile mit optionalem Anführungszeichen-Handling.
 *
 * @param {string} zeile
 * @param {string} trennzeichen - Standard ","
 * @returns {string[]}
 */
export function parseCsvZeile(zeile, trennzeichen = ",") {
  return zeile.split(trennzeichen).map((s) => s.trim().replace(/^"|"$/g, ""));
}
