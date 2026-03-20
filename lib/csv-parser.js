// CSV-Parser-Hilfsfunktionen

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

// ─── Typ-Mapping BitBox → intern ─────────────────────────────────────────────
const BITBOX_TYPE_MAP = {
  received:    "eingang",
  sent:        "ausgang",
  buy:         "eingang",
  sell:        "ausgang",
  "trade-buy": "eingang",
  "trade-sell":"ausgang",
};

/**
 * Parsed ein CSV-String im BitBox-Format in ein Array von Transaktions-Objekten.
 *
 * Unterstützte Eigenheiten:
 * - Amount in Satoshi (Unit = satoshi|sat) → automatische BTC-Konvertierung
 * - ISO-Timestamps mit Timezone-Offset (+01:00, Z, -05:00)
 * - Case-insensitive Header-Erkennung
 * - Unbekannte Type-Werte werden übersprungen
 * - Leere / ungültige Zeilen werden ignoriert
 *
 * @param {string} csvString - Rohes CSV als String
 * @returns {Array<{datum:string, typ:string, betrag:number, waehrung:string, hash:string|null}>}
 */
export function parseBitBoxCSV(csvString) {
  if (!csvString || typeof csvString !== "string") return [];
  const lines = csvString.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Header case-insensitiv verarbeiten
  const headers = parseCsvZeile(lines[0]).map((h) => h.toLowerCase().trim());
  const col = (row, name) => {
    const idx = headers.indexOf(name.toLowerCase());
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = parseCsvZeile(line);

    // Timestamp (Time oder Date Spalte)
    const timeStr = col(row, "time") || col(row, "date");
    const ts = new Date(timeStr).getTime();
    if (!timeStr || isNaN(ts)) continue;

    // Typ-Mapping
    const typeRaw = (col(row, "type") || "").toLowerCase().trim();
    const typ = BITBOX_TYPE_MAP[typeRaw] ?? null;
    if (!typ) continue; // Unbekannte Typen (z.B. "fee") überspringen

    // Betrag + Einheit
    const amountRaw = parseFloat(col(row, "amount"));
    if (isNaN(amountRaw)) continue;
    const unit = (col(row, "unit") || "").toLowerCase().trim();
    const isSatoshi = unit === "satoshi" || unit === "sat";
    const betrag = isSatoshi ? amountRaw / 1e8 : amountRaw;
    const waehrung = isSatoshi ? "BTC" : (unit.toUpperCase() || "BTC");

    // Transaction-Hash (verschiedene Header-Varianten)
    const hash =
      col(row, "transaction id") ||
      col(row, "transaction_id") ||
      col(row, "txid") ||
      null;

    result.push({
      datum:    new Date(timeStr).toISOString(),
      typ,
      betrag,
      waehrung,
      hash:     hash || null,
    });
  }

  return result;
}
