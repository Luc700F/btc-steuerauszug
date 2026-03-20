import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { randomUUID } from "crypto";
import { getHistoricalPriceChf } from "../../../../lib/price-service";
import { formatCHF, formatDatum, formatKrypto, kuerzeText } from "../../../../lib/formatters";
import { getJahresStatus } from "../../../../lib/jahres-utils";
import { generateESteuerauszugXML } from "../../../../lib/esteuerauszug";
import { getValorennummer } from "../../../../lib/valorennummern";
import { generateAllBarcodes } from "../../../../lib/barcode";
import {
  BC_ON_PAGE_W_PT,
  BC_ON_PAGE_H_PT,
} from "../../../../lib/barcode-layout";
import { drawSeitenbarcode } from "../../../../lib/pdf-seitenbarcode";
import { CONTENT_LEFT } from "../../../../lib/pdf-layout";

export const runtime     = "nodejs";       // bwip-js benötigt Node.js – kein Edge Runtime
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── Dimensionen A4 Querformat ────────────────────────────────────────────────
const W = 841.89;
const H = 595.28;
// L = CONTENT_LEFT (73pt): Content beginnt NACH dem CODE128C Seitenbarcode (8 + 57 + 8 = 73pt)
// Lösung A: Content-Startposition nach rechts verschoben, damit Barcode nicht überlagert wird
const L = CONTENT_LEFT;  // 73pt ≈ 26mm
const R = 36;             // rechter Rand
const IW = W - L - R;    // Inhaltsbreite ≈ 733pt

// ─── Valorennummern (ESTV Kursliste) ─────────────────────────────────────────
const VALOREN = {
  bitcoin:  { nummer: "3841927",  name: "Bitcoin",  symbol: "BTC" },
  ethereum: { nummer: "385539",   name: "Ethereum", symbol: "ETH" },
  solana:   { nummer: "81720700", name: "Solana",   symbol: "SOL" },
};

// ─── Spaltenbreiten Transaktions-Tabelle (Summe = 732 ≈ IW mit L=73) ────────
const TX_SPALTEN = [
  { lbl: "Valoren-Nr.",  bw: 54,  rechts: false },
  { lbl: "Datum",        bw: 66,  rechts: false },
  { lbl: "Bezeichnung",  bw: 100, rechts: false },
  { lbl: "Anzahl",       bw: 74,  rechts: true  },
  { lbl: "Whr.",         bw: 36,  rechts: false },
  { lbl: "Stückpreis",   bw: 74,  rechts: true  },
  { lbl: "Ex-Datum",     bw: 54,  rechts: false },
  { lbl: "Kurs",         bw: 68,  rechts: true  },
  { lbl: "Steuerwert",   bw: 80,  rechts: true  },
  { lbl: "Brutt. A",     bw: 60,  rechts: true  },
  { lbl: "Brutt. B",     bw: 66,  rechts: true  },
]; // 54+66+100+74+36+74+54+68+80+60+66 = 732
// x-Positionen berechnen
let _x = L;
for (const sp of TX_SPALTEN) {
  sp.x = _x;
  _x += sp.bw;
}

// formatCHF, formatDatum, formatKrypto, kuerzeText → lib/formatters.js

// ─── FIFO-Berechnung ─────────────────────────────────────────────────────────
function berechneFifo(transaktionen, aktuellerKurs) {
  const sortiert = [...transaktionen].sort(
    (a, b) => new Date(a.datum) - new Date(b.datum)
  );
  const queue = [];
  let realisierterGewinn = 0;

  for (const tx of sortiert) {
    const menge = parseFloat(tx.betrag) || 0;
    const kurs  = menge > 0 ? (tx.chfZeitpunkt || 0) / menge : 0;

    if (tx.typ === "eingang") {
      queue.push({ menge, kurs });
    } else if (tx.typ === "ausgang") {
      let rest = menge;
      const vkKurs = kurs;
      while (rest > 1e-10 && queue.length > 0) {
        const k = queue[0];
        if (k.menge <= rest) {
          realisierterGewinn += (vkKurs - k.kurs) * k.menge;
          rest -= k.menge;
          queue.shift();
        } else {
          realisierterGewinn += (vkKurs - k.kurs) * rest;
          k.menge -= rest;
          rest = 0;
        }
      }
    }
  }

  const restBestand = queue.reduce((s, k) => s + k.menge, 0);
  const kostenbasis  = queue.reduce((s, k) => s + k.menge * k.kurs, 0);
  return {
    realisierterGewinn,
    unrealisierterGewinn: restBestand * (aktuellerKurs || 0) - kostenbasis,
    restBestand,
    kostenbasis,
  };
}

// ─── eCH-0196 v2.2.0 XML ─────────────────────────────────────────────────────
function generiereEchXml({ adresse, blockchain, transaktionen, aktuellerKurs, jahr, fifo, kanton, hauptSymbolOverride }) {
  // hauptSymbolOverride wird für CSV-Imports gesetzt (da blockchain==="csv" kein VALOREN-Key hat)
  let valoren, hauptSymbol;
  if (hauptSymbolOverride) {
    hauptSymbol = hauptSymbolOverride;
    valoren = Object.values(VALOREN).find((v) => v.symbol === hauptSymbol) || VALOREN.bitcoin;
  } else {
    valoren = VALOREN[blockchain] || VALOREN.bitcoin;
    hauptSymbol = valoren.symbol;
  }
  const kt          = kanton || "ZH";

  const txImJahr = transaktionen
    .filter((tx) =>
      new Date(tx.datum).getFullYear() === parseInt(jahr) &&
      tx.waehrung === hauptSymbol
    )
    .sort((a, b) => new Date(a.datum) - new Date(b.datum));

  const anfangsBestand = Math.max(
    0,
    transaktionen
      .filter(
        (tx) =>
          new Date(tx.datum) < new Date(`${jahr}-01-01`) &&
          tx.waehrung === hauptSymbol
      )
      .reduce(
        (s, tx) =>
          s + (tx.typ === "eingang" ? parseFloat(tx.betrag) : -parseFloat(tx.betrag)),
        0
      )
  );

  const endBestand   = Math.max(0, fifo.restBestand);
  const steuerwert   = parseFloat((endBestand * (aktuellerKurs || 0)).toFixed(2));
  const creationDate = new Date().toISOString().replace(/\.\d{3}Z$/, "");

  const paymentZeilen = txImJahr.map((tx) => {
    const datum   = tx.datum.split("T")[0];
    const menge   = parseFloat(tx.betrag) || 0;
    const chfWert = (tx.chfZeitpunkt || 0).toFixed(2);
    return `      <payment
        paymentDate="${datum}"
        quotationType="PIECE"
        quantity="${formatKrypto(menge)}"
        amountCurrency="CHF"
        amount="${chfWert}"
        grossRevenueA="0"
        grossRevenueB="0"
        withHoldingTaxClaim="0"/>`;
  });

  let laufenderBestand = anfangsBestand;
  const stockZeilen = [
    `      <stock
        referenceDate="${jahr}-01-01"
        mutation="false"
        quotationType="PIECE"
        quantity="${formatKrypto(laufenderBestand)}"
        balanceCurrency="CHF"
        value="0"/>`,
  ];
  for (const tx of txImJahr) {
    const datum  = tx.datum.split("T")[0];
    const delta  = parseFloat(tx.betrag) || 0;
    const sign   = tx.typ === "eingang" ? "+" : "-";
    const chfVal = (tx.chfZeitpunkt || 0).toFixed(2);
    laufenderBestand += tx.typ === "eingang" ? delta : -delta;
    stockZeilen.push(
      `      <stock
        referenceDate="${datum}"
        mutation="true"
        quotationType="PIECE"
        quantity="${sign}${formatKrypto(delta)}"
        balanceCurrency="CHF"
        value="${chfVal}"/>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<taxStatementType
  xmlns="urn:ech:xmlns:eCH-0196:2"
  id="${randomUUID()}"
  creationDate="${creationDate}"
  taxPeriod="${jahr}"
  periodFrom="${jahr}-01-01"
  periodTo="${jahr}-12-31"
  country="CH"
  canton="${kt}"
  totalTaxValue="${steuerwert.toFixed(2)}"
  totalGrossRevenueA="0"
  totalGrossRevenueB="0"
  totalWithHoldingTaxClaim="0"
  minorVersion="22">

  <institution>
    <name>btcSteuerauszug.ch</name>
  </institution>

  <client clientNumber="${adresse.substring(0, 50)}"/>

  <listOfSecurities
    totalTaxValue="${steuerwert.toFixed(2)}"
    totalGrossRevenueA="0"
    totalGrossRevenueB="0"
    totalWithHoldingTaxClaim="0"
    totalLumpSumTaxCredit="0"
    totalNonRecoverableTax="0"
    totalAdditionalWithHoldingTaxUSA="0"
    totalGrossRevenueIUP="0"
    totalGrossRevenueConversion="0">

    <depot depotNumber="${adresse.substring(0, 50)}">

      <security
        positionId="1"
        country="CH"
        currency="CHF"
        quotationType="PIECE"
        securityCategory="CRYPTO"
        securityName="${valoren.name}"
        valorNumber="${valoren.nummer}">

        <taxValue
          referenceDate="${jahr}-12-31"
          quotationType="PIECE"
          quantity="${formatKrypto(endBestand)}"
          balanceCurrency="CHF"
          unitPrice="${(aktuellerKurs || 0).toFixed(2)}"
          value="${steuerwert.toFixed(2)}"/>

${paymentZeilen.join("\n")}

${stockZeilen.join("\n")}

      </security>
    </depot>
  </listOfSecurities>

</taxStatementType>`;
}

// komprimiereUndChunkXml: entfernt – ersetzt durch lib/barcode.js generateAllBarcodes
// (scale=4, eclevel=2, rohe UTF-8-Chunks à 800 Bytes, kein deflate/base64)

// ─── Seiten-Header zeichnen ──────────────────────────────────────────────────
function zeichneSeiteHeader(seite, schriften, seitenNr, gesamtSeiten, jahr, barcodeValorNr, kundenInfo) {
  const { bold, normal } = schriften;
  const { width: pageW, height: pageH } = seite.getSize();
  const contentL = L;  // = CONTENT_LEFT = 73pt (nach Barcode-Bereich)

  const DUNKEL     = rgb(0.067, 0.094, 0.153);
  const HELLGRAU   = rgb(0.95, 0.95, 0.95);
  const GRAU       = rgb(0.4, 0.4, 0.4);
  const ETH_BLUE   = rgb(0.384, 0.494, 0.918);
  const SOL_PURPLE = rgb(0.600, 0.271, 1.000);

  // CODE128C Seitenbarcode oben links (pure pdf-lib Rechtecke, kein bwip-js)
  drawSeitenbarcode(seite, normal, {
    valorennummer: barcodeValorNr,
    jahr:          parseInt(jahr),
    seite:         seitenNr,
    gesamtseiten:  gesamtSeiten,
  });

  // Logo oben links — Tri-Color b(orange)/t(blau)/c(violett)
  const ORANGE_H = rgb(0.969, 0.576, 0.102);
  let hx = contentL;
  const HS = 13;
  seite.drawText("b", { x: hx, y: pageH - 24, size: HS, font: bold, color: ORANGE_H });
  hx += bold.widthOfTextAtSize("b", HS);
  seite.drawText("t", { x: hx, y: pageH - 24, size: HS, font: bold, color: ETH_BLUE });
  hx += bold.widthOfTextAtSize("t", HS);
  seite.drawText("c", { x: hx, y: pageH - 24, size: HS, font: bold, color: SOL_PURPLE });
  hx += bold.widthOfTextAtSize("c", HS);
  seite.drawText("Steuerauszug.ch", { x: hx, y: pageH - 24, size: HS, font: bold, color: DUNKEL });
  seite.drawText(`Steuerauszug in CHF 31.12.${jahr}`, {
    x: contentL, y: pageH - 40, size: 9, font: normal, color: GRAU,
  });

  // Kunden-Info-Box oben rechts (dynamische Höhe je nach Adresse)
  const kundeAnzeige = (kundenInfo.vorname || kundenInfo.nachname)
    ? `${kundenInfo.vorname || ""} ${kundenInfo.nachname || ""}`.trim()
    : "Kunde";
  const kdnr = kundenInfo.adresseWallet
    ? `${kundenInfo.adresseWallet.substring(0, 8)}...${kundenInfo.adresseWallet.slice(-4)}`
    : "";

  const hatAdresse = !!(kundenInfo.adresseStr || kundenInfo.plz || kundenInfo.ort);

  const infoZeilen = [
    ["Kunde",       kundeAnzeige],
    ["Kdnr.",       kdnr],
    ...(hatAdresse ? [
      ["Adresse",   kundenInfo.adresseStr || ""],
      ["",          `${kundenInfo.plz || ""} ${kundenInfo.ort || ""}`.trim()],
    ] : []),
    ["Periode",     `01.01.${jahr} - 31.12.${jahr}`],
    ["Erstellt am", new Date().toLocaleDateString("de-CH")],
    ["Kanton",      kundenInfo.kanton || "ZH"],
  ];

  const BOX_W = 235;
  const BOX_X = pageW - R - BOX_W;
  const BOX_H = 6 + infoZeilen.length * 12;
  const BOX_Y = pageH - 12 - BOX_H;

  seite.drawRectangle({
    x: BOX_X, y: BOX_Y, width: BOX_W, height: BOX_H,
    color: HELLGRAU,
    borderColor: rgb(0.87, 0.87, 0.87),
    borderWidth: 0.5,
  });

  let infoY = BOX_Y + BOX_H - 10;
  for (const [label, wert] of infoZeilen) {
    seite.drawText(label, {
      x: BOX_X + 6, y: infoY, size: 7.5, font: bold, color: DUNKEL,
    });
    seite.drawText(kuerzeText(wert, 28), {
      x: BOX_X + 70, y: infoY, size: 7.5, font: normal, color: GRAU,
    });
    infoY -= 12;
  }

  // Trennlinie unter Header (dynamisch, 5pt unter Box-Unterkante)
  seite.drawLine({
    start: { x: contentL, y: BOX_Y - 5 }, end: { x: pageW - R, y: BOX_Y - 5 },
    thickness: 0.75, color: rgb(0.8, 0.8, 0.8),
  });

  // Footer
  seite.drawLine({
    start: { x: contentL, y: 25 }, end: { x: pageW - R, y: 25 },
    thickness: 0.4, color: rgb(0.88, 0.88, 0.88),
  });
  // Footer Logo — Tri-Color b(orange)/t(blau)/c(violett)
  const FGRAU = rgb(0.6, 0.6, 0.6);
  let fx = contentL;
  const FS = 7.5;
  seite.drawText("b", { x: fx, y: 13, size: FS, font: normal, color: rgb(0.969, 0.576, 0.102) });
  fx += normal.widthOfTextAtSize("b", FS);
  seite.drawText("t", { x: fx, y: 13, size: FS, font: normal, color: ETH_BLUE });
  fx += normal.widthOfTextAtSize("t", FS);
  seite.drawText("c", { x: fx, y: 13, size: FS, font: normal, color: SOL_PURPLE });
  fx += normal.widthOfTextAtSize("c", FS);
  seite.drawText("Steuerauszug.ch", { x: fx, y: 13, size: FS, font: normal, color: FGRAU });
  const seitenText = `Seite ${seitenNr} von ${gesamtSeiten}`;
  const sW = normal.widthOfTextAtSize(seitenText, 7.5);
  seite.drawText(seitenText, {
    x: pageW - R - sW, y: 13, size: 7.5, font: normal, color: rgb(0.6, 0.6, 0.6),
  });
}

// ─── POST Handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const {
      transaktionen, adresse, blockchain, jahr,
      aktuellerKurs, tokenKurse, kanton, kundenDaten,
      kurs3112: kurs3112Extern,  // pre-calculated from analyze (konsistente Quelle)
    } = await request.json();

    // tokenKurse: { ETH: 2500, LINK: 8.5, VNXAU: 45, ... } – von Dashboard mitgeschickt
    const alleTokenKurse = typeof tokenKurse === "object" && tokenKurse ? tokenKurse : {};

    console.log("[Steuerauszug] Start:", { blockchain, jahr, anzahlTx: transaktionen?.length });

    if (!transaktionen || !adresse || !blockchain || !jahr) {
      return NextResponse.json({ error: "Fehlende Parameter" }, { status: 400 });
    }

    const kursWert = typeof aktuellerKurs === "object"
      ? Object.values(aktuellerKurs)[0] || 0
      : aktuellerKurs || 0;

    // Hauptsymbol ermitteln – bei CSV aus häufigster Transaktionswährung
    let hauptSymbol;
    if (blockchain === "bitcoin") hauptSymbol = "BTC";
    else if (blockchain === "ethereum") hauptSymbol = "ETH";
    else if (blockchain === "solana") hauptSymbol = "SOL";
    else {
      // CSV-Import: häufigste Währung aus den Transaktionen
      const haeufigkeit = {};
      for (const tx of transaktionen) {
        haeufigkeit[tx.waehrung] = (haeufigkeit[tx.waehrung] || 0) + 1;
      }
      hauptSymbol = Object.entries(haeufigkeit).sort((a, b) => b[1] - a[1])[0]?.[0] || "BTC";
    }

    // Jahresschlusskurs 31.12. holen (für Steuerwert – nicht live-Kurs!)
    // Verwende lib/price-service.js – DIESELBE Quelle wie analyze/route.js → konsistente Kurse!
    const { isAbgeschlossen, stichtagDatum, isLaufend } = getJahresStatus(parseInt(jahr));
    const jahresendDatum = stichtagDatum; // 31.12. für abgeschlossene Jahre, heute für laufende

    let jahresendKurs;
    if (kurs3112Extern && kurs3112Extern > 0) {
      // Aus Frontend übergeben (von analyze berechnet) → direkt verwenden
      jahresendKurs = kurs3112Extern;
      console.log("[Steuerauszug] Jahresschlusskurs aus Frontend:", jahresendKurs, "(kurs3112)");
    } else {
      // Selbst holen via price-service.js (gleiche Kaskade wie analyze)
      const coinGeckoId = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana" }[hauptSymbol] || "bitcoin";
      const priceResult = await getHistoricalPriceChf(coinGeckoId, jahresendDatum);
      const jahresendKursRoh = priceResult?.price > 0 ? priceResult.price : null;
      jahresendKurs = jahresendKursRoh ?? (isLaufend ? kursWert : null);

      if (!jahresendKurs || jahresendKurs <= 0) {
        return NextResponse.json(
          { error: `Kein historischer CHF-Kurs verfügbar für ${jahresendDatum}. Bitte später erneut versuchen.` },
          { status: 503 }
        );
      }
      console.log("[Steuerauszug] Jahresschlusskurs", hauptSymbol, jahresendDatum, ":", jahresendKurs,
        `(${priceResult?.source || "live"})`);
    }
    const valoren = Object.values(VALOREN).find((v) => v.symbol === hauptSymbol)
      || VALOREN[blockchain]
      || VALOREN.bitcoin;
    const kt          = kanton || "ZH";

    // Kundendaten aufbereiten
    const kundenInfo = {
      vorname:       kundenDaten?.vorname  || "",
      nachname:      kundenDaten?.nachname || "",
      adresseStr:    kundenDaten?.adresse  || "",
      plz:           kundenDaten?.plz      || "",
      ort:           kundenDaten?.ort      || "",
      kanton:        kt,
      adresseWallet: adresse,
    };

    // START_Y: Content-Start unter der Info-Box (dynamisch je nach Adresse)
    const hatAdresseInInfo = !!(kundenInfo.adresseStr || kundenInfo.plz || kundenInfo.ort);
    const START_Y = H - (hatAdresseInInfo ? 115 : 95);

    // txImJahr: alle Transaktionen im Jahr (alle Währungen, für S.2 und Seitenzahl-Schätzung)
    const txImJahr = transaktionen.filter(
      (tx) => new Date(tx.datum).getFullYear() === parseInt(jahr)
    );

    // FIFO: nur Transaktionen BIS Jahresende (31.12.) – keine Folgejahr-Käufe!
    const jahresendeFilter = new Date(`${jahr}-12-31T23:59:59Z`);
    const fifoGesamt = berechneFifo(
      transaktionen.filter((tx) =>
        tx.waehrung === hauptSymbol &&
        new Date(tx.datum) <= jahresendeFilter
      ),
      jahresendKurs
    );
    const endbestandHauptsymbol = Math.max(0, fifoGesamt.restBestand);

    // Steuerwert EINMAL berechnen – wird in PDF S.1, S.2 UND XML identisch verwendet
    const steuerwertHauptsymbol = Math.round(endbestandHauptsymbol * jahresendKurs * 100) / 100;

    // Transaktionen im Jahr für XML und Tabelle
    const txImJahrHauptsymbol = transaktionen.filter(
      (tx) => tx.waehrung === hauptSymbol &&
              new Date(tx.datum).getFullYear() === parseInt(jahr)
    );

    // Anfangsbestand aus Transaktionen vor diesem Jahr
    const txVorJahr = transaktionen
      .filter((tx) => tx.waehrung === hauptSymbol && new Date(tx.datum) < new Date(`${jahr}-01-01`))
      .sort((a, b) => new Date(a.datum) - new Date(b.datum));
    let anfangsbestandQueue = [];
    for (const tx of txVorJahr) {
      const bet = parseFloat(tx.betrag) || 0;
      if (tx.typ === "eingang") anfangsbestandQueue.push(bet);
      else {
        let rest = bet;
        while (rest > 1e-10 && anfangsbestandQueue.length > 0) {
          if (anfangsbestandQueue[0] <= rest) { rest -= anfangsbestandQueue.shift(); }
          else { anfangsbestandQueue[0] -= rest; rest = 0; }
        }
      }
    }
    const anfangsbestandAmount = Math.max(0, anfangsbestandQueue.reduce((s, b) => s + b, 0));

    // eCH-0196 XML via lib/esteuerauszug.js (konsistent mit PDF-Werten)
    const xmlSteuerDaten = {
      wallets: Array.isArray(adresse) ? adresse : [adresse],
      taxYear: parseInt(jahr),
      canton: kt,
      totalSteuerwert: steuerwertHauptsymbol,
      stichtagDatum: jahresendDatum,
      assets: [{
        symbol: hauptSymbol,
        valorennummer: getValorennummer(hauptSymbol) || valoren.nummer,
        endbestand: endbestandHauptsymbol,
        kursStichtag: jahresendKurs,
        steuerwert: steuerwertHauptsymbol,
        positionId: 1,
        fifo: { anfangsbestandAmount },
        transaktionen: txImJahrHauptsymbol.map((tx) => ({
          date: tx.datum,
          type: tx.typ === "eingang" ? "in" : "out",
          amount: parseFloat(tx.betrag) || 0,
          chfKurs: parseFloat(tx.betrag) > 0 ? (tx.chfZeitpunkt || 0) / parseFloat(tx.betrag) : 0,
          chfWert: tx.chfZeitpunkt ?? 0,
        })),
      }],
    };
    const kundeXmlDaten = {
      name: [kundenInfo.vorname, kundenInfo.nachname].filter(Boolean).join(" ") || undefined,
      strasse: kundenInfo.adresseStr || undefined,
      plz: kundenInfo.plz || undefined,
      ort: kundenInfo.ort || undefined,
    };
    const xmlDaten = generateESteuerauszugXML(xmlSteuerDaten, kundeXmlDaten);

    // PDF417-Barcodes vorab generieren – Anzahl bestimmt Barcode-Seitenzahl (Multi-Wallet Fix)
    const BC_PER_ROW = 6;
    let barcodeObjekte = [];
    try {
      barcodeObjekte = await generateAllBarcodes(xmlDaten);
    } catch (e) {
      console.error("[PDF417] Generierung fehlgeschlagen:", e.message, "\n", e.stack);
    }
    console.log("[Steuerauszug] Barcodes generiert:", barcodeObjekte.length);

    // PDF vorbereiten
    const pdf    = await PDFDocument.create();
    const bold   = await pdf.embedFont(StandardFonts.HelveticaBold);
    const normal = await pdf.embedFont(StandardFonts.Helvetica);
    const mono   = await pdf.embedFont(StandardFonts.Courier);
    const schriften = { bold, normal, mono };

    // Farben
    const DUNKEL    = rgb(0.067, 0.094, 0.153);
    const GRAU      = rgb(0.4, 0.4, 0.4);
    const HELLGRAU  = rgb(0.95, 0.95, 0.95);
    const MITTELGRAU = rgb(0.84, 0.84, 0.84);
    const GRUEN     = rgb(0, 0.588, 0);
    const ROT       = rgb(0.784, 0, 0);
    const WEISS     = rgb(1, 1, 1);
    const NAVY      = rgb(0.18, 0.26, 0.42);

    // Coins im Jahr ermitteln (für Seitenzahl-Schätzung)
    const coinsImJahr = [...new Set(txImJahr.map((tx) => tx.waehrung))];
    const extraZeilen = coinsImJahr.length * 3; // Header + Subtotal + Abstand
    const txSeitenAnz  = Math.max(1, Math.ceil((txImJahr.length + extraZeilen) / 26));
    const gesamtSeiten = 1 + txSeitenAnz + 1;  // immer 1 Barcode-Seite (2-Zeilen-Grid)

    // Barcode-Valorennummer für Seitenbarcode ermitteln
    const barcodeValorNr = getValorennummer(hauptSymbol) || valoren.nummer || "3841927";

    // Steuerwert berechnen – alle Coins summieren (ETH + ERC-20 + SPL)
    // WICHTIG: IMMER jahresendeFilter anwenden (Folgejahr-Käufe NICHT einrechnen!)
    // Für hauptSymbol: historischer Jahresschlusskurs; Nebenwährungen: live-Kurse aus Dashboard
    const alleCoins = [...new Set(transaktionen.map((tx) => tx.waehrung))];
    const steuerwertGesamt = parseFloat(
      alleCoins.reduce((sum, sym) => {
        const kurs = sym === hauptSymbol ? jahresendKurs : (alleTokenKurse[sym] ?? 0);
        if (!kurs) return sum;
        const coinFifo = berechneFifo(
          transaktionen.filter((tx) =>
            tx.waehrung === sym && new Date(tx.datum) <= jahresendeFilter  // ← BUG FIX: Folgejahr ausschliessen
          ),
          kurs
        );
        return sum + coinFifo.restBestand * kurs;
      }, 0).toFixed(2)
    );

    // ═══════════════════════════════════════════════════════════════════════
    // SEITE 1: ZUSAMMENFASSUNG
    // ═══════════════════════════════════════════════════════════════════════
    const s1 = pdf.addPage([W, H]);
    zeichneSeiteHeader(s1, schriften, 1, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
    let y = START_Y;

    // Titel
    s1.drawText(`Steuerauszug Kryptow\u00e4hrungen ${jahr}`, {
      x: L, y, size: 16, font: bold, color: DUNKEL,
    });
    y -= 18;
    s1.drawText("Zusammenfassung", {
      x: L, y, size: 9, font: normal, color: GRAU,
    });
    y -= 22;

    // 4-Spalten-Box (Steuerwert + Brutt.A + Brutt.B + VSt.)
    const BOX_H_4SP = 85;
    const spalteBreite = IW / 4;

    s1.drawRectangle({
      x: L, y: y - BOX_H_4SP, width: IW, height: BOX_H_4SP,
      color: HELLGRAU, borderColor: MITTELGRAU, borderWidth: 0.5,
    });

    // Vertikale Trennlinien zwischen Spalten
    for (let i = 1; i < 4; i++) {
      s1.drawLine({
        start: { x: L + i * spalteBreite, y: y - BOX_H_4SP },
        end:   { x: L + i * spalteBreite, y },
        thickness: 0.5, color: MITTELGRAU,
      });
    }

    const spaltenDaten = [
      {
        label1: `Steuerwert der Krypto-Assets`,
        label2: isLaufend ? `Stand ${new Date().toLocaleDateString("de-CH")}` : `am 31.12.${jahr}`,
        wert:   formatCHF(steuerwertGesamt),
        gross:  true,
        farbe:  DUNKEL,
      },
      {
        label1: `Bruttoertrag ${jahr} Rubrik A`,
        label2: "(mit VSt.-Abzug)",
        wert:   "CHF 0.00",
        gross:  false,
        farbe:  GRAU,
      },
      {
        label1: `Bruttoertrag ${jahr} Rubrik B`,
        label2: "(ohne VSt.-Abzug)",
        wert:   "CHF 0.00",
        gross:  false,
        farbe:  GRAU,
      },
      {
        label1: "Verrechnungssteuer-",
        label2: "anspruch",
        wert:   "CHF 0.00",
        gross:  false,
        farbe:  GRAU,
      },
    ];

    for (let i = 0; i < 4; i++) {
      const sp   = spaltenDaten[i];
      const spX  = L + i * spalteBreite + 8;
      const spW  = spalteBreite - 16;

      s1.drawText(sp.label1, {
        x: spX, y: y - 14, size: 7.5, font: normal, color: GRAU,
      });
      s1.drawText(sp.label2, {
        x: spX, y: y - 25, size: 7.5, font: normal, color: GRAU,
      });

      // Wert (unten in der Box, rechts ausgerichtet)
      const sz     = sp.gross ? 13 : 10;
      const f      = sp.gross ? bold : normal;
      const wertW  = f.widthOfTextAtSize(sp.wert, sz);
      const wertX  = Math.min(spX + spW - wertW, spX + spW - 2);
      s1.drawText(sp.wert, {
        x: Math.max(spX, wertX), y: y - BOX_H_4SP + 12,
        size: sz, font: f, color: sp.farbe,
      });
    }
    y -= BOX_H_4SP + 10;

    // Hinweis-Box
    const HINWEIS_H = 34;
    s1.drawRectangle({
      x: L, y: y - HINWEIS_H, width: IW, height: HINWEIS_H,
      color: rgb(0.99, 0.98, 0.93),
      borderColor: rgb(0.84, 0.80, 0.55), borderWidth: 0.5,
    });
    s1.drawText("Werte f\u00fcr Formular 'Wertschriften- und Guthabenverzeichnis'", {
      x: L + 8, y: y - 12, size: 7.5, font: bold, color: rgb(0.35, 0.30, 0.0),
    });
    s1.drawText("(1) Davon Rubrik A CHF 0.00 und Rubrik B CHF 0.00", {
      x: L + 8, y: y - 24, size: 7.5, font: normal, color: GRAU,
    });
    y -= HINWEIS_H + 10;

    // Total-Leiste (dunkel)
    const TOTAL_H = 22;
    s1.drawRectangle({ x: L, y: y - TOTAL_H, width: IW, height: TOTAL_H, color: DUNKEL });

    const totalSpalten = [
      { lbl: "Total Steuerwert",     wert: formatCHF(steuerwertGesamt) },
      { lbl: "Total Bruttoertrag A", wert: "CHF 0.00" },
      { lbl: "Total Bruttoertrag B", wert: "CHF 0.00" },
      { lbl: "Total Brutt. A+B",     wert: "CHF 0.00" },
    ];
    for (let i = 0; i < 4; i++) {
      const ts  = totalSpalten[i];
      const tsX = L + i * spalteBreite + 8;
      s1.drawText(ts.lbl, {
        x: tsX, y: y - 8, size: 6.5, font: normal, color: rgb(0.75, 0.75, 0.75),
      });
      s1.drawText(ts.wert, {
        x: tsX, y: y - TOTAL_H + 7, size: 8, font: bold, color: WEISS,
      });
    }
    y -= TOTAL_H + 14;

    // Standard-Info-Box
    const INFO_H = 56;
    s1.drawRectangle({
      x: L, y: y - INFO_H, width: IW, height: INFO_H,
      color: HELLGRAU, borderColor: MITTELGRAU, borderWidth: 0.5,
    });
    const infoZeilenS1 = [
      ["Standard:",      "eCH-0270 / eCH-0196 v2.2.0 . minorVersion=22"],
      ["Valorennummer:", `${valoren.nummer} (${valoren.name} - ${valoren.symbol})`],
      ["Wallet-Adresse:", kuerzeText(adresse, 72)],
      ["Kanton:",        kt],
    ];
    let infoY = y - 11;
    for (const [lbl, val] of infoZeilenS1) {
      s1.drawText(lbl, { x: L + 8, y: infoY, size: 8, font: bold,   color: DUNKEL });
      s1.drawText(val, { x: L + 115, y: infoY, size: 8, font: normal, color: GRAU });
      infoY -= 13;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SEITE 2+: TRANSAKTIONEN GRUPPIERT NACH COIN
    // ═══════════════════════════════════════════════════════════════════════

    // Coins nach Hauptwährung zuerst, dann alphabetisch
    const coinGruppen = new Map();
    for (const tx of txImJahr) {
      if (!coinGruppen.has(tx.waehrung)) coinGruppen.set(tx.waehrung, []);
      coinGruppen.get(tx.waehrung).push(tx);
    }
    const coinReihenfolge = [
      ...(coinGruppen.has(hauptSymbol) ? [hauptSymbol] : []),
      ...[...coinGruppen.keys()].filter((c) => c !== hauptSymbol).sort(),
    ];
    // Chronologisch sortieren innerhalb jeder Gruppe
    for (const txs of coinGruppen.values()) {
      txs.sort((a, b) => new Date(a.datum) - new Date(b.datum));
    }

    let aktivSeite = pdf.addPage([W, H]);
    let seitenNr   = 2;
    zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
    y = START_Y + 2;

    // Seiten-Titel
    aktivSeite.drawText(`Krypto-Assets ${jahr}`, {
      x: L, y, size: 13, font: bold, color: DUNKEL,
    });
    y -= 15;
    aktivSeite.drawText("A-Werte / B-Werte", {
      x: L, y, size: 8.5, font: normal, color: GRAU,
    });
    y -= 16;

    // Tabellenkopf zeichnen
    const zeichneTabellenkopf = (seite) => {
      seite.drawRectangle({ x: L, y: y - 4, width: IW, height: 16, color: DUNKEL });
      for (const sp of TX_SPALTEN) {
        const tw = bold.widthOfTextAtSize(sp.lbl, 6.5);
        const tx = sp.rechts ? sp.x + sp.bw - tw - 2 : sp.x + 3;
        seite.drawText(sp.lbl, { x: tx, y: y + 1, size: 6.5, font: bold, color: WEISS });
      }
      y -= 18;
    };
    zeichneTabellenkopf(aktivSeite);

    // Gesamtsteuerwert aller Coins
    let gesamtSteuerwertTx = 0;

    for (const coinSym of coinReihenfolge) {
      const gruppe = coinGruppen.get(coinSym);
      if (!gruppe || gruppe.length === 0) continue;

      const coinValoren = Object.values(VALOREN).find((v) => v.symbol === coinSym)
        || { nummer: "-", name: coinSym, symbol: coinSym };

      // Jahresschlusskurs 31.12. für diesen Coin
      // Hauptsymbol: IMMER historischer Jahresschlusskurs (NIEMALS live-Kurs aus Dashboard)
      // Nebenwährungen: alleTokenKurse aus Dashboard (beste Näherung)
      const coinKurs = coinSym === hauptSymbol ? jahresendKurs : (alleTokenKurse[coinSym] ?? 0);

      // ── Coin-Header-Zeile ────────────────────────────────────────────────
      if (y < 60) {
        seitenNr++;
        aktivSeite = pdf.addPage([W, H]);
        zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
        y = START_Y + 2;
        zeichneTabellenkopf(aktivSeite);
      }

      aktivSeite.drawRectangle({
        x: L, y: y - 4, width: IW, height: 16, color: NAVY,
      });
      aktivSeite.drawText(
        `${coinValoren.nummer}  ${coinValoren.name} (${coinSym})`,
        { x: L + 4, y: y + 1, size: 7.5, font: bold, color: WEISS }
      );
      y -= 18;

      // ── Transaktionszeilen ───────────────────────────────────────────────
      // Endbestand via FIFO: alle Transaktionen BIS Jahresende (Vorjahre inkl., Folgejahr NICHT)
      const alleCoinTx = transaktionen.filter((tx) =>
        tx.waehrung === coinSym &&
        new Date(tx.datum) <= jahresendeFilter
      );
      const coinFifoGesamt = berechneFifo(alleCoinTx, coinKurs);

      for (let i = 0; i < gruppe.length; i++) {
        const tx = gruppe[i];

        if (y < 60) {
          seitenNr++;
          aktivSeite = pdf.addPage([W, H]);
          zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
          y = START_Y + 2;
          zeichneTabellenkopf(aktivSeite);
        }

        const betrag    = parseFloat(tx.betrag) || 0;
        const kursChf   = betrag > 0 ? (tx.chfZeitpunkt || 0) / betrag : 0;
        const istEingang = tx.typ === "eingang";

        const wertFarbe = istEingang ? GRUEN : ROT;

        if (i % 2 === 0) {
          aktivSeite.drawRectangle({
            x: L, y: y - 3, width: IW, height: 14, color: HELLGRAU,
          });
        }

        const steuerwertTx = tx.chfZeitpunkt != null ? tx.chfZeitpunkt : null;

        const zeileText = [
          { sp: TX_SPALTEN[0],  text: coinValoren.nummer },
          { sp: TX_SPALTEN[1],  text: formatDatum(tx.datum) },
          { sp: TX_SPALTEN[2],  text: istEingang ? "BUY / EINGANG" : "SELL / AUSGANG", farbe: wertFarbe, fett: true },
          { sp: TX_SPALTEN[3],  text: (istEingang ? "+" : "-") + formatKrypto(betrag, 8), farbe: wertFarbe },
          { sp: TX_SPALTEN[4],  text: coinSym },
          { sp: TX_SPALTEN[5],  text: kursChf > 0 ? formatCHF(kursChf) : "-" },
          { sp: TX_SPALTEN[6],  text: "" },
          { sp: TX_SPALTEN[7],  text: kursChf > 0 ? formatCHF(kursChf) : "-" },
          { sp: TX_SPALTEN[8],  text: steuerwertTx != null ? formatCHF(steuerwertTx) : "n.v." },
          { sp: TX_SPALTEN[9],  text: "CHF 0.00" },
          { sp: TX_SPALTEN[10], text: "CHF 0.00" },
        ];

        for (const { sp, text, farbe: zf, fett } of zeileText) {
          if (!text) continue;
          const f  = fett ? bold : normal;
          const sz = 7;
          const tw = f.widthOfTextAtSize(text, sz);
          const tx2 = sp.rechts ? sp.x + sp.bw - tw - 2 : sp.x + 3;
          aktivSeite.drawText(text, {
            x: tx2, y: y + 1, size: sz, font: f, color: zf || DUNKEL,
          });
        }
        y -= 14;
      }

      // ── Coin-Subtotal-Zeile (31.12.) ─────────────────────────────────────
      if (y < 60) {
        seitenNr++;
        aktivSeite = pdf.addPage([W, H]);
        zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
        y = START_Y + 2;
        zeichneTabellenkopf(aktivSeite);
      }

      // Endbestand aus FIFO über ALLE Transaktionen (korrekte historische Balance)
      const coinEndBestand   = Math.max(0, coinFifoGesamt.restBestand);
      const coinSteuerwert   = coinEndBestand * coinKurs;
      gesamtSteuerwertTx    += coinSteuerwert;

      aktivSeite.drawRectangle({
        x: L, y: y - 3, width: IW, height: 14, color: rgb(0.88, 0.91, 0.96),
      });

      const subTotalFelder = [
        { sp: TX_SPALTEN[1],  text: `31.12.${jahr}` },
        { sp: TX_SPALTEN[2],  text: "Bestand / Steuerwert" },
        { sp: TX_SPALTEN[3],  text: formatKrypto(coinEndBestand, 8) },
        { sp: TX_SPALTEN[4],  text: coinSym },
        { sp: TX_SPALTEN[7],  text: formatCHF(coinKurs) },
        { sp: TX_SPALTEN[8],  text: formatCHF(coinSteuerwert) },
        { sp: TX_SPALTEN[9],  text: "CHF 0.00" },
        { sp: TX_SPALTEN[10], text: "CHF 0.00" },
      ];
      for (const { sp, text } of subTotalFelder) {
        const tw = bold.widthOfTextAtSize(text, 7);
        const x  = sp.rechts ? sp.x + sp.bw - tw - 2 : sp.x + 3;
        aktivSeite.drawText(text, { x, y: y + 1, size: 7, font: bold, color: DUNKEL });
      }
      y -= 18;
    }

    // ── Gesamttotal-Zeile ─────────────────────────────────────────────────
    if (y < 60) {
      seitenNr++;
      aktivSeite = pdf.addPage([W, H]);
      zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
      y = START_Y + 2;
    }

    aktivSeite.drawRectangle({
      x: L, y: y - 4, width: IW, height: 18, color: DUNKEL,
    });
    aktivSeite.drawText("Total Krypto-Assets", {
      x: L + 4, y: y + 2, size: 8.5, font: bold, color: WEISS,
    });
    const totalStW = bold.widthOfTextAtSize(formatCHF(gesamtSteuerwertTx), 8.5);
    aktivSeite.drawText(formatCHF(gesamtSteuerwertTx), {
      x: TX_SPALTEN[8].x + TX_SPALTEN[8].bw - totalStW - 2,
      y: y + 2, size: 8.5, font: bold, color: WEISS,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BARCODE-SEITE: eCH-0196 v2.2.0 – 2-Zeilen-Grid, immer eine einzige Seite
    // ≤6 Barcodes: 1 Zeile, volle Höhe; 7–12 Barcodes: 2 Zeilen, halbe Höhe
    // ═══════════════════════════════════════════════════════════════════════
    const BC_GAP_H    = 8;   // horizontaler Abstand zwischen Barcodes (pt)
    const BARCODE_GAP_Y = 24;  // vertikaler Abstand zwischen Zeilen (pt, inkl. Label-Raum)
    const sbL  = L;
    const sbIW = IW;

    const sB = pdf.addPage([W, H]);
    zeichneSeiteHeader(sB, schriften, gesamtSeiten, gesamtSeiten, jahr, barcodeValorNr, kundenInfo);
    y = START_Y;

    sB.drawText("Barcode-Bl\u00e4tter", {
      x: sbL, y, size: 11, font: bold, color: DUNKEL,
    });
    y -= 14;
    sB.drawText("eCH-0196 v2.2.0 \u00b7 taxStatementType", {
      x: sbL, y, size: 8, font: normal, color: GRAU,
    });
    y -= 20;

    // Dynamische Barcode-Höhe: bei ≤6 volle Höhe, bei 7–12 halbierte Höhe für 2 Zeilen
    const needsTwoRows = barcodeObjekte.length > BC_PER_ROW;
    const FOOTER_RESERVE = 35;  // pt – Footer + Puffer
    const availableH = y - FOOTER_RESERVE;
    const barcodeH = needsTwoRows
      ? Math.floor((availableH - BARCODE_GAP_Y) / 2)
      : Math.min(BC_ON_PAGE_H_PT, availableH);

    // Barcode-Grid: BC_PER_ROW Spalten × max. 2 Zeilen, Hochformat via 90°-Rotation
    if (barcodeObjekte.length > 0) {
      for (let b = 0; b < barcodeObjekte.length; b++) {
        const { png, label } = barcodeObjekte[b];
        const col = b % BC_PER_ROW;
        const row = Math.floor(b / BC_PER_ROW);
        const bX  = sbL + col * (BC_ON_PAGE_W_PT + BC_GAP_H);
        const bY  = y - row * (barcodeH + BARCODE_GAP_Y) - barcodeH;  // untere Kante

        try {
          const bImg = await pdf.embedPng(png);
          // Querformat-PNG 90° CCW drehen → Hochformat auf Seite
          // Anker: bX + BC_ON_PAGE_W_PT, sodass linke Kante bei bX landet
          sB.drawImage(bImg, {
            x:      bX + BC_ON_PAGE_W_PT,
            y:      bY,
            width:  barcodeH,           // dynamisch statt BC_ON_PAGE_H_PT
            height: BC_ON_PAGE_W_PT,
            rotate: degrees(90),
          });

          const nrW    = bold.widthOfTextAtSize(label, 7.5);
          const labelY = bY - 10;
          if (labelY > 28) {  // Label nur zeichnen wenn über Footer-Bereich
            sB.drawText(label, {
              x:    bX + BC_ON_PAGE_W_PT / 2 - nrW / 2,
              y:    labelY,
              size: 7.5, font: bold, color: DUNKEL,
            });
          }
        } catch {}
      }
      const rowsDrawn = needsTwoRows ? 2 : 1;
      y -= rowsDrawn * barcodeH + (rowsDrawn - 1) * BARCODE_GAP_Y + 14;
    } else {
      // Fallback: Fehler-Hinweis
      sB.drawRectangle({
        x: sbL, y: y - 40, width: sbIW, height: 40,
        color: rgb(0.96, 0.94, 0.94),
      });
      sB.drawText("Barcode konnte nicht generiert werden - XML-Vorschau unten", {
        x: sbL + 8, y: y - 20, size: 8, font: normal, color: ROT,
      });
      y -= 54;
    }

    // XML-Vorschau (erste ~25 Zeilen, auf der Barcode-Seite)
    if (y > 85) {
      sB.drawLine({
        start: { x: sbL, y: y - 2 }, end: { x: W - R, y: y - 2 },
        thickness: 0.4, color: MITTELGRAU,
      });
      y -= 12;
      sB.drawText("XML-Vorschau (eCH-0196 v2.2.0 \u00b7 taxStatementType):", {
        x: sbL, y, size: 7.5, font: bold, color: DUNKEL,
      });
      y -= 11;

      const xmlZeilen = xmlDaten.split("\n");
      for (const zeile of xmlZeilen.slice(0, 28)) {
        if (y < 35) break;
        sB.drawText(kuerzeText(zeile.replace(/\t/g, "  "), 140), {
          x: sbL, y, size: 6, font: mono, color: GRAU,
        });
        y -= 8;
      }
      if (xmlZeilen.length > 28 && y >= 35) {
        sB.drawText("... (vollst\u00e4ndiges XML im Barcode oben)", {
          x: sbL, y, size: 6, font: mono, color: rgb(0.6, 0.5, 0.1),
        });
      }
    }

    // PDF speichern
    const pdfBytes = await pdf.save();
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="esteuerauszug-${blockchain}-${jahr}.pdf"`,
      },
    });
  } catch (fehler) {
    console.error("[PDF] eSteuerauszug Fehler:", fehler);
    return NextResponse.json(
      { error: "Fehler beim Generieren des eSteuerauszugs: " + fehler.message },
      { status: 500 }
    );
  }
}
