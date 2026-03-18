// ─────────────────────────────────────────────────────────────────────────────
// lib/barcode-layout.js
// Barcode-Layout Konstanten und Hilfsfunktionen nach SSK/Referenzbank-Standard
//
// Referenz: Schweizerische Steuerkonferenz (SSK) eCH-0270 Referenzlayout
// - Seite A4 Querformat: 842 × 595 pt
// - 4 PDF417-Barcodes nebeneinander, gleichmässig verteilt
// - Seitenbarcode (CODE128C) links, schmal (≤ 12pt), volle Seitenhöhe
//
// Gilt für BTC, ERC-20 und SOL – identisches Layout für alle Blockchains
// ─────────────────────────────────────────────────────────────────────────────

// ─── Seitenabmessungen (A4 Querformat) ───────────────────────────────────────

export const PAGE_WIDTH  = 842;  // pt
export const PAGE_HEIGHT = 595;  // pt

// ─── Seitenbarcode (CODE128C, links, vertikal) ────────────────────────────────

export const SIDE_BARCODE_WIDTH  = 10;  // pt – schmal wie Referenzbank (≤ 12pt)
export const SIDE_BARCODE_MARGIN = 4;   // pt – Abstand zum linken Seitenrand

// ─── Nutzbereich für PDF417-Barcodes ─────────────────────────────────────────

export const CONTENT_LEFT  = SIDE_BARCODE_WIDTH + SIDE_BARCODE_MARGIN + 10; // 24pt
export const CONTENT_RIGHT = PAGE_WIDTH - 20;                                // 822pt
export const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;                  // 798pt

// ─── PDF417-Barcode-Gitter: 4 nebeneinander (SSK-Standard) ───────────────────

export const BARCODES_PER_ROW = 4;
export const BARCODE_GAP      = 10;  // pt – Abstand zwischen Barcodes

// Breite: gleichmässig über Nutzbreite verteilt
// (798 - 3×10) / 4 = 768 / 4 = 192pt
export const BARCODE_WIDTH = Math.floor(
  (CONTENT_WIDTH - (BARCODES_PER_ROW - 1) * BARCODE_GAP) / BARCODES_PER_ROW
);

export const BARCODE_HEIGHT = 160;  // pt – Höhe pro Barcode
export const BARCODE_TOP    = 120;  // pt von Seitenoberseite (nach Header)
export const LABEL_OFFSET   = 14;   // pt – Abstand Label unter Barcode

// ─── XML-Segmentierung ────────────────────────────────────────────────────────

export const MAX_CHARS_PER_SEGMENT = 800;  // Zeichen pro PDF417-Segment (eCH-0196 v2.2.0)

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

/**
 * X-Position (linke Kante) des Barcodes an Index i.
 * col = i % BARCODES_PER_ROW → gleichmässig über Nutzbreite verteilt.
 *
 * @param {number} index - Barcode-Index (0-basiert)
 * @returns {number} X-Position in pt (pdf-lib Koordinaten)
 */
export function getBarcodeXPosition(index) {
  const col = index % BARCODES_PER_ROW;
  return CONTENT_LEFT + col * (BARCODE_WIDTH + BARCODE_GAP);
}

/**
 * Y-Position (untere Kante) des Barcodes an Index i.
 * pdf-lib: y=0 ist untere Seitenkante.
 * BARCODE_TOP: Abstand von Seitenoberseite bis Oberkante der ersten Reihe.
 *
 * @param {number} index - Barcode-Index (0-basiert)
 * @returns {number} Y-Position in pt (pdf-lib Koordinaten, y=0 unten)
 */
export function getBarcodeYPosition(index) {
  const row      = Math.floor(index / BARCODES_PER_ROW);
  const yFromTop = BARCODE_TOP + row * (BARCODE_HEIGHT + LABEL_OFFSET + 20);
  return PAGE_HEIGHT - yFromTop - BARCODE_HEIGHT;
}

/**
 * XML in Segmente aufteilen (zeichenbasiert, max MAX_CHARS_PER_SEGMENT).
 * Leerer String oder null ergibt genau 1 leeres Segment.
 * Für präzises Byte-Splitting (UTF-8-safe) → lib/barcode.js splitXmlIntoChunks.
 *
 * @param {string} xmlString
 * @returns {string[]} Array von Segmenten
 */
export function splitXmlIntoSegments(xmlString) {
  if (!xmlString || xmlString.length === 0) return [""];
  const segments = [];
  let offset = 0;
  while (offset < xmlString.length) {
    segments.push(xmlString.slice(offset, offset + MAX_CHARS_PER_SEGMENT));
    offset += MAX_CHARS_PER_SEGMENT;
  }
  return segments;
}

// ─── Kurzaliase (für Tests und direkten Import) ───────────────────────────────

export const N_BC        = BARCODES_PER_ROW;               // 4
export const SB_W        = SIDE_BARCODE_WIDTH;             // 10 pt
export const BC_W        = BARCODE_WIDTH;                  // 192 pt
export const BC_H_MIN    = Math.round(BARCODE_WIDTH * 2.0); // 384 pt (Hochformat-Richtwert)
export const SB_GAP      = SIDE_BARCODE_MARGIN;            // 4 pt
export const MARGIN_LEFT = CONTENT_LEFT;                   // 24 pt
export const CONTENT_W   = CONTENT_WIDTH;                  // 798 pt
export const LABEL_H     = LABEL_OFFSET;                   // 14 pt

// ─── eCH-0196 v2.2.0 technische Wegleitung – Spezifikationskonstanten ─────────

const MM_TO_PT = 2.8346;  // Umrechnungsfaktor mm → pt

// PDF417 Barcode-Parameter (eCH-0196 v2.2.0 Kapitel Barcode-Generierung)
export const PDF417_COLUMNS   = 13;    // Spaltenanzahl
export const PDF417_ROWS      = 35;    // Zeilenanzahl (Minimum; bwip-js erhöht bei Bedarf)
export const PDF417_EC        = 4;     // Fehlerkorrektur-Level
export const PDF417_PER_SHEET = 6;     // Max. PDF417-Barcodes pro Seite (1 Reihe × 6)

// PDF417 Pixelgitter (bei scale=1, vor Skalierung)
export const PDF417_PX_W      = 290;   // Pixel breit (bei scale=1)
export const PDF417_PX_H      = 35;    // Zeilen (bei scale=1, 3px/Zeile = 105px Bildhöhe)

// Element-Abmessungen nach technischer Wegleitung (Druckgrösse)
export const PDF417_EL_W_CM   = 0.042; // cm pro Modul (Spaltenbreite)
export const PDF417_EL_H_CM   = 0.08;  // cm pro Zeile (Zeilenhöhe)

// Physische Abmessungen auf der PDF-Seite (nach 90°-Rotation im PDF)
// Barcode-PNG ist Querformat (290×105px), wird 90° CCW im PDF rotiert → Hochformat
export const BC_ON_PAGE_W_PT  = Math.round(PDF417_PX_H * PDF417_EL_H_CM * MM_TO_PT * 10); // ≈ 79pt
export const BC_ON_PAGE_H_PT  = Math.round(PDF417_PX_W * PDF417_EL_W_CM * MM_TO_PT * 10); // ≈ 345pt

// Barcode-Seite (A4 Querformat) – KRITISCH: Barcode-Blätter im Querformat nach eCH-0196 v2.2.0
export const BC_PAGE_W        = 842;   // pt (A4 Landscape Breite)
export const BC_PAGE_H        = 595;   // pt (A4 Landscape Höhe)

// Portrait-Seite (Kompatibilität)
export const PAGE_W_PORTRAIT  = 595;   // pt
export const PAGE_H_PORTRAIT  = 842;   // pt

// Seitenbarcode (CODE128C) nach eCH-0196 v2.2.0 technischer Wegleitung
export const SB_W_SPEC_PT      = Math.round(12 * MM_TO_PT); // ≈ 34pt (12mm)
export const SB_MARGIN_SPEC_PT = Math.round(5 * MM_TO_PT);  // ≈ 14pt (5mm)

/**
 * Seitenbarcode-Inhalt nach eCH-0196 v2.2.0 technischer Wegleitung (16-stellig).
 * Format: FFVVOOOOOPPPBOL
 *   FF    = 196   (Formular-Nummer)
 *   VV    = 22    (Version 2.2)
 *   OOOOO = 00000 (Organisations-Nummer)
 *   PPP   = Seitennummer (001–999)
 *   B     = 1/0   (hat 2D-Barcode; 1 = nur auf letzter Seite mit PDF417)
 *   O     = 0/1   (Orientierung: 0 = Querformat, 1 = Hochformat)
 *   L     = 4     (Leserichtung)
 *
 * Beispiel Landscape Seite 1 (kein Barcode):   "1962200000001004"
 * Beispiel Landscape letzte Seite (Barcodes):  "1962200000003104"
 *
 * @param {number}  pageNum       - Seitennummer (1-basiert)
 * @param {boolean} isBarcodePage - true = letzte Seite mit PDF417-Barcodes
 * @param {boolean} isLandscape   - true = Querformat (O=0), false = Hochformat (O=1) [default: true]
 * @returns {string} 16-stelliger numerischer Barcode-Inhalt
 */
export function getSeitenbarcodeText(pageNum, isBarcodePage, isLandscape = true) {
  const PPP = String(Math.max(1, Math.floor(pageNum))).padStart(3, "0");
  const B   = isBarcodePage ? "1" : "0";
  const O   = isLandscape   ? "0" : "1";  // Querformat=0, Hochformat=1 (eCH-0196 v2.2.0)
  return "196" + "22" + "00000" + PPP + B + O + "4";
}

// ─── Seitenbarcode Objekt (eCH-0196 v2.2.0) ──────────────────────────────────

export const SB = {
  TOTAL_H_MM:   12,
  MIN_W_MM:     38,
  MARGIN_L_MM:  5,
  MARGIN_TB_MM: 10,
  TOTAL_H_PT:   Math.round(12 * MM_TO_PT),   // ≈ 34pt
  MARGIN_L_PT:  Math.round(5 * MM_TO_PT),    // ≈ 14pt
  MARGIN_TB_PT: Math.round(10 * MM_TO_PT),   // ≈ 28pt
  /**
   * 16-stelliger Seitenbarcode-Inhalt nach eCH-0196 v2.2.0.
   * @param {number}  pageNum       - Seitennummer (1-basiert)
   * @param {boolean} isBarcodePage - true = letzte Seite mit PDF417-Barcodes
   * @param {boolean} isLandscape   - true = Querformat (O=0) [default: true]
   */
  getText(pageNum, isBarcodePage, isLandscape = true) {
    return getSeitenbarcodeText(pageNum, isBarcodePage, isLandscape);
  },
};

// ─── PDF417 Objekt (eCH-0196 v2.2.0 Spezifikation) ───────────────────────────

export const PDF417 = {
  PX_W:      290,    // Pixel breit bei scale=1
  PX_H:      35,     // Pixel hoch bei scale=1 (Zeilen)
  W_ON_PAGE: Math.round(PDF417_PX_H * PDF417_EL_H_CM * MM_TO_PT * 10),  // ≈ 79pt
  H_ON_PAGE: Math.round(PDF417_PX_W * PDF417_EL_W_CM * MM_TO_PT * 10),  // ≈ 345pt
  COLUMNS:   13,
  ROWS:      35,
  EC_LEVEL:  4,
  PER_ROW:   6,      // 6 Barcodes in einer Reihe (Landscape-Seite, eCH-0196 v2.2.0)
  GAP_PT:    8,      // pt Abstand zwischen Barcodes
  START_X:   50,     // pt linker Startpunkt (nach Seitenbarcode)
  START_Y:   80,     // pt von Seitenoberseite
};

// ─── Re-export aus barcode-utils ──────────────────────────────────────────────

export { getPngSize } from "./barcode-utils";

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Layout-Konfiguration für alle Blockchains – identisch für BTC, ETH und SOL.
 * Kein Switch/Case – keine blockchain-spezifischen Layout-Unterschiede.
 *
 * @param {string} blockchain - 'btc' | 'eth' | 'sol' (ignoriert, Layout ist identisch)
 * @returns {Object} Layout-Konfiguration
 */
export function getBarcodeLayoutConfig(blockchain) {
  return {
    barcodesPerRow: BARCODES_PER_ROW,
    barcodeWidth:   BARCODE_WIDTH,
    barcodeHeight:  BARCODE_HEIGHT,
    barcodeGap:     BARCODE_GAP,
    sideBarcode: {
      width:  SIDE_BARCODE_WIDTH,
      height: PAGE_HEIGHT,
      x:      SIDE_BARCODE_MARGIN,
      y:      0,
    },
    contentLeft:  CONTENT_LEFT,
    contentWidth: CONTENT_WIDTH,
    pageWidth:    PAGE_WIDTH,
    pageHeight:   PAGE_HEIGHT,
  };
}
