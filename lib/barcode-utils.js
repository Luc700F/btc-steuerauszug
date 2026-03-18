// ─────────────────────────────────────────────────────────────────────────────
// lib/barcode-utils.js
// Zweck: Barcode-Hilfsfunktionen für eCH-0196 eSteuerauszug
// Exports:
//   getKantonNummer(canton)
//   buildCode128CContent(steuerDaten, pageNumber)
//   getPngSize(buffer)
//   splitXmlIntoSegments(xmlString, MAX_CHARS)
// ─────────────────────────────────────────────────────────────────────────────

// Offizielle Kantonsnummern (BFS-Codes, 2-stellig mit führender Null)
const KANTONE = {
  ZH: "01", BE: "02", LU: "03", UR: "04", SZ: "05", OW: "06",
  NW: "07", GL: "08", ZG: "09", FR: "10", SO: "11", BS: "12",
  BL: "13", SH: "14", AR: "15", AI: "16", SG: "17", GR: "18",
  AG: "19", TG: "20", TI: "21", VD: "22", VS: "23", NE: "24",
  GE: "25", JU: "26",
};

/**
 * Gibt die 2-stellige Kantonsnummer zurück (BFS-Code).
 * Unbekannte Kantone → "01" (ZH als Fallback).
 *
 * @param {string} canton - Kantonskürzel, z.B. 'ZH', 'BE', 'AG'
 * @returns {string} 2-stellige Nummer, z.B. '01', '19'
 */
export function getKantonNummer(canton) {
  return KANTONE[(canton || "").toUpperCase()] ?? "01";
}

/**
 * Erstellt den CODE128C Barcode-Inhalt für eine Seite des eSteuerauszugs.
 *
 * Format: {taxYear(4)}{kantonNr(2)}{valorennummer(7)}{seitenNr(2)} = 15 Zeichen
 * Beispiel: "202501384192701" (2025, ZH=01, Valor=3841927, Seite=01)
 *
 * @param {{ taxYear: number, canton: string }} steuerDaten
 * @param {number} pageNumber - Seitennummer (1-basiert)
 * @returns {string} 15-stelliger numerischer Barcode-Inhalt
 */
export function buildCode128CContent(steuerDaten, pageNumber) {
  const { taxYear, canton } = steuerDaten;
  const kantonNr = getKantonNummer(canton);
  const seiteNr  = String(Math.max(1, Math.floor(pageNumber))).padStart(2, "0");
  return `${taxYear}${kantonNr}3841927${seiteNr}`;
}

/**
 * Liest die Bildgrösse aus dem PNG-IHDR-Chunk.
 * IHDR liegt immer an Byte-Offset 16 (Breite, 4 Bytes big-endian)
 * und Byte-Offset 20 (Höhe, 4 Bytes big-endian).
 *
 * @param {Buffer} buffer - PNG-Datei als Node.js Buffer
 * @returns {{ w: number, h: number }} Breite und Höhe in Pixeln
 */
export function getPngSize(buffer) {
  return {
    w: buffer.readUInt32BE(16),
    h: buffer.readUInt32BE(20),
  };
}

/**
 * Teilt XML zeichenbasiert in Segmente von max. MAX_CHARS Zeichen auf.
 * Leerer String ergibt genau 1 leeres Segment.
 *
 * @param {string} xmlString - Rohes XML
 * @param {number} MAX_CHARS - Maximale Zeichenanzahl pro Segment (Standard: 1000)
 * @returns {string[]} Array von Segmenten
 */
export function splitXmlIntoSegments(xmlString, MAX_CHARS = 1000) {
  if (xmlString.length === 0) return [""];
  const segs = [];
  let offset = 0;
  while (offset < xmlString.length) {
    segs.push(xmlString.slice(offset, offset + MAX_CHARS));
    offset += MAX_CHARS;
  }
  return segs;
}
