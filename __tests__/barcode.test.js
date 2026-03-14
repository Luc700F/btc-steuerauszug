import { getKantonNummer, buildCode128CContent } from "../lib/barcode-utils";
import { splitXmlIntoChunks, generatePdf417Png, generateAllBarcodes } from "../lib/barcode";

describe("CODE128C Seitenbarcode – Kantonsnummern", () => {
  test("ZH = '01'", () => expect(getKantonNummer("ZH")).toBe("01"));
  test("BE = '02'", () => expect(getKantonNummer("BE")).toBe("02"));
  test("AG = '19'", () => expect(getKantonNummer("AG")).toBe("19"));
  test("GE = '25'", () => expect(getKantonNummer("GE")).toBe("25"));
  test("JU = '26'", () => expect(getKantonNummer("JU")).toBe("26"));
  test("Kleinschreibung wird toleriert ('zh' → '01')", () => expect(getKantonNummer("zh")).toBe("01"));
  test("Unbekannter Kanton: Fallback '01'", () => expect(getKantonNummer("XX")).toBe("01"));
  test("Leer-String: Fallback '01'", () => expect(getKantonNummer("")).toBe("01"));
  test("undefined: Fallback '01'", () => expect(getKantonNummer(undefined)).toBe("01"));
});

describe("CODE128C Seitenbarcode – Barcode-Inhalt", () => {
  test("Format 15 Ziffern (YYYY + KantonNr(2) + Valorennummer(7) + Seite(2))", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);
    expect(content).toMatch(/^\d{15}$/);
  });

  test("Beginnt mit Steuerjahr", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);
    expect(content).toMatch(/^2025/);
  });

  test("Enthält BTC-Valorennummer 3841927", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);
    expect(content).toContain("3841927");
  });

  test("Endet auf Seitennummer '01' (Seite 1)", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);
    expect(content).toMatch(/01$/);
  });

  test("Seite 2 endet auf '02'", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 2);
    expect(content).toMatch(/02$/);
  });

  test("Seite 10 endet auf '10'", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 10);
    expect(content).toMatch(/10$/);
  });

  test("AG (Kanton 19) korrekt eingebettet", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "AG" }, 3);
    expect(content).toContain("19");
    expect(content).toMatch(/03$/);
  });

  test("Jahr 2020 korrekt", () => {
    const content = buildCode128CContent({ taxYear: 2020, canton: "BE" }, 1);
    expect(content).toMatch(/^2020/);
    expect(content).toContain("02"); // BE = 02
  });

  test("Inhalt ist rein numerisch", () => {
    const content = buildCode128CContent({ taxYear: 2025, canton: "SG" }, 5);
    expect(/^\d+$/.test(content)).toBe(true);
  });
});

describe("CODE128C Seitenbarcode – bwip-js Generierung", () => {
  test("bwip-js generiert valides PNG ohne Fehler", async () => {
    const bwipjs = require("bwip-js");
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);

    await expect(
      new Promise((resolve, reject) => {
        bwipjs.toBuffer(
          { bcid: "code128", text: content, scale: 1, height: 8, rotate: "L" },
          (err, png) => (err ? reject(err) : resolve(png))
        );
      })
    ).resolves.toBeInstanceOf(Buffer);
  }, 15000);

  test("Generiertes PNG ist nicht leer (> 100 Bytes)", async () => {
    const bwipjs = require("bwip-js");
    const content = buildCode128CContent({ taxYear: 2025, canton: "ZH" }, 1);

    const png = await new Promise((resolve, reject) => {
      bwipjs.toBuffer(
        { bcid: "code128", text: content, scale: 1, height: 8, rotate: "L" },
        (err, buf) => (err ? reject(err) : resolve(buf))
      );
    });
    expect(png.length).toBeGreaterThan(100);
  }, 15000);
});

// ─── PDF417 Barcode – splitXmlIntoChunks ─────────────────────────────────────
describe("PDF417 – splitXmlIntoChunks (1800-Byte-Chunks)", () => {
  test("Kurzes XML → 1 Chunk", () => {
    const xml    = "<test>kurz</test>";
    const chunks = splitXmlIntoChunks(xml);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(xml);
  });

  test("Langes XML → mehrere Chunks, je max. 1800 Bytes", () => {
    const xml    = "<root>" + "a".repeat(4000) + "</root>";
    const chunks = splitXmlIntoChunks(xml);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(new TextEncoder().encode(chunk).length).toBeLessThanOrEqual(1800);
    });
  });

  test("Zusammengesetzt = Original (kein Datenverlust)", () => {
    const xml = '<?xml version="1.0"?><taxStatement>' + "x".repeat(5000) + "</taxStatement>";
    expect(splitXmlIntoChunks(xml).join("")).toBe(xml);
  });

  test("Kein Schnitt mitten in UTF-8-Multibyte-Zeichen (Schweizer Umlaute)", () => {
    const xml    = "Z\u00FCrich Gen\u00E8ve Bern ".repeat(200); // ä/ö/ü = 2 Bytes
    const chunks = splitXmlIntoChunks(xml);
    expect(() => chunks.join("")).not.toThrow();
    expect(chunks.join("")).toBe(xml);
  });

  test("Leerer String → 0 Chunks", () => {
    expect(splitXmlIntoChunks("")).toHaveLength(0);
  });
});

// ─── PDF417 Barcode – generatePdf417Png ──────────────────────────────────────
describe("PDF417 – generatePdf417Png (scale=4, eclevel=2)", () => {
  test("gibt Buffer zurück", async () => {
    const png = await generatePdf417Png("Test Barcode Inhalt", 3);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(0);
  }, 15000);

  test("PNG hat korrekten Datei-Header (magic bytes 89 50 4E 47)", async () => {
    const png = await generatePdf417Png("Test", 3);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50); // P
    expect(png[2]).toBe(0x4e); // N
    expect(png[3]).toBe(0x47); // G
  }, 15000);

  test("scale=4 produziert grösseres PNG als scale=1 (höhere Auflösung)", async () => {
    const [png1, png4] = await Promise.all([
      generatePdf417Png("Test", 1),
      generatePdf417Png("Test", 4),
    ]);
    expect(png4.length).toBeGreaterThan(png1.length);
  }, 20000);

  test("scale=4: PNG > 5 KB (ausreichende Qualität für Scan)", async () => {
    const png = await generatePdf417Png("eCH-0196 v2.2.0 Barcode Content", 4);
    expect(png.length).toBeGreaterThan(5000);
  }, 15000);
});

// ─── PDF417 Barcode – generateAllBarcodes ────────────────────────────────────
describe("PDF417 – generateAllBarcodes (vollständiges XML)", () => {
  test("Kurzes XML → 1 Barcode mit label '1/1'", async () => {
    const barcodes = await generateAllBarcodes("<taxStatement>kurz</taxStatement>");
    expect(barcodes).toHaveLength(1);
    expect(barcodes[0].label).toBe("1/1");
  }, 15000);

  test("Langes XML → Labels korrekt nummeriert", async () => {
    const barcodes = await generateAllBarcodes("X".repeat(5000));
    barcodes.forEach((b, i) => {
      expect(b.label).toBe(`${i + 1}/${barcodes.length}`);
    });
  }, 30000);

  test("Alle Barcodes haben valide PNG-Daten (PNG-Header)", async () => {
    const barcodes = await generateAllBarcodes("<root>" + "a".repeat(4000) + "</root>");
    for (const b of barcodes) {
      expect(Buffer.isBuffer(b.png)).toBe(true);
      expect(b.png[0]).toBe(0x89); // PNG magic byte
    }
  }, 30000);

  test("byteSize jedes Chunks ≤ 1800 Bytes", async () => {
    const barcodes = await generateAllBarcodes("<test>" + "content".repeat(100) + "</test>");
    barcodes.forEach((b) => {
      expect(b.byteSize).toBeGreaterThan(0);
      expect(b.byteSize).toBeLessThanOrEqual(1800);
    });
  }, 30000);
});
