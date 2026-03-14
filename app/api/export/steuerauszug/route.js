import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import bwipjs from "bwip-js";
import { randomUUID } from "crypto";
import { getHistoricalPriceChf } from "../../../../lib/price-service";
import { formatCHF, formatDatum, formatKrypto, kuerzeText } from "../../../../lib/formatters";
import { getJahresStatus } from "../../../../lib/jahres-utils";
import { generateESteuerauszugXML } from "../../../../lib/esteuerauszug";
import { getValorennummer } from "../../../../lib/valorennummern";
import { buildCode128CContent } from "../../../../lib/barcode-utils";
import { generateAllBarcodes } from "../../../../lib/barcode";

export const runtime     = "nodejs";       // bwip-js benötigt Node.js – kein Edge Runtime
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── Dimensionen A4 Querformat ────────────────────────────────────────────────
const W = 841.89;
const H = 595.28;
const BARCODE_X = 5;   // vertikaler Seitenbarcode: x-Position
const BARCODE_W = 24;  // vertikaler Seitenbarcode: Breite
const L = 34;          // linker Inhaltsrand (nach Barcode-Bereich)
const R = 36;          // rechter Rand
const IW = W - L - R;  // Inhaltsbreite ≈ 772pt

// ─── Valorennummern (ESTV Kursliste) ─────────────────────────────────────────
const VALOREN = {
  bitcoin:  { nummer: "3841927",  name: "Bitcoin",  symbol: "BTC" },
  ethereum: { nummer: "385539",   name: "Ethereum", symbol: "ETH" },
  solana:   { nummer: "81720700", name: "Solana",   symbol: "SOL" },
};

// ─── Spaltenbreiten Transaktions-Tabelle (Summe = IW = 772) ──────────────────
const TX_SPALTEN = [
  { lbl: "Valoren-Nr.",  bw: 54,  rechts: false },
  { lbl: "Datum",        bw: 66,  rechts: false },
  { lbl: "Bezeichnung",  bw: 116, rechts: false },
  { lbl: "Anzahl",       bw: 74,  rechts: true  },
  { lbl: "Whr.",         bw: 36,  rechts: false },
  { lbl: "Stückpreis",   bw: 80,  rechts: true  },
  { lbl: "Ex-Datum",     bw: 54,  rechts: false },
  { lbl: "Kurs",         bw: 72,  rechts: true  },
  { lbl: "Steuerwert",   bw: 84,  rechts: true  },
  { lbl: "Brutt. A",     bw: 64,  rechts: true  },
  { lbl: "Brutt. B",     bw: 72,  rechts: true  },
];
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
// (scale=4, eclevel=2, rohe UTF-8-Chunks à 1800 Bytes, kein deflate/base64)

// ─── Barcode PNG generieren (Callback-API bwip-js v4) ────────────────────────
function barcodePng(optionen) {
  return new Promise((resolve, reject) => {
    bwipjs.toBuffer(optionen, (err, png) => {
      if (err) reject(err);
      else resolve(png);
    });
  });
}

// ─── Vertikalen CODE128 Barcode vor-generieren + einbetten ───────────────────
async function vorbereitenBarcode(pdf, text) {
  try {
    const png = await barcodePng({
      bcid:         "code128",
      text,
      scale:        1,
      height:       200,
      includetext:  true,
      textsize:     5,
      rotate:       "L",      // 90° links = vertikal, Text liest von unten nach oben
      paddingwidth:  2,
      paddingheight: 2,
    });
    return await pdf.embedPng(png);
  } catch (e) {
    console.warn("[Barcode] Vorgenierung fehlgeschlagen:", e.message);
    return null;
  }
}

// ─── Seiten-Header zeichnen (synchron, Barcode bereits eingebettet) ──────────
function zeichneSeiteHeader(seite, schriften, seitenNr, gesamtSeiten, jahr, barcodeImg, kundenInfo) {
  const { bold, normal } = schriften;
  const DUNKEL   = rgb(0.067, 0.094, 0.153);
  const HELLGRAU = rgb(0.95, 0.95, 0.95);
  const GRAU     = rgb(0.4, 0.4, 0.4);

  // Vertikaler CODE128 Barcode links am Rand
  if (barcodeImg) {
    seite.drawImage(barcodeImg, {
      x: BARCODE_X, y: 10,
      width: BARCODE_W, height: H - 20,
    });
  }

  // Logo oben links
  seite.drawText("btcSteuerauszug.ch", {
    x: L, y: H - 24, size: 13, font: bold, color: DUNKEL,
  });
  seite.drawText(`Steuerauszug in CHF 31.12.${jahr}`, {
    x: L, y: H - 40, size: 9, font: normal, color: GRAU,
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
  const BOX_X = W - R - BOX_W;
  const BOX_H = 6 + infoZeilen.length * 12;
  const BOX_Y = H - 12 - BOX_H;

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
    start: { x: L, y: BOX_Y - 5 }, end: { x: W - R, y: BOX_Y - 5 },
    thickness: 0.75, color: rgb(0.8, 0.8, 0.8),
  });

  // Footer
  seite.drawLine({
    start: { x: L, y: 25 }, end: { x: W - R, y: 25 },
    thickness: 0.4, color: rgb(0.88, 0.88, 0.88),
  });
  seite.drawText("btcSteuerauszug.ch", {
    x: L, y: 13, size: 7.5, font: normal, color: rgb(0.6, 0.6, 0.6),
  });
  const seitenText = `Seite ${seitenNr} von ${gesamtSeiten}`;
  const sW = normal.widthOfTextAtSize(seitenText, 7.5);
  seite.drawText(seitenText, {
    x: W - R - sW, y: 13, size: 7.5, font: normal, color: rgb(0.6, 0.6, 0.6),
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
    const txSeitenAnz = Math.max(1, Math.ceil((txImJahr.length + extraZeilen) / 26));
    const gesamtSeiten = 1 + txSeitenAnz + 1;

    // Seitenbarcodes vor-generieren (einmal, dann wiederverwendet)
    // Inhalt: taxYear(4) + kantonNr(2) + valorennummer(7) + seitenNr(2) = 15 Stellen
    const barcodeSteuerDaten = { taxYear: parseInt(jahr), canton: kt };
    const [barcodeInhalt, barcodeSeite] = await Promise.all([
      vorbereitenBarcode(pdf, buildCode128CContent(barcodeSteuerDaten, 1)),
      vorbereitenBarcode(pdf, buildCode128CContent(barcodeSteuerDaten, gesamtSeiten)),
    ]);

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
    zeichneSeiteHeader(s1, schriften, 1, gesamtSeiten, jahr, barcodeInhalt, kundenInfo);
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
    zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeInhalt, kundenInfo);
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
        zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeInhalt, kundenInfo);
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
          zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeInhalt, kundenInfo);
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
        zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeInhalt, kundenInfo);
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
      zeichneSeiteHeader(aktivSeite, schriften, seitenNr, gesamtSeiten, jahr, barcodeInhalt, kundenInfo);
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
    // LETZTE SEITE: BARCODE-BLÄTTER
    // ═══════════════════════════════════════════════════════════════════════
    const sB = pdf.addPage([W, H]);
    zeichneSeiteHeader(sB, schriften, gesamtSeiten, gesamtSeiten, jahr, barcodeSeite, kundenInfo);
    y = START_Y;

    sB.drawText(`Steuerauszug Kryptow\u00e4hrungen ${jahr}`, {
      x: L, y, size: 14, font: bold, color: DUNKEL,
    });
    y -= 17;
    sB.drawText("Barcode-Bl\u00e4tter", {
      x: L, y, size: 9, font: normal, color: GRAU,
    });
    y -= 24;

    // PDF417-Barcodes via lib/barcode.js generieren
    // Rohes XML in 1800-Byte-UTF-8-Chunks, scale=4 (~300dpi), eclevel=2 (eCH-0270)
    let barcodeObjekte = [];
    try {
      barcodeObjekte = await generateAllBarcodes(xmlDaten);
    } catch (e) {
      console.error("[PDF417] Generierung fehlgeschlagen:", e.message, "\n", e.stack);
    }
    const anzahlChunks = barcodeObjekte.length;

    console.log("[Steuerauszug] Barcodes generiert:", anzahlChunks);

    // Barcode-Grid zeichnen (max 3 pro Zeile)
    if (barcodeObjekte.length > 0) {
      const COLS    = Math.min(3, barcodeObjekte.length);
      const ROWS    = Math.ceil(barcodeObjekte.length / COLS);
      const ZELLE_W = IW / COLS;
      const ZELLE_H = Math.min(140, (y - 90) / ROWS);

      for (let b = 0; b < barcodeObjekte.length; b++) {
        const { png, label } = barcodeObjekte[b];
        const col  = b % COLS;
        const row  = Math.floor(b / COLS);
        const zX   = L + col * ZELLE_W;
        const zY   = y - (row + 1) * ZELLE_H;

        try {
          const bImg   = await pdf.embedPng(png);
          const bScale = Math.min(
            (ZELLE_W - 20) / bImg.width,
            (ZELLE_H - 18) / bImg.height
          );
          const bW = bImg.width  * bScale;
          const bH = bImg.height * bScale;

          sB.drawImage(bImg, {
            x:      zX + (ZELLE_W - bW) / 2,
            y:      zY + (ZELLE_H - bH) / 2 + 8,
            width:  bW,
            height: bH,
          });

          const nrW = bold.widthOfTextAtSize(label, 7.5);
          sB.drawText(label, {
            x:    zX + (ZELLE_W - nrW) / 2,
            y:    zY + 2,
            size: 7.5, font: bold, color: DUNKEL,
          });
        } catch {}
      }
      y -= ROWS * ZELLE_H + 14;
    } else {
      // Fallback: Fehler-Hinweis
      sB.drawRectangle({
        x: L, y: y - 40, width: IW, height: 40,
        color: rgb(0.96, 0.94, 0.94),
      });
      sB.drawText("Barcode konnte nicht generiert werden - XML-Vorschau unten", {
        x: L + 8, y: y - 20, size: 8, font: normal, color: ROT,
      });
      y -= 54;
    }

    // XML-Vorschau (erste 25 Zeilen)
    if (y > 85) {
      sB.drawLine({
        start: { x: L, y: y - 2 }, end: { x: W - R, y: y - 2 },
        thickness: 0.4, color: MITTELGRAU,
      });
      y -= 12;
      sB.drawText("XML-Vorschau (eCH-0196 v2.2.0 . taxStatementType):", {
        x: L, y, size: 7.5, font: bold, color: DUNKEL,
      });
      y -= 11;

      const xmlZeilen = xmlDaten.split("\n");
      for (const zeile of xmlZeilen.slice(0, 28)) {
        if (y < 35) break;
        sB.drawText(kuerzeText(zeile.replace(/\t/g, "  "), 140), {
          x: L, y, size: 6, font: mono, color: GRAU,
        });
        y -= 8;
      }
      if (xmlZeilen.length > 28 && y >= 35) {
        sB.drawText("... (vollst\u00e4ndiges XML im Barcode oben)", {
          x: L, y, size: 6, font: mono, color: rgb(0.6, 0.5, 0.1),
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
