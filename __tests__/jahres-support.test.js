import { getJahresStatus, getSteuerjahre } from "../lib/jahres-utils";
import { calculateFIFO } from "../lib/fifo";

// ─── getJahresStatus – vergangene Jahre ───────────────────────────────────────
describe("getJahresStatus – vergangene Jahre", () => {
  const vergangeneJahre = [2013, 2017, 2020, 2021, 2022, 2023, 2024, 2025].filter(
    (y) => y < new Date().getFullYear()
  );

  test.each(vergangeneJahre)("Jahr %i ist abgeschlossen", (year) => {
    const s = getJahresStatus(year);
    expect(s.isAbgeschlossen).toBe(true);
    expect(s.isLaufend).toBe(false);
    expect(s.stichtagDatum).toBe(`${year}-12-31`);
    expect(s.periodTo).toBe(`${year}-12-31`);
    expect(s.hinweis).toBeNull();
  });
});

// ─── getJahresStatus – laufendes Jahr ─────────────────────────────────────────
describe("getJahresStatus – laufendes Jahr", () => {
  test("Laufendes Jahr: isLaufend = true, Stichtag = heute", () => {
    const year = new Date().getFullYear();
    const today = new Date().toISOString().substring(0, 10);
    const s = getJahresStatus(year);
    expect(s.isLaufend).toBe(true);
    expect(s.isAbgeschlossen).toBe(false);
    expect(s.stichtagDatum).toBe(today);
    expect(s.periodTo).toBe(today);
    expect(s.hinweis).toContain("Laufendes Jahr");
  });
});

// ─── getJahresStatus – zukünftige Jahre ──────────────────────────────────────
describe("getJahresStatus – zukünftige Jahre", () => {
  test("Zukünftiges Jahr: kein Crash, Stichtag = heute", () => {
    const future = new Date().getFullYear() + 2;
    const today = new Date().toISOString().substring(0, 10);
    const s = getJahresStatus(future);
    expect(s).toBeDefined();
    expect(s.stichtagDatum).toBe(today);
    expect(s.isLaufend).toBe(true);
  });
});

// ─── getSteuerjahre – dynamische Jahresauswahl ────────────────────────────────
describe("getSteuerjahre – dynamische Jahresauswahl", () => {
  test("Beginnt mit aktuellem Jahr", () => {
    const year = new Date().getFullYear();
    const jahre = getSteuerjahre();
    expect(jahre[0]).toBe(year);
  });

  test("Endet mit 2013", () => {
    const jahre = getSteuerjahre();
    expect(jahre[jahre.length - 1]).toBe(2013);
  });

  test("Wächst automatisch – enthält richtge Anzahl Jahre", () => {
    const year = new Date().getFullYear();
    const jahre = getSteuerjahre();
    expect(jahre.length).toBe(year - 2013 + 1);
  });

  test("Absteigend sortiert", () => {
    const jahre = getSteuerjahre();
    for (let i = 0; i < jahre.length - 1; i++) {
      expect(jahre[i]).toBeGreaterThan(jahre[i + 1]);
    }
  });
});

// ─── FIFO – historische Jahre ─────────────────────────────────────────────────
describe("FIFO – historische Jahre", () => {
  test("2017 Bull Run: Gewinn korrekt", () => {
    const txs = [
      { date: "2017-01-01", type: "in",  amount: 1.0, chfRate: { price: 900 } },
      { date: "2017-12-01", type: "out", amount: 0.5, chfRate: { price: 15000 } },
    ];
    const r = calculateFIFO(txs, 13000, 2017);
    expect(r.realizedGainChf).toBeCloseTo((15000 - 900) * 0.5, 0);
    expect(r.endbestandAmount).toBeCloseTo(0.5, 8);
  });

  test("2022 Bear Market: Verlust korrekt", () => {
    const txs = [
      { date: "2021-11-01", type: "in",  amount: 0.1, chfRate: { price: 65000 } },
      { date: "2022-06-01", type: "out", amount: 0.05, chfRate: { price: 20000 } },
    ];
    const r = calculateFIFO(txs, 16000, 2022);
    expect(r.realizedGainChf).toBeCloseTo((20000 - 65000) * 0.05, 0);
  });

  test("Käufe über mehrere Jahre: Anfangsbestand korrekt", () => {
    const txs = [
      { date: "2020-03-15", type: "in", amount: 0.5,  chfRate: { price: 5000 } },
      { date: "2021-01-15", type: "in", amount: 0.3,  chfRate: { price: 30000 } },
      { date: "2022-03-01", type: "in", amount: 0.2,  chfRate: { price: 40000 } },
    ];
    const r2021 = calculateFIFO(txs, 48000, 2021);
    expect(r2021.anfangsbestandAmount).toBeCloseTo(0.5, 8);
    expect(r2021.endbestandAmount).toBeCloseTo(0.8, 8);
  });

  test("Kein Crash bei Jahr ohne Transaktionen", () => {
    const txs = [
      { date: "2020-06-01", type: "in", amount: 1.0, chfRate: { price: 9000 } },
    ];
    const r = calculateFIFO(txs, 35000, 2019); // Jahr vor erstem Kauf
    expect(r.anfangsbestandAmount).toBe(0);
    expect(r.endbestandAmount).toBe(0);
  });
});
