// ─────────────────────────────────────────────────────────────────────────────
// lib/barcode.js
// Zweck: PDF417 Barcode-Generierung für eSteuerauszug nach eCH-0270
//
// Standard: SBVg / eCH-0270
// - Barcode-Typ:        PDF417
// - Max. Bytes/Barcode: 1800 (UTF-8, kein Base64/Deflate – Rohtext!)
// - Fehlerkorrektur:    Level 2
// - Mindestauflösung:   scale ≥ 3 (~300 dpi äquivalent)
// - Inhalt:             Rohes XML (kein Komprimieren/Encodieren)
//
// Gilt für BTC, ETH (ERC-20), SOL – identische Funktion
// ─────────────────────────────────────────────────────────────────────────────

import bwipjs from "bwip-js";

const MAX_BYTES_PER_BARCODE = 1800; // eCH-0270 Limit pro Barcode (UTF-8 Bytes)

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
 * Einen PDF417 Barcode als PNG Buffer generieren.
 *
 * @param {string} data  - Inhalt (XML-Chunk oder beliebiger Text)
 * @param {number} scale - Pixel pro Modul (min. 3, empfohlen 4 für ~300dpi)
 * @returns {Promise<Buffer>} PNG Buffer
 */
export function generatePdf417Png(data, scale = 4) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(
      {
        bcid:        "pdf417",  // Barcode-Typ: PDF417 (eCH-0270)
        text:        data,      // Rohinhalt (kein Encoding)
        scale,                  // Pixel pro Modul (4 ≈ 300dpi bei 96dpi-Basis)
        height:      20,        // Barcode-Höhe in mm
        includetext: false,     // Kein Klartext unter dem Barcode
        eclevel:     2,         // Fehlerkorrektur Level 2 (eCH-0270 Standard)
        columns:     12,        // Spaltenanzahl (SBVg Standard)
        padding:     5,         // Mindest-Weissraum rund um Barcode
      },
      (err, png) => (err ? reject(new Error(`PDF417: ${err.message}`)) : resolve(png))
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
