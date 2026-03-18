/**
 * Vercel-Kompatibilitäts-Tests
 *
 * Verhindert "works on my machine, crashes on Vercel"-Bugs.
 *
 * Vercel Serverless Einschränkungen:
 * - Kein Edge Runtime für bwip-js / pdf-lib (beide brauchen Node.js Buffer)
 * - Kein native module support ausserhalb nodejs runtime
 * - Timeout: max. 60s (Pro Plan) – PDF + Barcode müssen darunter bleiben
 * - bwip-js 4.8.0 ist pure JS (keine native deps) → funktioniert auf Vercel
 *   sofern runtime = "nodejs" explizit gesetzt ist
 *
 * Was die Tests abfangen:
 * - runtime = "edge" in PDF-Routen (häufigste Ursache für Barcode-Crash)
 * - bwip-js im Client-Bundle (would crash – nicht im Browser verfügbar)
 * - document/window im barcode.js (nicht in Serverless verfügbar)
 * - Barcode-Generierung überschreitet Vercel-Timeout
 */

import fs from "fs";

// ═══════════════════════════════════════════════════════════════════════════
// bwip-js – Vercel Kompatibilität
// ═══════════════════════════════════════════════════════════════════════════

describe("Vercel-Kompatibilität – bwip-js", () => {
  test("bwip-js 4.8.0 hat keine native dependencies", () => {
    const pkg  = JSON.parse(fs.readFileSync("node_modules/bwip-js/package.json", "utf8"));
    const deps = Object.keys(pkg.dependencies || {});
    const peer = Object.keys(pkg.peerDependencies || {});
    // Keine canvas, node-canvas oder native Bindings
    expect(deps).not.toContain("canvas");
    expect(deps).not.toContain("node-canvas");
    expect(peer).not.toContain("canvas");
    // Pure JS → funktioniert auf Vercel ohne spezielle Konfiguration
    expect(deps.length).toBe(0);
  });

  test("bwip-js toBuffer importierbar ohne native dependencies", async () => {
    const bwipjs   = await import("bwip-js");
    const toBuffer = bwipjs.default?.toBuffer || bwipjs.toBuffer;
    expect(typeof toBuffer).toBe("function");
  });

  test("bwip-js toBuffer produziert valides PNG (wie auf Vercel)", async () => {
    // Wenn dieser Test PASS → läuft auch auf Vercel (runtime = nodejs)
    const bwipjs   = await import("bwip-js");
    const toBuffer = bwipjs.default?.toBuffer || bwipjs.toBuffer;
    const png      = await new Promise((resolve, reject) =>
      toBuffer(
        { bcid: "pdf417", text: "Test eCH-0270 Vercel", scale: 2, height: 10, eclevel: 2 },
        (err, buf) => (err ? reject(err) : resolve(buf))
      )
    );
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png[0]).toBe(0x89); // PNG magic byte
    expect(png.length).toBeGreaterThan(100);
  }, 15000);

  test("Barcode-Generierung < 30s (Vercel Serverless Limit)", async () => {
    const { generatePdf417Png } = await import("../lib/barcode");
    const start   = Date.now();
    const png     = await generatePdf417Png("eCH-0270 Vercel Timing Test", 4);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(30000);
    expect(Buffer.isBuffer(png)).toBe(true);
  }, 35000);

  test("generateAllBarcodes für reales XML < 60s (Vercel Pro Limit)", async () => {
    const { generateESteuerauszugXML } = await import("../lib/esteuerauszug");
    const { generateAllBarcodes }      = await import("../lib/barcode");

    const xml = generateESteuerauszugXML(
      {
        wallets:         ["bc1qtest"],
        taxYear:         2025,
        canton:          "ZH",
        totalSteuerwert: 249.02,
        assets: [{
          symbol:        "BTC",
          valorennummer: "3841927",
          endbestand:    0.00355787,
          kursStichtag:  69990.44,
          steuerwert:    249.02,
          positionId:    1,
          fifo:          { anfangsbestandAmount: 0 },
          transaktionen: [
            { date: "2025-07-25", type: "in", amount: 0.00052657, chfKurs: 93491.84, chfWert: 49.23 },
            { date: "2025-08-25", type: "in", amount: 0.00054333, chfKurs: 88675.39, chfWert: 48.18 },
            { date: "2025-09-25", type: "in", amount: 0.00054902, chfKurs: 90051.36, chfWert: 49.44 },
            { date: "2025-10-27", type: "in", amount: 0.00053993, chfKurs: 91141.44, chfWert: 49.21 },
            { date: "2025-11-25", type: "in", amount: 0.00069460, chfKurs: 71321.62, chfWert: 49.54 },
            { date: "2025-12-29", type: "in", amount: 0.00070442, chfKurs: 68737.40, chfWert: 48.42 },
          ],
        }],
      },
      { name: "Referenz" }
    );

    const start    = Date.now();
    const barcodes = await generateAllBarcodes(xml);
    const elapsed  = Date.now() - start;

    expect(barcodes.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(60000); // Vercel Pro maxDuration
    barcodes.forEach((b) => {
      expect(b.png[0]).toBe(0x89); // PNG-Header
      expect(b.byteSize).toBeLessThanOrEqual(800); // eCH-0196 v2.2.0 Limit: columns=13, rows=35, eclevel=4
    });
  }, 65000);
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Runtime – verboten für PDF/Barcode-Routen
// ═══════════════════════════════════════════════════════════════════════════

describe("Vercel-Kompatibilität – Edge Runtime verboten", () => {
  test("steuerauszug/route.js hat runtime = 'nodejs' (nicht edge)", () => {
    const src = fs.readFileSync("app/api/export/steuerauszug/route.js", "utf8");
    // Muss explizit nodejs sein
    expect(src).toContain('export const runtime     = "nodejs"');
    // Darf NICHT edge sein
    expect(src).not.toMatch(/export const runtime\s*=\s*['"]edge['"]/);
  });

  test("pdf/route.js hat runtime = 'nodejs' (nicht edge)", () => {
    const src = fs.readFileSync("app/api/export/pdf/route.js", "utf8");
    expect(src).toContain('export const runtime     = "nodejs"');
    expect(src).not.toMatch(/export const runtime\s*=\s*['"]edge['"]/);
  });

  test("analyze/route.js ist nicht als edge konfiguriert", () => {
    const src = fs.readFileSync("app/api/analyze/route.js", "utf8");
    expect(src).not.toMatch(/export const runtime\s*=\s*['"]edge['"]/);
  });

  test("Alle wallet-Routen sind nicht als edge konfiguriert", () => {
    const routes = [
      "app/api/wallet/bitcoin/route.js",
      "app/api/wallet/ethereum/route.js",
      "app/api/wallet/solana/route.js",
    ];
    for (const route of routes) {
      if (!fs.existsSync(route)) continue;
      const src = fs.readFileSync(route, "utf8");
      expect(src).not.toMatch(/export const runtime\s*=\s*['"]edge['"]/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Client-Bundle – bwip-js darf nicht im Browser landen
// ═══════════════════════════════════════════════════════════════════════════

describe("Vercel-Kompatibilität – kein bwip-js im Client-Bundle", () => {
  test("app/page.js importiert kein bwip-js", () => {
    if (!fs.existsSync("app/page.js")) return;
    const src = fs.readFileSync("app/page.js", "utf8");
    expect(src).not.toMatch(/import.*bwip|require.*bwip/);
  });

  test("app/dashboard/page.js importiert kein bwip-js", () => {
    if (!fs.existsSync("app/dashboard/page.js")) return;
    const src = fs.readFileSync("app/dashboard/page.js", "utf8");
    expect(src).not.toMatch(/import.*bwip|require.*bwip/);
  });

  test("lib/barcode.js verwendet keine Browser-APIs (document/window)", () => {
    const src = fs.readFileSync("lib/barcode.js", "utf8");
    expect(src).not.toMatch(/document\.|window\.|HTMLCanvas|createElement/);
  });

  test("lib/barcode.js verwendet Buffer (Node.js API, nicht Browser)", () => {
    const src = fs.readFileSync("lib/barcode.js", "utf8");
    // bwip-js toBuffer gibt Node.js Buffer zurück – kein canvas/Blob
    expect(src).toContain("Buffer");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// vercel.json – maxDuration für alle API-Routen
// ═══════════════════════════════════════════════════════════════════════════

describe("Vercel-Kompatibilität – vercel.json Konfiguration", () => {
  let vercelConfig;
  beforeAll(() => {
    vercelConfig = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  });

  test.each([
    "app/api/analyze/route.js",
    "app/api/wallet/bitcoin/route.js",
    "app/api/wallet/ethereum/route.js",
    "app/api/wallet/solana/route.js",
    "app/api/export/steuerauszug/route.js",
    "app/api/export/pdf/route.js",
  ])("%s hat maxDuration >= 30", (route) => {
    expect(vercelConfig.functions[route]).toBeDefined();
    expect(vercelConfig.functions[route].maxDuration).toBeGreaterThanOrEqual(30);
  });

  test("Kein maxDuration über 300 (Vercel Pro Maximum)", () => {
    for (const [_route, cfg] of Object.entries(vercelConfig.functions)) {
      expect(cfg.maxDuration).toBeLessThanOrEqual(300);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PDF-Generierung – Crash-freie Szenarien (BTC / ETH / SOL)
// ═══════════════════════════════════════════════════════════════════════════

describe("Vercel-Kompatibilität – XML + Barcode für alle Chains", () => {
  // Testet den kombinierten XML+Barcode-Flow für alle drei Chains.
  // generateESteuerauszugPDF / generateUebersichtPDF sind nicht als lib
  // exportiert (inline in route.js) – deshalb testen wir die Kernkomponenten
  // die auf Vercel crashen können: XML-Generierung + Barcode-Generierung.

  test.each([
    ["BTC",  "bitcoin",  "3841927",  69990, 249.02, 0.00355787],
    ["ETH",  "ethereum", "385539",   3500,  1750,   0.5       ],
    ["SOL",  "solana",   "81720700", 220,   1100,   5.0       ],
  ])(
    "%s: XML korrekt + Barcodes ohne Crash (wie auf Vercel)",
    async (symbol, chain, valorenNr, kurs, steuerwert, endbestand) => {
      const { generateESteuerauszugXML } = await import("../lib/esteuerauszug");
      const { generateAllBarcodes }      = await import("../lib/barcode");

      const xmlDaten = {
        wallets:         [chain === "bitcoin" ? "bc1qtest" : chain === "ethereum" ? "0xtest" : "soltest"],
        taxYear:         2025,
        canton:          "ZH",
        totalSteuerwert: steuerwert,
        assets: [{
          symbol,
          valorennummer: valorenNr,
          endbestand,
          kursStichtag:  kurs,
          steuerwert,
          positionId:    1,
          fifo:          { anfangsbestandAmount: 0 },
          transaktionen: [
            { date: "2025-06-01", type: "in", amount: endbestand, chfKurs: kurs * 0.9, chfWert: steuerwert * 0.9 },
          ],
        }],
      };

      // 1. XML-Generierung kein Crash
      const xml = generateESteuerauszugXML(xmlDaten, { name: "Test" });
      expect(xml).toContain(`valorNumber="${valorenNr}"`);
      expect(xml).toContain(`totalTaxValue="${steuerwert.toFixed(2)}"`);
      expect(xml.length).toBeGreaterThan(500);

      // 2. Barcode-Generierung kein Crash (das ist der Vercel-Crash-Punkt)
      const barcodes = await generateAllBarcodes(xml);
      expect(barcodes.length).toBeGreaterThan(0);
      barcodes.forEach((b) => {
        expect(b.png[0]).toBe(0x89); // PNG magic byte → kein Crash
        expect(b.png.length).toBeGreaterThan(500); // PNG Buffer ist valide
        expect(b.byteSize).toBeLessThanOrEqual(800); // eCH-0196 v2.2.0 Limit: 800 Bytes/Chunk
      });
    },
    30000
  );

  test("Edge Case: 0 Transaktionen crasht nicht (leeres Portfolio)", async () => {
    const { generateESteuerauszugXML } = await import("../lib/esteuerauszug");
    const { generateAllBarcodes }      = await import("../lib/barcode");

    const xml = generateESteuerauszugXML(
      {
        wallets:         ["bc1qtest"],
        taxYear:         2025,
        canton:          "ZH",
        totalSteuerwert: 0,
        assets: [{
          symbol:        "BTC",
          valorennummer: "3841927",
          endbestand:    0,
          kursStichtag:  69990,
          steuerwert:    0,
          positionId:    1,
          fifo:          { anfangsbestandAmount: 0 },
          transaktionen: [],
        }],
      },
      {}
    );
    expect(xml.length).toBeGreaterThan(200);
    // generateAllBarcodes mit kurzem XML → 1 Barcode, kein Crash
    const barcodes = await generateAllBarcodes(xml);
    expect(barcodes.length).toBeGreaterThanOrEqual(1);
  }, 30000);
});
