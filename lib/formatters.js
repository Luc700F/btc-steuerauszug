// ─────────────────────────────────────────────────────────────────────────────
// lib/formatters.js
// Zweck: Geteilte Formatierungsfunktionen für PDF-Export und Dashboard
// Exports: formatCHF, formatDatum, formatKrypto, kuerzeText
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formatiert einen CHF-Betrag als lokalisierten String (de-CH).
 * @param {number} betrag
 * @returns {string} z.B. "CHF 1'234.56"
 */
export const formatCHF = (betrag) =>
  new Intl.NumberFormat("de-CH", {
    style:                 "currency",
    currency:              "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(betrag || 0);

/**
 * Formatiert ein ISO-Datum als schweizer Datumsformat.
 * @param {string} datumString - ISO 8601 Datum
 * @returns {string} z.B. "31.12.2025"
 */
export const formatDatum = (datumString) =>
  new Date(datumString).toLocaleDateString("de-CH", {
    day:   "2-digit",
    month: "2-digit",
    year:  "numeric",
  });

/**
 * Formatiert eine Kryptowährungsmenge mit variabler Dezimalstellenzahl.
 * Entfernt überflüssige Nullen am Ende.
 * @param {number} betrag
 * @param {number} stellen - Dezimalstellen (Standard: 8 für BTC)
 * @returns {string} z.B. "0.00355787"
 */
export const formatKrypto = (betrag, stellen = 8) =>
  parseFloat(betrag || 0).toFixed(stellen).replace(/\.?0+$/, "") || "0";

/**
 * Kürzt Text auf maxZeichen und fügt ".." an wenn nötig.
 * @param {string} text
 * @param {number} maxZeichen
 * @returns {string}
 */
export const kuerzeText = (text, maxZeichen) =>
  !text ? "" : text.length > maxZeichen ? text.substring(0, maxZeichen - 2) + ".." : text;
