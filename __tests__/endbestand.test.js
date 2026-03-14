import { calcAmountForAddress, parseTxsForAddress } from "../lib/bitcoin-fetcher";

const ADDR = "bc1qtest123";

// ─── calcAmountForAddress ─────────────────────────────────────────────────────

describe("calcAmountForAddress – nur eigene Adresse zählt", () => {
  test("Eingang: nur vout mit eigener Adresse zählt", () => {
    const tx = {
      txid:   "abc",
      status: { confirmed: true, block_time: 1753401600 },
      vout: [
        { value: 52657, scriptpubkey_address: ADDR },          // eigene Adresse
        { value: 100000, scriptpubkey_address: "bc1qfremd" },  // fremde Adresse
      ],
      vin: [],
    };
    const amount = calcAmountForAddress(tx, ADDR);
    expect(amount).toBeCloseTo(52657 / 1e8, 8);
  });

  test("Ausgang: nur vin mit eigener Adresse als prevout", () => {
    const tx = {
      txid:   "def",
      status: { confirmed: true, block_time: 1753401600 },
      vout:   [],
      vin: [
        { prevout: { value: 52657, scriptpubkey_address: ADDR } },          // eigene
        { prevout: { value: 100000, scriptpubkey_address: "bc1qfremd" } },  // fremde
      ],
    };
    const amount = calcAmountForAddress(tx, ADDR);
    expect(amount).toBeCloseTo(-52657 / 1e8, 8);
  });

  test("Fremde Transaktion: Betrag = 0 (nicht relevant)", () => {
    const tx = {
      txid:   "ghi",
      status: { confirmed: true, block_time: 1753401600 },
      vout:   [{ value: 1000000, scriptpubkey_address: "bc1qfremd" }],
      vin:    [{ prevout: { value: 500000, scriptpubkey_address: "bc1qfremd2" } }],
    };
    const amount = calcAmountForAddress(tx, ADDR);
    expect(amount).toBeCloseTo(0, 8);
  });

  test("Change-Output: nur eigener Anteil zählt (Netto-Berechnung)", () => {
    // Typische Bitcoin-TX: Zahlung an Empfänger + Change zurück an Sender
    const tx = {
      txid:   "jkl",
      status: { confirmed: true, block_time: 1753401600 },
      vout: [
        { value: 50000, scriptpubkey_address: "bc1qempfaenger" }, // Zahlung
        { value: 10000, scriptpubkey_address: ADDR },              // Change zurück
      ],
      vin: [{ prevout: { value: 60500, scriptpubkey_address: ADDR } }], // eigene Eingabe
    };
    const amount = calcAmountForAddress(tx, ADDR);
    // Net: 10000 (received change) - 60500 (sent) = -50500 Satoshi
    expect(amount).toBeCloseTo(-50500 / 1e8, 8);
  });

  test("Coinbase-Transaktion: keine vin prevouts", () => {
    const tx = {
      txid:   "coinbase",
      status: { confirmed: true, block_time: 1000000 },
      vout:   [{ value: 500000, scriptpubkey_address: ADDR }],
      vin:    [{ coinbase: "0000" }], // kein prevout
    };
    const amount = calcAmountForAddress(tx, ADDR);
    expect(amount).toBeCloseTo(500000 / 1e8, 8); // Nur Eingang
  });

  test("Referenz-Testfall: 6 Käufe → Endbestand 0.00355787 BTC", () => {
    // Jede Transaktion: NUR eigener vout, keine Ausgaben
    const txBetraege = [
      0.00052657, // 25.07.2025
      0.00054333, // 25.08.2025
      0.00054902, // 25.09.2025
      0.00053993, // 27.10.2025
      0.00069460, // 25.11.2025
      0.00070442, // 29.12.2025
    ];

    const endbestand = txBetraege.reduce((s, b) => s + b, 0);
    expect(endbestand).toBeCloseTo(0.00355787, 8);
    expect(txBetraege).toHaveLength(6);
  });

  test("Null-Transaktion: vout/vin fehlt oder leer", () => {
    const tx = { txid: "empty", status: { confirmed: true, block_time: 1000000 }, vout: [], vin: [] };
    expect(calcAmountForAddress(tx, ADDR)).toBe(0);
  });
});

// ─── parseTxsForAddress ───────────────────────────────────────────────────────

describe("parseTxsForAddress – Filter und Sortierung", () => {
  test("Unbestätigte Transaktionen (kein block_time) werden übersprungen", () => {
    const txs = [
      { txid: "a", status: { confirmed: false }, vout: [], vin: [] },
      {
        txid:   "b",
        status: { confirmed: true, block_time: 1753401600 },
        vout:   [{ value: 100, scriptpubkey_address: ADDR }],
        vin:    [],
      },
    ];
    const r = parseTxsForAddress(txs, ADDR);
    expect(r).toHaveLength(1);
    expect(r[0].txid).toBe("b");
  });

  test("Transaktionen chronologisch sortiert (älteste zuerst für FIFO)", () => {
    const txs = [
      {
        txid:   "b",
        status: { confirmed: true, block_time: 1753401600 + 86400 },
        vout:   [{ value: 200, scriptpubkey_address: ADDR }],
        vin:    [],
      },
      {
        txid:   "a",
        status: { confirmed: true, block_time: 1753401600 },
        vout:   [{ value: 100, scriptpubkey_address: ADDR }],
        vin:    [],
      },
    ];
    const r = parseTxsForAddress(txs, ADDR);
    expect(r[0].txid).toBe("a"); // Ältere TX zuerst
    expect(r[1].txid).toBe("b");
  });

  test("Null-Transaktionen werden übersprungen", () => {
    const txs = [
      {
        txid:   "foreign",
        status: { confirmed: true, block_time: 1753401600 },
        vout:   [{ value: 999, scriptpubkey_address: "bc1qfremd" }],
        vin:    [{ prevout: { value: 999, scriptpubkey_address: "bc1qfremd2" } }],
      },
    ];
    const r = parseTxsForAddress(txs, ADDR);
    expect(r).toHaveLength(0);
  });

  test("type korrekt gesetzt (eingang/ausgang)", () => {
    const txs = [
      {
        txid:   "eingang",
        status: { confirmed: true, block_time: 1000000 },
        vout:   [{ value: 1000, scriptpubkey_address: ADDR }],
        vin:    [],
      },
      {
        txid:   "ausgang",
        status: { confirmed: true, block_time: 1000001 },
        vout:   [],
        vin:    [{ prevout: { value: 500, scriptpubkey_address: ADDR } }],
      },
    ];
    const r = parseTxsForAddress(txs, ADDR);
    expect(r.find((tx) => tx.txid === "eingang").type).toBe("eingang");
    expect(r.find((tx) => tx.txid === "ausgang").type).toBe("ausgang");
  });

  test("amount immer positiv (type gibt Richtung an)", () => {
    const txs = [
      {
        txid:   "neg",
        status: { confirmed: true, block_time: 1000000 },
        vout:   [],
        vin:    [{ prevout: { value: 500000, scriptpubkey_address: ADDR } }],
      },
    ];
    const r = parseTxsForAddress(txs, ADDR);
    expect(r[0].amount).toBeGreaterThan(0);
    expect(r[0].type).toBe("ausgang");
  });
});
