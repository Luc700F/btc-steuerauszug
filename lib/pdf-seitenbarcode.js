// ─────────────────────────────────────────────────────────────────────────────
// lib/pdf-seitenbarcode.js
// Zeichnet einen CODE128C Seitenbarcode auf eine pdf-lib Seite.
//
// Keine externen Abhängigkeiten ausser pdf-lib – kein bwip-js.
// Barcode oben links, horizontal bars gestapelt von oben nach unten.
// ─────────────────────────────────────────────────────────────────────────────

import { rgb } from "pdf-lib";
import { encodeCode128C, buildSeitenbarcodeData } from "./code128c.js";

/** Abstand vom linken Seitenrand (pt) */
export const SEITENBARCODE_LEFT  = 8;

/** Barcode-Breite (pt) ≈ 20mm */
export const SEITENBARCODE_WIDTH = 57;

const BAR_HEIGHT   = 142;  // pt ≈ 50mm
const MARGIN_TOP   = 10;   // Abstand vom oberen Rand

/**
 * Zeichnet einen CODE128C Seitenbarcode auf eine pdf-lib Seite.
 *
 * Position: oben links (SEITENBARCODE_LEFT, pageHeight - MARGIN_TOP).
 * Balken werden als schwarze Rechtecke von oben nach unten gezeichnet.
 *
 * @param {import('pdf-lib').PDFPage} page            - pdf-lib Seite
 * @param {import('pdf-lib').PDFFont|null} font        - Helvetica-Font für Klartext (optional)
 * @param {Object} opts
 * @param {string|number} opts.valorennummer           - ESTV Valorennummer
 * @param {number}        opts.jahr                   - Steuerjahr
 * @param {number}        opts.seite                  - Aktuelle Seitennummer
 * @param {number}        opts.gesamtseiten            - Gesamtanzahl Seiten
 */
export function drawSeitenbarcode(page, font, { valorennummer, jahr, seite, gesamtseiten }) {
  const { height } = page.getSize();
  const data = buildSeitenbarcodeData(valorennummer, jahr, seite, gesamtseiten);
  const bits = encodeCode128C(data);

  const moduleH = BAR_HEIGHT / bits.length;
  const topY    = height - MARGIN_TOP;

  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === "1") {
      page.drawRectangle({
        x:      SEITENBARCODE_LEFT,
        y:      topY - (i + 1) * moduleH,
        width:  SEITENBARCODE_WIDTH,
        height: moduleH + 0.1,  // +0.1 verhindert Lücken durch Rundungsfehler
        color:  rgb(0, 0, 0),
      });
    }
  }

  // Klartext direkt unter dem Barcode – immer absolut von der Oberkante der Seite berechnet,
  // unabhängig von Seiteninhalt oder Content-Bereich.
  if (font) {
    const fontSize  = 5.5;
    const textWidth = font.widthOfTextAtSize(data, fontSize);
    // labelY: fester Abstand von oben (MARGIN_TOP + BAR_HEIGHT + 8pt Luft)
    const labelY = height - MARGIN_TOP - BAR_HEIGHT - 8;
    page.drawText(data, {
      x:     SEITENBARCODE_LEFT + (SEITENBARCODE_WIDTH - textWidth) / 2,
      y:     labelY,
      size:  fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }
}
