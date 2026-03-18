// ─────────────────────────────────────────────────────────────────────────────
// lib/barcode.js
// Zweck: PDF417 Barcode-Generierung für eSteuerauszug nach eCH-0196 v2.2.0
//
// Standard: eCH-0196 v2.2.0 technische Wegleitung (Barcode-Generierung)
// - Barcode-Typ:        PDF417, Querformat-PNG → 90°-Rotation im PDF
// - Max. Bytes/Barcode: 800 (UTF-8, kein Base64/Deflate – Rohtext!)
// - Fehlerkorrektur:    Level 4 (eCH-0196 Standard)
// - Spalten:            13, Zeilen: min. 35 (290×35 Pixelgitter)
// - Mindestauflösung:   scale ≥ 2 (~200 dpi äquivalent)
// - Inhalt:             Rohes XML (kein Komprimieren/Encodieren)
// - Rotation:           90° über pdf-lib degrees(90) – nicht im PNG
//
// Gilt für BTC, ETH (ERC-20), SOL – identische Funktion
// ─────────────────────────────────────────────────────────────────────────────

import bwipjs from "bwip-js";

// Mit columns=13, rows=35, eclevel=4 und 800 Bytes XML-Content:
// → Querformat-PNG 290×105px (scale=1), physisch 79pt×345pt auf Seite nach 90°-Rotation.
// Puffer für XML-Sonderzeichen (", =, /, :) die Byte-Modus erzwingen.
const MAX_BYTES_PER_BARCODE = 800;

/**
 * XML in Chunks von max. MAX_BYTES_PER_BARCODE Bytes aufteilen.
 * Schneidet NIE mitten in ein UTF-8 Multibyte-Zeichen.
 *
 * @param {string} xmlString - Rohes XML (z.B. eCH-0196 v2.2.0)
 * @returns {string[]} Array von XML-Chunks
 */
export function splitXmlIntoChunks(xmlString) {
  const encoder = new TextEncoder();
  const bytes   = encoder.encode(xmlString);
  const chunks  = [];
  let   offset  = 0;

  while (offset < bytes.length) {
    // Chunk-Grenze bestimmen
    let end = Math.min(offset + MAX_BYTES_PER_BARCODE, bytes.length);

    // Sicherstellen dass wir nicht mitten in einem Multibyte-Zeichen schneiden
    // Continuation bytes in UTF-8 haben das Muster 10xxxxxx (0x80–0xBF)
    while (end < bytes.length && (bytes[end] & 0xC0) === 0x80) {
      end--;
    }

    chunks.push(new TextDecoder().decode(bytes.slice(offset, end)));
    offset = end;
  }

  console.log(`[barcode] XML ${bytes.length} Bytes → ${chunks.length} Chunk(s)`);
  return chunks;
}

/**
 * Einen PDF417 Barcode als PNG Buffer generieren (Querformat).
 * PNG ist Querformat (w > h); Rotation 90° erfolgt via degrees(90) in pdf-lib.
 * Physische Grösse auf Seite nach Rotation: 79pt breit × 345pt hoch.
 *
 * @param {string} data  - Inhalt (XML-Chunk oder beliebiger Text)
 * @param {number} scale - Pixel pro Modul (min. 2, Standard 2)
 * @returns {Promise<Buffer>} PNG Buffer (Querformat: w > h, Rotation im PDF)
 */
export function generatePdf417Png(data, scale = 2) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid:        "pdf417",  // Barcode-Typ: PDF417 (eCH-0196 v2.2.0)
        text:        data,      // Rohinhalt (kein Encoding)
        scale,                  // Pixel pro Modul (2 ≈ 200dpi bei 96dpi-Basis)
        height:      8,         // Zeilenhöhe in bwip-js Units
        includetext: false,     // Kein Klartext unter dem Barcode
        eclevel:     4,         // Fehlerkorrektur Level 4 (eCH-0196 v2.2.0 Standard)
        columns:     13,        // Spaltenanzahl nach technischer Wegleitung
        rows:        35,        // Zeilenanzahl (Minimum; bwip-js erhöht bei Bedarf)
        padding:     2,         // Mindest-Weissraum rund um Barcode
      },
      (err, png) => (err ? reject(new Error(`PDF417: ${err.message}`)) : resolve(Buffer.from(png)))
    );
  });
}

/**
 * Alle Barcodes für ein vollständiges XML generieren.
 * Teilt das XML in 1800-Byte-Chunks auf und generiert pro Chunk einen PDF417.
 *
 * @param {string} xmlString - Vollständiges eCH-0196 XML
 * @returns {Promise<Array<{png: Buffer, label: string, chunkIndex: number, totalChunks: number, byteSize: number}>>}
 */
export async function generateAllBarcodes(xmlString) {
  const chunks = splitXmlIntoChunks(xmlString);
  const total  = chunks.length;
  const result = [];

  for (let i = 0; i < chunks.length; i++) {
    const byteSize = new TextEncoder().encode(chunks[i]).length;
    const png      = await generatePdf417Png(chunks[i], 4);

    result.push({
      png,
      label:       `${i + 1}/${total}`,
      chunkIndex:  i,
      totalChunks: total,
      byteSize,
    });

    console.log(
      `[barcode] ${i + 1}/${total}: ${byteSize} Bytes → PNG ${png.length} Bytes`
    );
  }

  return result;
}

/**
 * CODE128C Seitenbarcode als PNG Buffer generieren.
 * Vertikal rotiert, für den linken Rand jeder PDF-Seite (eCH-0270).
 *
 * Inhalt: 15-stellige Ziffernfolge aus buildCode128CContent():
 *   YYYY(4) + KantonNr(2) + Valorennummer(7) + Seite(2)
 *
 * @param {string} content - 15-stelliger numerischer Barcode-Inhalt
 * @returns {Promise<Buffer>} PNG Buffer (rotiert 90° gegen Uhrzeigersinn)
 */
export function generateSeitenbarcodeCode128(content) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid:    "code128",  // CODE128 (auto-selects 128C für rein numerischen Inhalt)
        text:    content,    // 15-stellige Ziffernfolge
        scale:   1,          // Pixel pro Modul
        height:  8,          // Barcode-Höhe (nach Rotation = Breite im PDF)
        rotate:  "L",        // Links-Rotation → vertikaler Barcode
        padding: 2,          // Mindest-Weissraum
      },
      (err, png) => (err ? reject(new Error(`CODE128: ${err.message}`)) : resolve(Buffer.from(png)))
    );
  });
}
