import { getValorennummer, getCoinGeckoId, VALORENNUMMERN } from "../lib/valorennummern";
import { generateESteuerauszugXML } from "../lib/esteuerauszug";
import { calculateFIFO } from "../lib/fifo";

// ─── Valorennummern ───────────────────────────────────────────────────────────
describe("Valorennummern – alle Assets", () => {
  test.each([
    ["BTC",  "3841927"],
    ["ETH",  "385539"],
    ["SOL",  "81720700"],
    ["LINK", "4383521"],
    ["USDC", "12360981"],
    ["USDT", "1107203"],
  ])("%s Valorennummer = %s", (symbol, expected) => {
    expect(getValorennummer(symbol)).toBe(expected);
  });

  test("Unbekannter Token: gibt null zurück (kein Crash)", () => {
    expect(getValorennummer("UNKNOWNTOKEN999")).toBeNull();
  });

  test("Case-insensitive: eth = ETH", () => {
    expect(getValorennummer("eth")).toBe(getValorennummer("ETH"));
  });

  test("Solana Valorennummer ist 81720700 (nicht 24153654)", () => {
    expect(getValorennummer("SOL")).toBe("81720700");
  });
});

describe("CoinGecko IDs", () => {
  test.each([
    ["BTC",  "bitcoin"],
    ["ETH",  "ethereum"],
    ["SOL",  "solana"],
    ["LINK", "chainlink"],
    ["USDC", "usd-coin"],
  ])("%s CoinGecko ID = %s", (symbol, expected) => {
    expect(getCoinGeckoId(symbol)).toBe(expected);
  });

  test("Unbekannter Token: lowercase symbol als Fallback", () => {
    expect(getCoinGeckoId("MYTOKEN")).toBe("mytoken");
  });
});

// ─── FIFO für ERC-20 Token ────────────────────────────────────────────────────
describe("FIFO – ERC-20 Token (via calculateFIFO)", () => {
  test("ETH: Kauf und Verkauf", () => {
    const txs = [
      { date: "2025-01-01", type: "in",  amount: 1.0, chfRate: { price: 3000 } },
      { date: "2025-06-01", type: "out", amount: 0.5, chfRate: { price: 4000 } },
    ];
    const r = calculateFIFO(txs, 3500, 2025);
    expect(r.realizedGainChf).toBeCloseTo(500, 0); // (4000-3000)*0.5
    expect(r.endbestandAmount).toBeCloseTo(0.5, 8);
    expect(r.steuerwertChf).toBeCloseTo(1750, 0);
  });

  test("LINK: mehrere Käufe, FIFO-Reihenfolge (ältester Kauf zuerst)", () => {
    const txs = [
      { date: "2025-01-01", type: "in",  amount: 100, chfRate: { price: 15 } },
      { date: "2025-03-01", type: "in",  amount: 100, chfRate: { price: 20 } },
      { date: "2025-07-01", type: "out", amount: 100, chfRate: { price: 25 } },
    ];
    const r = calculateFIFO(txs, 22, 2025);
    // FIFO: erstes Lot (15 CHF/LINK) wird verkauft
    expect(r.realizedGainChf).toBeCloseTo((25 - 15) * 100, 0);
    expect(r.endbestandAmount).toBeCloseTo(100, 8);
  });

  test("USDC: Stablecoin, Gewinn ~0", () => {
    const txs = [
      { date: "2025-01-01", type: "in",  amount: 1000, chfRate: { price: 0.90 } },
      { date: "2025-06-01", type: "out", amount: 500,  chfRate: { price: 0.91 } },
    ];
    const r = calculateFIFO(txs, 0.90, 2025);
    expect(r.realizedGainChf).toBeCloseTo((0.91 - 0.90) * 500, 1);
  });

  test("Multi-Token Portfolio: ETH + LINK unabhängig berechnet", () => {
    const ethTxs  = [{ date: "2025-01-01", type: "in", amount: 1.0,  chfRate: { price: 3000 } }];
    const linkTxs = [{ date: "2025-01-01", type: "in", amount: 100,  chfRate: { price: 15   } }];
    const ethFifo  = calculateFIFO(ethTxs,  3500, 2025);
    const linkFifo = calculateFIFO(linkTxs, 18,   2025);
    expect(ethFifo.steuerwertChf).toBeCloseTo(3500, 0);
    expect(linkFifo.steuerwertChf).toBeCloseTo(1800, 0);
    expect(ethFifo.steuerwertChf + linkFifo.steuerwertChf).toBeCloseTo(5300, 0);
  });
});

// ─── FIFO für SOL ─────────────────────────────────────────────────────────────
describe("FIFO – Solana (SOL)", () => {
  test("SOL: Grundfall Kauf und Teilverkauf", () => {
    const txs = [
      { date: "2025-01-01", type: "in",  amount: 10, chfRate: { price: 200 } },
      { date: "2025-09-01", type: "out", amount: 5,  chfRate: { price: 250 } },
    ];
    const r = calculateFIFO(txs, 220, 2025);
    expect(r.realizedGainChf).toBeCloseTo((250 - 200) * 5, 0);
    expect(r.steuerwertChf).toBeCloseTo(5 * 220, 0);
  });
});

// ─── eSteuerauszug XML Multi-Asset ────────────────────────────────────────────
describe("eSteuerauszug XML – ERC-20 Multi-Asset", () => {
  const ethSteuerDaten = {
    wallets: ["0xABCDEF123456"],
    taxYear: 2025,
    canton: "ZH",
    totalSteuerwert: 5300,
    assets: [
      {
        symbol: "ETH",
        valorennummer: "385539",
        endbestand: 1.0,
        kursStichtag: 3500,
        steuerwert: 3500,
        positionId: 1,
        fifo: { anfangsbestandAmount: 0 },
        transaktionen: [
          { date: "2025-01-01", type: "in", amount: 1.0, chfKurs: 3000, chfWert: 3000 },
        ],
      },
      {
        symbol: "LINK",
        valorennummer: "4383521",
        endbestand: 100,
        kursStichtag: 18,
        steuerwert: 1800,
        positionId: 2,
        fifo: { anfangsbestandAmount: 0 },
        transaktionen: [
          { date: "2025-01-01", type: "in", amount: 100, chfKurs: 15, chfWert: 1500 },
        ],
      },
    ],
  };

  test("XML enthält beide Assets", () => {
    const xml = generateESteuerauszugXML(ethSteuerDaten, { name: "Test User" });
    expect(xml).toContain('valorNumber="385539"');  // ETH
    expect(xml).toContain('valorNumber="4383521"'); // LINK
  });

  test("totalTaxValue = Summe aller Assets", () => {
    const xml = generateESteuerauszugXML(ethSteuerDaten, { name: "Test User" });
    expect(xml).toContain('totalTaxValue="5300.00"');
  });

  test("ETH Valorennummer 385539 (nicht BTC 3841927)", () => {
    const xml = generateESteuerauszugXML(ethSteuerDaten, { name: "Test User" });
    expect(xml).not.toContain('valorNumber="3841927"');
    expect(xml).toContain('valorNumber="385539"');
  });

  test("Namespace korrekt für ETH", () => {
    const xml = generateESteuerauszugXML(ethSteuerDaten, { name: "Test User" });
    expect(xml).toContain('xmlns="urn:ech:xmlns:eCH-0196:2"');
  });

  test("Asset mit Steuerwert 0 erscheint nicht im XML", () => {
    const datenMitLeer = {
      ...ethSteuerDaten,
      assets: [
        ...ethSteuerDaten.assets,
        {
          symbol: "SHIB",
          valorennummer: "124609870",
          endbestand: 0,
          kursStichtag: 0,
          steuerwert: 0,
          positionId: 3,
          fifo: { anfangsbestandAmount: 0 },
          transaktionen: [],
        },
      ],
    };
    const xml = generateESteuerauszugXML(datenMitLeer, { name: "Test User" });
    expect(xml).not.toContain("SHIB");
  });

  test("canton korrekt gesetzt", () => {
    const xml = generateESteuerauszugXML(ethSteuerDaten, {});
    expect(xml).toContain('canton="ZH"');
  });
});

// ─── eSteuerauszug XML SOL ────────────────────────────────────────────────────
describe("eSteuerauszug XML – Solana", () => {
  const solSteuerDaten = {
    wallets: ["7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV"],
    taxYear: 2025,
    canton: "BE",
    totalSteuerwert: 1100,
    assets: [
      {
        symbol: "SOL",
        valorennummer: "81720700",
        endbestand: 5,
        kursStichtag: 220,
        steuerwert: 1100,
        positionId: 1,
        fifo: { anfangsbestandAmount: 0 },
        transaktionen: [
          { date: "2025-03-01", type: "in", amount: 5, chfKurs: 200, chfWert: 1000 },
        ],
      },
    ],
  };

  test("SOL Valorennummer korrekt (81720700)", () => {
    const xml = generateESteuerauszugXML(solSteuerDaten, { name: "Test" });
    expect(xml).toContain('valorNumber="81720700"');
  });

  test('canton="BE" korrekt', () => {
    const xml = generateESteuerauszugXML(solSteuerDaten, { name: "Test" });
    expect(xml).toContain('canton="BE"');
  });

  test("totalTaxValue = SOL Steuerwert", () => {
    const xml = generateESteuerauszugXML(solSteuerDaten, { name: "Test" });
    expect(xml).toContain('totalTaxValue="1100.00"');
  });
});
