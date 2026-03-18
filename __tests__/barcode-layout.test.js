/**
 * Barcode-Layout SSK/Referenzbank-Standard
 *
 * Prüft lib/barcode-layout.js Konstanten, Positionsberechnungen und
 * XML-Segmentierung nach eCH-0270 / SSK-Referenzlayout.
 *
 * Referenz: Schweizerische Steuerkonferenz (SSK) Seite 24/27:
 *   - 4 PDF417-Barcodes nebeneinander
 *   - Seitenbarcode links ≤ 12pt breit, volle Seitenhöhe
 *   - A4 Querformat: 842 × 595 pt
 */

import {
  BARCODES_PER_ROW,
  BARCODE_WIDTH,
  BARCODE_HEIGHT,
  BARCODE_GAP,
  CONTENT_WIDTH,
  CONTENT_LEFT,
  SIDE_BARCODE_WIDTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  getBarcodeXPosition,
  getBarcodeYPosition,
  splitXmlIntoSegments,
  getBarcodeLayoutConfig,
  // Kurzaliase (neue Exporte)
  N_BC,
  SB_W,
  BC_W,
  BC_H_MIN,
  SB_GAP,
  MARGIN_LEFT,
  CONTENT_W,
  LABEL_H,
  // eCH-0196 v2.2.0 Spezifikationskonstanten
  getSeitenbarcodeText,
  PDF417_COLUMNS,
  PDF417_ROWS,
  PDF417_EC,
  PDF417_PER_SHEET,
  BC_ON_PAGE_W_PT,
  BC_ON_PAGE_H_PT,
  BC_PAGE_W,
  BC_PAGE_H,
  PAGE_W_PORTRAIT,
  PAGE_H_PORTRAIT,
  SB_W_SPEC_PT,
  SB_MARGIN_SPEC_PT,
  SB,
  PDF417,
  getPngSize,
} from "../lib/barcode-layout";

// ─── Konstanten-Tests ─────────────────────────────────────────────────────────

describe("barcode-layout: Konstanten (SSK-Standard)", () => {
  test("BARCODES_PER_ROW ist 4 (SSK-Standard)", () => {
    expect(BARCODES_PER_ROW).toBe(4);
  });

  test("Seitenbarcode-Breite ist höchstens 12pt (SSK ≤ 12pt)", () => {
    expect(SIDE_BARCODE_WIDTH).toBeLessThanOrEqual(12);
  });

  test("Seitenbarcode-Breite ist mindestens 6pt (scannbar)", () => {
    expect(SIDE_BARCODE_WIDTH).toBeGreaterThanOrEqual(6);
  });

  test("Barcode-Höhe mindestens 140pt", () => {
    expect(BARCODE_HEIGHT).toBeGreaterThanOrEqual(140);
  });

  test("4 Barcodes + 3 Lücken passen genau in CONTENT_WIDTH", () => {
    const totalWidth = 4 * BARCODE_WIDTH + 3 * BARCODE_GAP;
    expect(totalWidth).toBeLessThanOrEqual(CONTENT_WIDTH);
  });

  test("Einzelner Barcode mindestens 100pt breit", () => {
    expect(BARCODE_WIDTH).toBeGreaterThanOrEqual(100);
  });

  test("PAGE_HEIGHT = 595 pt (A4 Querformat)", () => {
    expect(PAGE_HEIGHT).toBe(595);
  });

  test("PAGE_WIDTH = 842 pt (A4 Querformat)", () => {
    expect(PAGE_WIDTH).toBe(842);
  });

  test("CONTENT_LEFT > SIDE_BARCODE_WIDTH (kein Überlapp mit Seitenbarcode)", () => {
    expect(CONTENT_LEFT).toBeGreaterThan(SIDE_BARCODE_WIDTH);
  });
});

// ─── Positions-Tests ─────────────────────────────────────────────────────────

describe("barcode-layout: getBarcodeXPosition", () => {
  test("Barcode 0 (col 0) startet an CONTENT_LEFT", () => {
    expect(getBarcodeXPosition(0)).toBe(CONTENT_LEFT);
  });

  test("Barcode 1 (col 1) hat korrekten X-Offset", () => {
    const x0 = getBarcodeXPosition(0);
    const x1 = getBarcodeXPosition(1);
    expect(x1).toBe(x0 + BARCODE_WIDTH + BARCODE_GAP);
  });

  test("Barcode 2 (col 2) X-Position korrekt", () => {
    const x0 = getBarcodeXPosition(0);
    const x2 = getBarcodeXPosition(2);
    expect(x2).toBe(x0 + 2 * (BARCODE_WIDTH + BARCODE_GAP));
  });

  test("Barcode 3 (col 3, letzte Spalte) X-Position korrekt", () => {
    const x0 = getBarcodeXPosition(0);
    const x3 = getBarcodeXPosition(3);
    expect(x3).toBe(x0 + 3 * (BARCODE_WIDTH + BARCODE_GAP));
  });

  test("Barcode 4 (zweite Reihe, col 0) hat gleichen X wie Barcode 0", () => {
    expect(getBarcodeXPosition(4)).toBe(getBarcodeXPosition(0));
  });

  test("Barcode 5 hat gleichen X wie Barcode 1 (zweite Reihe wraps)", () => {
    expect(getBarcodeXPosition(5)).toBe(getBarcodeXPosition(1));
  });

  test("Letzter Barcode in Reihe bleibt innerhalb PAGE_WIDTH", () => {
    const x3 = getBarcodeXPosition(3);
    expect(x3 + BARCODE_WIDTH).toBeLessThanOrEqual(PAGE_WIDTH);
  });
});

describe("barcode-layout: getBarcodeYPosition", () => {
  test("Barcode 4 (zweite Reihe) ist tiefer als Barcode 0 (pdf-lib: kleineres y = tiefer)", () => {
    const y0 = getBarcodeYPosition(0);
    const y4 = getBarcodeYPosition(4);
    expect(y4).toBeLessThan(y0);
  });

  test("Alle 8 Barcodes (2 Reihen) bleiben innerhalb der Seitenhöhe", () => {
    for (let i = 0; i < 8; i++) {
      const y = getBarcodeYPosition(i);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + BARCODE_HEIGHT).toBeLessThanOrEqual(PAGE_HEIGHT);
    }
  });

  test("Reihe 0 und Reihe 1 haben unterschiedliche Y-Positionen", () => {
    expect(getBarcodeYPosition(0)).not.toBe(getBarcodeYPosition(4));
  });

  test("Barcodes derselben Reihe haben identische Y-Position", () => {
    const y0 = getBarcodeYPosition(0);
    expect(getBarcodeYPosition(1)).toBe(y0);
    expect(getBarcodeYPosition(2)).toBe(y0);
    expect(getBarcodeYPosition(3)).toBe(y0);
  });
});

// ─── XML-Segmentierung ───────────────────────────────────────────────────────

describe("barcode-layout: splitXmlIntoSegments", () => {
  test("Kurzes XML ergibt genau 1 Segment", () => {
    const xml  = "<test>kurz</test>";
    const segs = splitXmlIntoSegments(xml);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toBe(xml);
  });

  test("Genau 800 Zeichen ergibt 1 Segment (eCH-0196 v2.2.0 Limit)", () => {
    const xml  = "A".repeat(800);
    const segs = splitXmlIntoSegments(xml);
    expect(segs).toHaveLength(1);
  });

  test("801 Zeichen ergibt 2 Segmente", () => {
    const xml  = "A".repeat(801);
    const segs = splitXmlIntoSegments(xml);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toHaveLength(800);
    expect(segs[1]).toHaveLength(1);
  });

  test("2400 Zeichen ergibt 3 Segmente", () => {
    const xml  = "X".repeat(2400);
    const segs = splitXmlIntoSegments(xml);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toHaveLength(800);
    expect(segs[1]).toHaveLength(800);
    expect(segs[2]).toHaveLength(800);
  });

  test("Segmente zusammengesetzt ergeben originales XML (kein Datenverlust)", () => {
    const xml = "X".repeat(5000);
    expect(splitXmlIntoSegments(xml).join("")).toBe(xml);
  });

  test("Leeres XML ergibt 1 leeres Segment", () => {
    const segs = splitXmlIntoSegments("");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toBe("");
  });
});

// ─── BTC / ERC-20 / SOL Konsistenz ──────────────────────────────────────────

describe("barcode-layout: getBarcodeLayoutConfig – Multi-Chain Konsistenz", () => {
  test("BTC Layout-Config ist identisch mit ETH Layout-Config", () => {
    const btc = getBarcodeLayoutConfig("btc");
    const eth = getBarcodeLayoutConfig("eth");
    expect(btc).toEqual(eth);
  });

  test("BTC Layout-Config ist identisch mit SOL Layout-Config", () => {
    const btc = getBarcodeLayoutConfig("btc");
    const sol = getBarcodeLayoutConfig("sol");
    expect(btc).toEqual(sol);
  });

  test("Layout-Config enthält alle Pflichtfelder", () => {
    const config = getBarcodeLayoutConfig("btc");
    expect(config).toHaveProperty("barcodesPerRow");
    expect(config).toHaveProperty("barcodeWidth");
    expect(config).toHaveProperty("barcodeHeight");
    expect(config).toHaveProperty("barcodeGap");
    expect(config).toHaveProperty("sideBarcode");
    expect(config).toHaveProperty("contentLeft");
    expect(config).toHaveProperty("contentWidth");
    expect(config).toHaveProperty("pageWidth");
    expect(config).toHaveProperty("pageHeight");
  });

  test("barcodesPerRow in Config ist 4", () => {
    expect(getBarcodeLayoutConfig("btc").barcodesPerRow).toBe(4);
  });

  test("sideBarcode in Config hat korrekte Werte", () => {
    const { sideBarcode } = getBarcodeLayoutConfig("btc");
    expect(sideBarcode.width).toBe(SIDE_BARCODE_WIDTH);
    expect(sideBarcode.height).toBe(PAGE_HEIGHT);
    expect(sideBarcode.y).toBe(0);
  });
});

// ─── Konsistenz: route.js verwendet barcode-layout Konstanten ─────────────────

describe("barcode-layout: steuerauszug/route.js importiert barcode-layout", () => {
  let src;
  beforeAll(() => {
    const fs = require("fs");
    src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
  });

  test("route.js importiert barcode-layout", () => {
    expect(src).toContain("barcode-layout");
  });

  test("route.js importiert BC_ON_PAGE_W_PT aus barcode-layout (PDF417-Barcodes)", () => {
    expect(src).toContain("BC_ON_PAGE_W_PT");
  });

  test("route.js enthält kein altes ZELLE_W", () => {
    expect(src).not.toContain("ZELLE_W");
  });

  test("route.js verwendet CONTENT_LEFT aus pdf-layout (Content beginnt nach Barcode)", () => {
    expect(src).toContain("CONTENT_LEFT");
  });

  test("route.js verwendet drawSeitenbarcode statt bwip-js barcodeImg", () => {
    expect(src).toContain("drawSeitenbarcode");
    expect(src).not.toContain("drawImage(barcodeImg");
  });

  test("route.js verwendet barcodeValorNr statt allPageBarcodes", () => {
    expect(src).toContain("barcodeValorNr");
    expect(src).not.toContain("allPageBarcodes");
  });
});

// ─── Kurzaliase ───────────────────────────────────────────────────────────────

describe("barcode-layout: Kurzaliase (N_BC, SB_W, BC_W, BC_H_MIN, …)", () => {
  test("N_BC = BARCODES_PER_ROW = 4", () => {
    expect(N_BC).toBe(4);
    expect(N_BC).toBe(BARCODES_PER_ROW);
  });

  test("SB_W = SIDE_BARCODE_WIDTH = 10 (8–14pt SSK-Bereich)", () => {
    expect(SB_W).toBe(SIDE_BARCODE_WIDTH);
    expect(SB_W).toBeGreaterThanOrEqual(8);
    expect(SB_W).toBeLessThanOrEqual(14);
  });

  test("BC_W = BARCODE_WIDTH ≥ 80pt", () => {
    expect(BC_W).toBe(BARCODE_WIDTH);
    expect(BC_W).toBeGreaterThanOrEqual(80);
  });

  test("BC_H_MIN = round(BC_W × 2.0) – Hochformat-Richtwert ≥ 2 × BC_W", () => {
    expect(BC_H_MIN).toBe(Math.round(BARCODE_WIDTH * 2.0));
    expect(BC_H_MIN).toBeGreaterThanOrEqual(2 * BC_W);
  });

  test("SB_GAP = 4pt (Abstand Seitenbarcode zum Rand)", () => {
    expect(SB_GAP).toBe(4); // SIDE_BARCODE_MARGIN = 4
  });

  test("MARGIN_LEFT = CONTENT_LEFT (Nutzbereich-Anfang)", () => {
    expect(MARGIN_LEFT).toBe(CONTENT_LEFT);
  });

  test("CONTENT_W = CONTENT_WIDTH (Nutzbreite)", () => {
    expect(CONTENT_W).toBe(CONTENT_WIDTH);
  });

  test("LABEL_H = 14pt (Beschriftungs-Abstand)", () => {
    expect(LABEL_H).toBe(14); // LABEL_OFFSET = 14
  });
});

// ─── Portrait-Checks ─────────────────────────────────────────────────────────

describe("barcode-layout: Portrait-Prüfung CODE128C + PDF417", () => {
  test("CODE128C Seitenbarcode ist Portrait (h > w) dank rotate=L", async () => {
    const { getPngSize } = require("../lib/barcode-utils");
    const { generateSeitenbarcodeCode128 } = require("../lib/barcode");
    const png = await generateSeitenbarcodeCode128("1/5");
    const { w, h } = getPngSize(png);
    expect(h).toBeGreaterThan(w); // rotiert: Höhe > Breite
  }, 15000);

  test("PDF417 Barcode-PNG ist Querformat (w > h) – Rotation erfolgt im PDF", async () => {
    // eCH-0196 v2.2.0: PNG ist Querformat (columns=13, rows=35, kein rotate:"L")
    // 90°-Rotation via degrees(90) in pdf-lib → Hochformat auf der Seite
    const { getPngSize } = require("../lib/barcode-utils");
    const { generatePdf417Png } = require("../lib/barcode");
    const xml = "<r>" + "A".repeat(500) + "</r>";
    const png = await generatePdf417Png(xml, 2);
    const { w, h } = getPngSize(png);
    expect(w).toBeGreaterThan(h); // Querformat-PNG (Breite > Höhe)
  }, 15000);
});

// ─── getPngSize ───────────────────────────────────────────────────────────────

describe("barcode-utils: getPngSize", () => {
  const { getPngSize } = require("../lib/barcode-utils");
  const { generatePdf417Png } = require("../lib/barcode");

  test("getPngSize liefert korrekte Dimensionen für generiertes PNG", async () => {
    const png = await generatePdf417Png("<r>test</r>", 2);
    const { w, h } = getPngSize(png);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  }, 15000);

  test("getPngSize: w und h sind positive Integer", async () => {
    const png = await generatePdf417Png("<r>abc</r>", 2);
    const { w, h } = getPngSize(png);
    expect(Number.isInteger(w)).toBe(true);
    expect(Number.isInteger(h)).toBe(true);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  }, 15000);
});

// ─── barcode-utils: splitXmlIntoSegments ─────────────────────────────────────

describe("barcode-utils: splitXmlIntoSegments", () => {
  const { splitXmlIntoSegments } = require("../lib/barcode-utils");

  test("Kurzes XML → 1 Segment", () => {
    expect(splitXmlIntoSegments("<r>k</r>")).toHaveLength(1);
  });

  test("Leerer String → 1 leeres Segment", () => {
    const segs = splitXmlIntoSegments("");
    expect(segs).toHaveLength(1);
    expect(segs[0]).toBe("");
  });

  test("Standard MAX_CHARS = 1000 (Default-Parameter)", () => {
    const xml = "X".repeat(1000);
    expect(splitXmlIntoSegments(xml)).toHaveLength(1);
    const xml2 = "X".repeat(1001);
    expect(splitXmlIntoSegments(xml2)).toHaveLength(2);
  });

  test("Benutzerdefinierter MAX_CHARS wird respektiert", () => {
    const xml  = "X".repeat(500);
    const segs = splitXmlIntoSegments(xml, 200);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toHaveLength(200);
    expect(segs[2]).toHaveLength(100);
  });

  test("Segmente zusammengesetzt ergeben Original (kein Datenverlust)", () => {
    const xml = "Y".repeat(3500);
    expect(splitXmlIntoSegments(xml).join("")).toBe(xml);
  });
});

// ─── eCH-0196 v2.2.0 Spezifikationskonstanten ────────────────────────────────

describe("barcode-layout: eCH-0196 v2.2.0 Spezifikationskonstanten", () => {
  test("PDF417_COLUMNS = 13 (eCH-0196 v2.2.0 Spaltenanzahl)", () => {
    expect(PDF417_COLUMNS).toBe(13);
  });

  test("PDF417_ROWS = 35 (eCH-0196 v2.2.0 Zeilenanzahl)", () => {
    expect(PDF417_ROWS).toBe(35);
  });

  test("PDF417_EC = 4 (eCH-0196 v2.2.0 Fehlerkorrektur-Level)", () => {
    expect(PDF417_EC).toBe(4);
  });

  test("PDF417_PER_SHEET = 6 (max. 6 Barcodes pro Seite: 1 Reihe × 6, Landscape)", () => {
    expect(PDF417_PER_SHEET).toBe(6);
  });

  test("BC_ON_PAGE_W_PT ≈ 79pt (35 Zeilen × 0.08cm × 28.346pt/cm)", () => {
    expect(BC_ON_PAGE_W_PT).toBe(79);
  });

  test("BC_ON_PAGE_H_PT ≈ 345pt (290 Spalten × 0.042cm × 28.346pt/cm)", () => {
    expect(BC_ON_PAGE_H_PT).toBe(345);
  });

  test("PAGE_W_PORTRAIT = 595pt, PAGE_H_PORTRAIT = 842pt (A4 Hochformat)", () => {
    expect(PAGE_W_PORTRAIT).toBe(595);
    expect(PAGE_H_PORTRAIT).toBe(842);
  });

  test("SB_W_SPEC_PT ≈ 34pt (12mm nach eCH-0196 v2.2.0)", () => {
    expect(SB_W_SPEC_PT).toBe(34);
  });

  test("SB_MARGIN_SPEC_PT ≈ 14pt (5mm nach eCH-0196 v2.2.0)", () => {
    expect(SB_MARGIN_SPEC_PT).toBe(14);
  });

  test("BC_ON_PAGE_H_PT > BC_ON_PAGE_W_PT (Hochformat nach Rotation)", () => {
    expect(BC_ON_PAGE_H_PT).toBeGreaterThan(BC_ON_PAGE_W_PT);
  });
});

// ─── getSeitenbarcodeText (eCH-0196 v2.2.0) ──────────────────────────────────

describe("barcode-layout: getSeitenbarcodeText (eCH-0196 v2.2.0 CODE128C Inhalt)", () => {
  test("Format: 16-stellige Ziffernfolge", () => {
    expect(getSeitenbarcodeText(1, false)).toMatch(/^\d{16}$/);
    expect(getSeitenbarcodeText(3, true)).toMatch(/^\d{16}$/);
  });

  test("Beginnt mit '19622' (FF=196, VV=22)", () => {
    expect(getSeitenbarcodeText(1, false).startsWith("19622")).toBe(true);
  });

  test("Enthält '00000' (Organisations-Nummer)", () => {
    expect(getSeitenbarcodeText(1, false)).toContain("00000");
  });

  test("Reguläre Seite 1 (kein Barcode): '1962200000001004'", () => {
    expect(getSeitenbarcodeText(1, false)).toBe("1962200000001004");
  });

  test("Letzte Seite mit Barcodes (Seite 3, Querformat): '1962200000003104'", () => {
    expect(getSeitenbarcodeText(3, true)).toBe("1962200000003104");
  });

  test("Seitennummer wird 3-stellig codiert (PPP)", () => {
    expect(getSeitenbarcodeText(1, false)).toContain("001");
    expect(getSeitenbarcodeText(99, false)).toContain("099");
  });

  test("Endet immer auf '4' (Leserichtung L=4)", () => {
    expect(getSeitenbarcodeText(1, false).endsWith("4")).toBe(true);
    expect(getSeitenbarcodeText(5, true).endsWith("4")).toBe(true);
  });

  test("isBarcodePage=true: B=1, O=0 (Querformat); isBarcodePage=false: B=0, O=0", () => {
    const regular = getSeitenbarcodeText(2, false);
    const barcode = getSeitenbarcodeText(2, true);
    // Zeichen 13: B, Zeichen 14: O (0-basiert: index 13, 14)
    expect(regular[13]).toBe("0"); // B=0
    expect(regular[14]).toBe("0"); // O=0 (Querformat = default)
    expect(barcode[13]).toBe("1"); // B=1
    expect(barcode[14]).toBe("0"); // O=0 (Querformat = default)
  });

  test("isLandscape=false ergibt O=1 (Hochformat)", () => {
    const portrait = getSeitenbarcodeText(1, false, false);
    expect(portrait[14]).toBe("1"); // O=1 (Hochformat)
    expect(portrait).toMatch(/^\d{16}$/);
  });
});

// ─── BC_PAGE_W / BC_PAGE_H (Barcode-Seite Querformat) ────────────────────────

describe("barcode-layout: BC_PAGE_W / BC_PAGE_H (Barcode-Seite Querformat)", () => {
  test("BC_PAGE_W = 842pt (A4 Landscape Breite)", () => {
    expect(BC_PAGE_W).toBe(842);
  });

  test("BC_PAGE_H = 595pt (A4 Landscape Höhe)", () => {
    expect(BC_PAGE_H).toBe(595);
  });

  test("BC_PAGE_W > BC_PAGE_H (Querformat)", () => {
    expect(BC_PAGE_W).toBeGreaterThan(BC_PAGE_H);
  });

  test("BC_PAGE_W = PAGE_WIDTH (Barcode-Seite identisch mit Querformat-Seiten)", () => {
    expect(BC_PAGE_W).toBe(PAGE_WIDTH);
  });

  test("BC_PAGE_H = PAGE_HEIGHT (Barcode-Seite identisch mit Querformat-Seiten)", () => {
    expect(BC_PAGE_H).toBe(PAGE_HEIGHT);
  });
});

// ─── SB Objekt (eCH-0196 v2.2.0 Seitenbarcode) ───────────────────────────────

describe("barcode-layout: SB Objekt (Seitenbarcode)", () => {
  test("SB.TOTAL_H_MM = 12 (12mm Höhe nach eCH-0196 v2.2.0)", () => {
    expect(SB.TOTAL_H_MM).toBe(12);
  });

  test("SB.MARGIN_L_MM = 5 (5mm linker Rand)", () => {
    expect(SB.MARGIN_L_MM).toBe(5);
  });

  test("SB.TOTAL_H_PT ≈ 34pt (12mm × 2.8346)", () => {
    expect(SB.TOTAL_H_PT).toBe(34);
  });

  test("SB.MARGIN_L_PT ≈ 14pt (5mm × 2.8346)", () => {
    expect(SB.MARGIN_L_PT).toBe(14);
  });

  test("SB.getText ist eine Funktion", () => {
    expect(typeof SB.getText).toBe("function");
  });

  test("SB.getText delegiert an getSeitenbarcodeText", () => {
    expect(SB.getText(1, false)).toBe(getSeitenbarcodeText(1, false));
    expect(SB.getText(3, true)).toBe(getSeitenbarcodeText(3, true));
  });

  test("SB.getText mit isLandscape=false ergibt Hochformat-Code", () => {
    const portrait = SB.getText(2, false, false);
    expect(portrait[14]).toBe("1"); // O=1 (Hochformat)
  });
});

// ─── PDF417 Objekt (eCH-0196 v2.2.0 Spezifikation) ───────────────────────────

describe("barcode-layout: PDF417 Objekt (Spezifikation)", () => {
  test("PDF417.COLUMNS = 13", () => {
    expect(PDF417.COLUMNS).toBe(13);
  });

  test("PDF417.ROWS = 35", () => {
    expect(PDF417.ROWS).toBe(35);
  });

  test("PDF417.EC_LEVEL = 4", () => {
    expect(PDF417.EC_LEVEL).toBe(4);
  });

  test("PDF417.PER_ROW = 6 (6 Barcodes in einer Reihe, Landscape)", () => {
    expect(PDF417.PER_ROW).toBe(6);
  });

  test("PDF417.GAP_PT = 8pt (Abstand zwischen Barcodes)", () => {
    expect(PDF417.GAP_PT).toBe(8);
  });

  test("PDF417.W_ON_PAGE ≈ 79pt (Barcode-Breite auf Seite nach Rotation)", () => {
    expect(PDF417.W_ON_PAGE).toBe(79);
  });

  test("PDF417.H_ON_PAGE ≈ 345pt (Barcode-Höhe auf Seite nach Rotation)", () => {
    expect(PDF417.H_ON_PAGE).toBe(345);
  });

  test("PDF417.H_ON_PAGE > PDF417.W_ON_PAGE (Hochformat nach Rotation)", () => {
    expect(PDF417.H_ON_PAGE).toBeGreaterThan(PDF417.W_ON_PAGE);
  });

  test("PDF417.PX_W = 290 (Pixel breit bei scale=1)", () => {
    expect(PDF417.PX_W).toBe(290);
  });

  test("PDF417.PX_H = 35 (Pixel hoch = Zeilenanzahl)", () => {
    expect(PDF417.PX_H).toBe(35);
  });

  test("6 Barcodes + 5 Lücken passen in Landscape-Seite", () => {
    const sbLeft    = SB.MARGIN_L_PT + SB.TOTAL_H_PT + 8;  // ≈ 56pt
    const available = BC_PAGE_W - sbLeft - 36;              // ≈ 750pt
    const needed    = PDF417.PER_ROW * PDF417.W_ON_PAGE + (PDF417.PER_ROW - 1) * PDF417.GAP_PT;
    expect(needed).toBeLessThanOrEqual(available);
  });
});

// ─── getPngSize Re-Export aus barcode-utils ───────────────────────────────────

describe("barcode-layout: getPngSize Re-Export", () => {
  test("getPngSize ist aus barcode-layout importierbar", () => {
    expect(typeof getPngSize).toBe("function");
  });

  test("getPngSize liefert {w, h} für generiertes PNG", async () => {
    const { generatePdf417Png } = require("../lib/barcode");
    const png = await generatePdf417Png("<r>test</r>", 2);
    const { w, h } = getPngSize(png);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
  }, 15000);
});
