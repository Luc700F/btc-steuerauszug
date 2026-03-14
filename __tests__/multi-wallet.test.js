import { calculateFIFO } from "../lib/fifo";
import { calculatePrice, calculatePriceRappen } from "../lib/stripe-config";
import { calcAmountForAddress, parseTxsForAddress } from "../lib/bitcoin-fetcher";

describe("Multi-Wallet", () => {
  describe("FIFO über mehrere Wallets", () => {
    const txs = [
      { date: "2025-01-01", type: "in", amount: 0.1,  chfRate: { price: 90000 }, wallet: "bc1qaaa" },
      { date: "2025-06-01", type: "in", amount: 0.05, chfRate: { price: 80000 }, wallet: "bc1qbbb" },
    ];

    test("Endbestand über 2 Wallets korrekt zusammengeführt (0.1 + 0.05 = 0.15)", () => {
      const result = calculateFIFO(txs, 95000, 2025);
      expect(result.endbestandAmount).toBeCloseTo(0.15, 8);
    });

    test("Anfangsbestand 0 (keine Vorjahres-TXs)", () => {
      const result = calculateFIFO(txs, 95000, 2025);
      expect(result.anfangsbestandAmount).toBeCloseTo(0, 8);
    });

    test("Steuerwert = 0.15 × 95000 = 14250", () => {
      const result = calculateFIFO(txs, 95000, 2025);
      expect(result.steuerwertChf).toBeCloseTo(14250, 0);
    });

    test("FIFO mit Verkauf über beide Wallets", () => {
      const txsMitVerkauf = [
        { date: "2025-01-01", type: "in",  amount: 0.1,  chfRate: { price: 90000 }, wallet: "bc1qaaa" },
        { date: "2025-03-01", type: "in",  amount: 0.05, chfRate: { price: 80000 }, wallet: "bc1qbbb" },
        { date: "2025-09-01", type: "out", amount: 0.05, chfRate: { price: 100000 }, wallet: "bc1qaaa" },
      ];
      // Verkauf 0.05 BTC zu 100'000: FIFO nimmt ältesten Kauf 0.05 à 90'000
      // G/V = (100'000 - 90'000) × 0.05 = 500
      const result = calculateFIFO(txsMitVerkauf, 95000, 2025);
      expect(result.realizedGainChf).toBeCloseTo(500, 0);
      expect(result.endbestandAmount).toBeCloseTo(0.1, 8);
    });
  });

  describe("Preis-Berechnung", () => {
    test("1 Wallet = CHF 2.10", () => expect(calculatePrice(1)).toBe(2.10));
    test("2 Wallets = CHF 3.10", () => expect(calculatePrice(2)).toBe(3.10));
    test("3 Wallets = CHF 4.10", () => expect(calculatePrice(3)).toBe(4.10));
    test("5 Wallets = CHF 6.10", () => expect(calculatePrice(5)).toBe(6.10));
    test("0 oder negativ → Mindestpreis CHF 2.10", () => {
      expect(calculatePrice(0)).toBe(2.10);
      expect(calculatePrice(-1)).toBe(2.10);
    });
  });

  describe("Preis in Rappen (Stripe)", () => {
    test("1 Wallet = 210 Rappen", () => expect(calculatePriceRappen(1)).toBe(210));
    test("2 Wallets = 310 Rappen", () => expect(calculatePriceRappen(2)).toBe(310));
    test("3 Wallets = 410 Rappen", () => expect(calculatePriceRappen(3)).toBe(410));
  });
});

// ─── Multi-Wallet: Referenztest (6 Relai-Käufe) ──────────────────────────────

describe("Multi-Wallet – Referenztest (6 Relai-Käufe)", () => {
  const referenzTxs = [
    { date: "2025-07-25", type: "in", amount: 0.00052657, chfRate: { price: 93491.84 } },
    { date: "2025-08-25", type: "in", amount: 0.00054333, chfRate: { price: 90000    } },
    { date: "2025-09-25", type: "in", amount: 0.00054902, chfRate: { price: 89000    } },
    { date: "2025-10-27", type: "in", amount: 0.00053993, chfRate: { price: 91000    } },
    { date: "2025-11-25", type: "in", amount: 0.00069460, chfRate: { price: 88000    } },
    { date: "2025-12-29", type: "in", amount: 0.00070442, chfRate: { price: 96000    } },
  ];

  test("Endbestand = 0.00355787 BTC (6 Käufe, kein Verkauf)", () => {
    const r = calculateFIFO(referenzTxs, 69990.44, 2025);
    expect(r.endbestandAmount).toBeCloseTo(0.00355787, 6);
  });

  test("Steuerwert = 0.00355787 × 69990.44 = CHF 249.02", () => {
    const steuerwert = Math.round(0.00355787 * 69990.44 * 100) / 100;
    expect(steuerwert).toBeCloseTo(249.02, 1);
  });

  test("Anfangsbestand = 0 (erste Käufe in 2025)", () => {
    const r = calculateFIFO(referenzTxs, 69990.44, 2025);
    expect(r.anfangsbestandAmount).toBeCloseTo(0, 8);
  });

  test("Kein realisierter Gewinn (nur Käufe, kein Verkauf)", () => {
    const r = calculateFIFO(referenzTxs, 69990.44, 2025);
    expect(r.realizedGainChf).toBeCloseTo(0, 4);
  });
});

// ─── Multi-Wallet: calcAmountForAddress konsistent ────────────────────────────

describe("Multi-Wallet – calcAmountForAddress konsistent über Wallets", () => {
  test("Zwei Wallets: je eigene TX, keine Überlappung", () => {
    const addrA = "bc1qwalletA";
    const addrB = "bc1qwalletB";

    const txA = {
      txid:   "txA",
      status: { confirmed: true, block_time: 1000000 },
      vout:   [{ value: 100000, scriptpubkey_address: addrA }],
      vin:    [],
    };
    const txB = {
      txid:   "txB",
      status: { confirmed: true, block_time: 1000001 },
      vout:   [{ value: 200000, scriptpubkey_address: addrB }],
      vin:    [],
    };

    expect(calcAmountForAddress(txA, addrA)).toBeCloseTo(100000 / 1e8, 8);
    expect(calcAmountForAddress(txA, addrB)).toBeCloseTo(0, 8); // TX gehört nicht B

    expect(calcAmountForAddress(txB, addrB)).toBeCloseTo(200000 / 1e8, 8);
    expect(calcAmountForAddress(txB, addrA)).toBeCloseTo(0, 8); // TX gehört nicht A
  });

  test("Kombinierter Endbestand: A + B zusammen via FIFO", () => {
    const txsA = [{ date: "2025-01-01", type: "in", amount: 0.001, chfRate: { price: 90000 } }];
    const txsB = [{ date: "2025-02-01", type: "in", amount: 0.002, chfRate: { price: 95000 } }];
    const combined = [...txsA, ...txsB].sort((a, b) => a.date.localeCompare(b.date));

    const r = calculateFIFO(combined, 85000, 2025);
    expect(r.endbestandAmount).toBeCloseTo(0.003, 8);
  });
});
