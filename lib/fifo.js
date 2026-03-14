// ─────────────────────────────────────────────────────────────────────────────
// lib/fifo.js
// Zweck: FIFO Kostenbasis-Berechnung für alle Kryptowährungen
// Exports: calculateFIFO(transaktionen, btcKursJahresende, jahr)
// Input: Transaktionen mit { datum/date, typ/type, betrag/amount, chfZeitpunkt/chfRate }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet FIFO-Kennzahlen für ein Steuerjahr.
 *
 * @param {Array} transaktionen - Alle Transaktionen (mehrere Jahre)
 * @param {number} btcKursJahresende - BTC/CHF Kurs per 31.12. des Jahres
 * @param {number} jahr - Das zu berechnende Steuerjahr
 * @returns {{
 *   anfangsbestandAmount: number,
 *   endbestandAmount: number,
 *   realizedGainChf: number,
 *   unrealizedGainChf: number,
 *   steuerwertChf: number,
 *   kostenbasisChf: number,
 * }}
 */
/**
 * Normalisiert verschiedene Transaktions-Feldnamen auf den internen Standard.
 * Unterstützt: datum/typ/betrag/chfZeitpunkt (intern) UND date/type/amount/chfRate (extern).
 */
function normalisiere(tx) {
  const datum = tx.datum || tx.date || "";
  const typ =
    tx.typ ||
    (tx.type === "in" ? "eingang" : tx.type === "out" ? "ausgang" : tx.type || "");
  const betrag =
    tx.betrag != null ? tx.betrag : tx.amount != null ? tx.amount : 0;
  // chfZeitpunkt = CHF-Kurs pro BTC (nicht CHF-Gesamtwert der Transaktion)
  const chfZeitpunkt =
    tx.chfZeitpunkt != null
      ? tx.chfZeitpunkt
      : tx.chfRate?.price != null
      ? tx.chfRate.price
      : 0;
  return { datum, typ, betrag, chfZeitpunkt };
}

export function calculateFIFO(transaktionen, btcKursJahresende, jahr) {
  // Normalisieren + aufsteigend nach Datum sortieren
  const sortiert = transaktionen
    .map(normalisiere)
    .sort((a, b) => new Date(a.datum) - new Date(b.datum));

  const jahresbeginn = new Date(`${jahr}-01-01T00:00:00Z`);
  const jahresende = new Date(`${jahr}-12-31T23:59:59Z`);

  // FIFO-Queue: { betrag, kursChf } pro Kauf
  const kaufQueue = [];
  let realizedGainChf = 0;

  // Alle Transaktionen VOR dem Jahr verarbeiten → Anfangsbestand
  for (const tx of sortiert) {
    const txDatum = new Date(tx.datum);
    if (txDatum >= jahresbeginn) break;

    if (tx.typ === "eingang") {
      kaufQueue.push({ betrag: tx.betrag, kursChf: tx.chfZeitpunkt || 0 });
    } else if (tx.typ === "ausgang") {
      fifoVerkauf(kaufQueue, tx.betrag, tx.chfZeitpunkt || 0, (gewinn) => {
        // G/V vor dem Jahr wird nicht dem aktuellen Jahr zugeordnet
      });
    }
  }

  // Anfangsbestand = Summe der FIFO-Queue zu Jahresbeginn
  const anfangsbestandAmount = kaufQueue.reduce((s, k) => s + k.betrag, 0);

  // Transaktionen IM Jahr verarbeiten
  const txImJahr = sortiert.filter((tx) => {
    const d = new Date(tx.datum);
    return d >= jahresbeginn && d <= jahresende;
  });

  for (const tx of txImJahr) {
    if (tx.typ === "eingang") {
      kaufQueue.push({ betrag: tx.betrag, kursChf: tx.chfZeitpunkt || 0 });
    } else if (tx.typ === "ausgang") {
      fifoVerkauf(kaufQueue, tx.betrag, tx.chfZeitpunkt || 0, (gewinn) => {
        realizedGainChf += gewinn;
      });
    }
  }

  // Endbestand 31.12.
  const endbestandAmount = kaufQueue.reduce((s, k) => s + k.betrag, 0);
  const kostenbasisChf = kaufQueue.reduce(
    (s, k) => s + k.betrag * k.kursChf,
    0
  );

  // Steuerwert = Endbestand × Kurs 31.12.
  const steuerwertChf = endbestandAmount * btcKursJahresende;

  // Unrealisierter G/V = Marktwert - Kostenbasis
  const unrealizedGainChf = steuerwertChf - kostenbasisChf;

  return {
    anfangsbestandAmount,
    endbestandAmount,
    realizedGainChf,
    unrealizedGainChf,
    steuerwertChf,
    kostenbasisChf,
  };
}

/**
 * FIFO-Verkauf: entnimmt betrag aus der Queue und berechnet G/V.
 * Ruft onGewinn(gewinnChf) für jeden verbrauchten Kauf auf.
 */
function fifoVerkauf(queue, verkaufBetrag, verkaufKursChf, onGewinn) {
  let verbleibend = verkaufBetrag;

  while (verbleibend > 1e-10 && queue.length > 0) {
    const ersterKauf = queue[0];

    if (ersterKauf.betrag <= verbleibend) {
      // Ganzen Kauf verbrauchen
      const gewinn =
        ersterKauf.betrag * (verkaufKursChf - ersterKauf.kursChf);
      onGewinn(gewinn);
      verbleibend -= ersterKauf.betrag;
      queue.shift();
    } else {
      // Kauf teilweise verbrauchen
      const gewinn = verbleibend * (verkaufKursChf - ersterKauf.kursChf);
      onGewinn(gewinn);
      ersterKauf.betrag -= verbleibend;
      verbleibend = 0;
    }
  }
}
