// ─────────────────────────────────────────────────────────────────────────────
// lib/pdf-layout.js
// Gemeinsame Layout-Konstanten für eSteuerauszug PDFs
//
// Definiert den linken Content-Rand so, dass der CODE128C Seitenbarcode
// (BARCODE_MARGIN + BARCODE_W ≈ 65pt) nicht mit dem Seiteninhalt überlappt.
// ─────────────────────────────────────────────────────────────────────────────

/** Barcode-Breite (pt) ≈ 20mm – muss mit SEITENBARCODE_WIDTH in pdf-seitenbarcode.js übereinstimmen */
export const BARCODE_W      = 57;

/** Abstand des Barcodes vom linken Seitenrand (pt) */
export const BARCODE_MARGIN = 8;

/**
 * Linker Content-Rand (pt): nach Barcode-Bereich + 8pt Sicherheitsabstand.
 * BARCODE_MARGIN(8) + BARCODE_W(57) + 8 = 73pt ≈ 26mm
 * Alle Text-/Tabellen-Elemente im eSteuerauszug starten frühestens hier.
 */
export const CONTENT_LEFT   = BARCODE_MARGIN + BARCODE_W + 8; // 73pt
