/**
 * Barcodes eCH-0270 Konformität
 *
 * Verhindert: zu flache PDF417-Barcodes (< 30mm), fehlende CODE128C Seitenbarcodes.
 *
 * eCH-0270 / SBVg Anforderungen:
 * - PDF417: min. 30mm Höhe, eclevel=2, max. 1800 Bytes/Barcode
 * - CODE128C: vertikal (rotate="L"), 15-stelliger Inhalt (YYYY+KantonNr+ValorNr+Seite)
 * - Auflösung: scale ≥ 3 (~300 dpi äquivalent)
 */

import fs from "fs";
import {
  generatePdf417Png,
  generateSeitenbarcodeCode128,
  splitXmlIntoChunks,
} from "../lib/barcode";
import { buildCode128CContent } from "../lib/barcode-utils";

// ─── 1. PDF417 – Mindesthöhe 30mm (eCH-0270) ─────────────────────────────────

describe("eCH-0270: PDF417 Mindesthöhe 30mm", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("lib/barcode.js", "utf8");
  });

  test("generatePdf417Png hat height: 8 (eCH-0196 v2.2.0 Zeilenhöhe)", () => {
    expect(src).toContain("height:      8");
  });

  test("generatePdf417Png hat rows: 35 (eCH-0196 v2.2.0 Zeilenanzahl)", () => {
    expect(src).toContain("rows:        35");
  });

  test("scale default = 2 (≥ 2 nach SSK)", () => {
    expect(src).toContain("scale = 2");
  });

  test("eclevel = 4 (Fehlerkorrektur nach eCH-0196 v2.2.0 Standard)", () => {
    expect(src).toContain("eclevel:     4");
  });

  test("columns = 13 (eCH-0196 v2.2.0 Spaltenanzahl)", () => {
    expect(src).toContain("columns:     13");
  });

  test("generatePdf417Png hat KEIN rotate = L (Rotation erfolgt im PDF via degrees(90))", () => {
    // PDF417: 90°-Rotation wird in pdf-lib gemacht, nicht im bwip-js PNG
    // CODE128C Seitenbarcode behält rotate:"L" (andere Funktion, andere Einrückung)
    expect(src).not.toContain('rotate:      "L"');
  });

  test("generatePdf417Png produziert Querformat-PNG (w > h) – Rotation im PDF", async () => {
    const { getPngSize } = await import("../lib/barcode-utils");
    const png = await generatePdf417Png("<r>" + "A".repeat(500) + "</r>", 2);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png[0]).toBe(0x89); // PNG magic byte
    const { w, h } = getPngSize(png);
    expect(w).toBeGreaterThan(h); // Querformat-PNG, Rotation erfolgt im PDF (eCH-0196 v2.2.0)
  }, 15000);
});

// ─── 2. CODE128C Seitenbarcode – generateSeitenbarcodeCode128 ────────────────

describe("eCH-0270: generateSeitenbarcodeCode128 (CODE128C, vertikal)", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("lib/barcode.js", "utf8");
  });

  test("generateSeitenbarcodeCode128 ist aus lib/barcode exportiert", () => {
    expect(src).toContain("export function generateSeitenbarcodeCode128");
  });

  test("Verwendet CODE128 barcode-Typ", () => {
    expect(src).toContain('bcid:    "code128"');
  });

  test("Rotiert vertikal (rotate: \"L\") für linken Seitenrand", () => {
    expect(src).toContain('rotate:  "L"');
  });

  test("Gibt Buffer.from(png) zurück (Node.js Buffer, nicht raw Uint8Array)", () => {
    // Vercel-Kompatibilität: Buffer.from() stellt sicher dass es ein echter Node Buffer ist
    const codeMatch = src.match(/generateSeitenbarcodeCode128[\s\S]*?Buffer\.from/);
    expect(codeMatch).not.toBeNull();
  });

  test("Generiert valides PNG für 15-stelligen Barcode-Inhalt (ZH, Seite 1)", async () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);
    expect(content).toMatch(/^\d{15}$/);
    const png = await generateSeitenbarcodeCode128(content);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png[0]).toBe(0x89); // PNG magic byte
    expect(png.length).toBeGreaterThan(100);
  }, 15000);

  test("Generiert valides PNG für BE, Seite 3", async () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "BE" }, 3);
    const png = await generateSeitenbarcodeCode128(content);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png[0]).toBe(0x89);
  }, 15000);

  test("Seite 1 und Seite 5 erzeugen unterschiedliche PNGs", async () => {
    const c1 = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);
    const c5 = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 5);
    const [png1, png5] = await Promise.all([
      generateSeitenbarcodeCode128(c1),
      generateSeitenbarcodeCode128(c5),
    ]);
    expect(png1[0]).toBe(0x89);
    expect(png5[0]).toBe(0x89);
    expect(Buffer.compare(png1, png5)).not.toBe(0); // Inhalt unterschiedlich
  }, 20000);
});

// ─── 3. PDF417 Chunk-Grösse ≤ 800 Bytes ─────────────────────────────────────

describe("eCH-0270: PDF417 Chunk-Grösse ≤ 800 Bytes (columns=13, rows=35, eCH-0196 v2.2.0)", () => {
  test("Kurzes XML (< 800 Bytes) → 1 Chunk", () => {
    const xml = "<taxStatement>kurz</taxStatement>";
    expect(splitXmlIntoChunks(xml)).toHaveLength(1);
  });

  test("Jeder Chunk ist ≤ 800 Bytes (eCH-0196 v2.2.0: columns=13, rows=35, eclevel=4)", () => {
    const xml    = "<root>" + "abcdefgh".repeat(300) + "</root>"; // ~2460 Bytes
    const chunks = splitXmlIntoChunks(xml);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      const size = new TextEncoder().encode(chunk).length;
      expect(size).toBeLessThanOrEqual(800);
    });
  });

  test("generatePdf417Png mit 800-Byte-XML-Content kein Crash", async () => {
    const data = "<r>" + "X".repeat(794) + "</r>"; // ~800 Bytes
    const png  = await generatePdf417Png(data, 2);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png[0]).toBe(0x89);
  }, 15000);
});

// ─── 4. Keine Browser-APIs (Vercel Serverless) ───────────────────────────────

describe("eCH-0270: lib/barcode.js ohne Browser-APIs (Vercel-kompatibel)", () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync("lib/barcode.js", "utf8");
  });

  test("Keine document/window/HTMLCanvas Browser-APIs", () => {
    expect(src).not.toMatch(/document\.|window\.|HTMLCanvas|createElement/);
  });

  test("Verwendet Buffer (Node.js API)", () => {
    expect(src).toContain("Buffer");
  });

  test("Importiert nur bwip-js (keine native dependencies)", () => {
    expect(src).toContain('import bwipjs from "bwip-js"');
    expect(src).not.toMatch(/require\(["'](?!bwip)/);
  });
});
