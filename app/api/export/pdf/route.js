import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { formatCHF, formatDatum, formatKrypto, kuerzeText } from "../../../../lib/formatters";
import { getHistoricalPriceChf } from "../../../../lib/price-service";
import { getJahresStatus } from "../../../../lib/jahres-utils";

export const runtime     = "nodejs";       // pdf-lib benötigt Node.js – kein Edge Runtime
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── FIFO-Berechnung ─────────────────────────────────────────────────────────
function berechneFifo(transaktionen, aktuellerKurs) {
  const sortiert = [...transaktionen].sort(
    (a, b) => new Date(a.datum) - new Date(b.datum)
  );
  const kaufWarteschlange = [];
  let realisierterGewinn = 0;

  for (const tx of sortiert) {
    const menge = parseFloat(tx.betrag) || 0;
    const kursChf =
      menge > 0 ? (tx.chfZeitpunkt || 0) / menge : tx.chfZeitpunkt || 0;

    if (tx.typ === "eingang") {
      kaufWarteschlange.push({ menge, kursChf });
    } else if (tx.typ === "ausgang") {
      let zuVerkaufen = menge;
      const verkaufsKurs = kursChf;
      while (zuVerkaufen > 1e-10 && kaufWarteschlange.length > 0) {
        const aeltesterKauf = kaufWarteschlange[0];
        if (aeltesterKauf.menge <= zuVerkaufen) {
          realisierterGewinn += (verkaufsKurs - aeltesterKauf.kursChf) * aeltesterKauf.menge;
          zuVerkaufen -= aeltesterKauf.menge;
          kaufWarteschlange.shift();
        } else {
          realisierterGewinn += (verkaufsKurs - aeltesterKauf.kursChf) * zuVerkaufen;
          aeltesterKauf.menge -= zuVerkaufen;
          zuVerkaufen = 0;
        }
      }
    }
  }

  const restBestand = kaufWarteschlange.reduce((s, k) => s + k.menge, 0);
  const kostenbasis = kaufWarteschlange.reduce((s, k) => s + k.menge * k.kursChf, 0);
  const unrealisierterGewinn = restBestand * (aktuellerKurs || 0) - kostenbasis;

  return { realisierterGewinn, unrealisierterGewinn, restBestand, kostenbasis };
}

// ─── Seitenvorlage zeichnen ──────────────────────────────────────────────────
function zeichneSeiteKopf(seite, schriftBold, schrift, seitenBreite, seitenHoehe, seitenNr, gesamtSeiten, Jahr) {
  const ORANGE     = rgb(0.969, 0.576, 0.102);
  const DUNKEL     = rgb(0.067, 0.094, 0.153);
  const ETH_BLUE   = rgb(0.384, 0.494, 0.918);
  const SOL_PURPLE = rgb(0.600, 0.271, 1.000);

  // Logo-Text: "btcSteuerauszug.ch" mit Tri-Color b(orange)/t(blau)/c(violett)
  const LOGO_X = 40;
  const LOGO_Y = seitenHoehe - 38;
  const LOGO_SIZE = 14;
  let lx = LOGO_X;
  seite.drawText("b", { x: lx, y: LOGO_Y, size: LOGO_SIZE, font: schriftBold, color: ORANGE });
  lx += schriftBold.widthOfTextAtSize("b", LOGO_SIZE);
  seite.drawText("t", { x: lx, y: LOGO_Y, size: LOGO_SIZE, font: schriftBold, color: ETH_BLUE });
  lx += schriftBold.widthOfTextAtSize("t", LOGO_SIZE);
  seite.drawText("c", { x: lx, y: LOGO_Y, size: LOGO_SIZE, font: schriftBold, color: SOL_PURPLE });
  lx += schriftBold.widthOfTextAtSize("c", LOGO_SIZE);
  seite.drawText("Steuerauszug.ch", { x: lx, y: LOGO_Y, size: LOGO_SIZE, font: schriftBold, color: DUNKEL });

  // Orangener Balken unter dem Logo
  seite.drawRectangle({
    x: 40,
    y: seitenHoehe - 42,
    width: 80,
    height: 2,
    color: ORANGE,
  });

  // Titel rechts
  seite.drawText(`Steuerübersicht ${Jahr}`, {
    x: seitenBreite - 200,
    y: seitenHoehe - 35,
    size: 11,
    font: schrift,
    color: DUNKEL,
  });

  // Seitennummer
  seite.drawText(`Seite ${seitenNr} / ${gesamtSeiten}`, {
    x: seitenBreite - 100,
    y: 24,
    size: 8,
    font: schrift,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Trennlinie
  seite.drawLine({
    start: { x: 40, y: seitenHoehe - 52 },
    end: { x: seitenBreite - 40, y: seitenHoehe - 52 },
    thickness: 0.5,
    color: rgb(0.9, 0.9, 0.9),
  });
}

// ─── POST Handler ─────────────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { transaktionen, adresse, blockchain, jahr, aktuellerKurs, kurs3112, kanton, kundenDaten, tokenKurse } =
      await request.json();

    // Alle Token-Kurse (ETH + ERC-20) aus Dashboard
    const alleTokenKurse = typeof tokenKurse === "object" && tokenKurse ? tokenKurse : {};

    // Kundendaten aufbereiten (optional)
    const kundenInfo = {
      vorname:    kundenDaten?.vorname  || "",
      nachname:   kundenDaten?.nachname || "",
      adresseStr: kundenDaten?.adresse  || "",
      plz:        kundenDaten?.plz      || "",
      ort:        kundenDaten?.ort      || "",
      kanton:     kanton || "ZH",
    };

    if (!transaktionen || !adresse || !blockchain || !jahr) {
      return NextResponse.json({ error: "Fehlende Parameter" }, { status: 400 });
    }

    // Transaktionen nach Jahr filtern
    const txImJahr = transaktionen.filter(
      (tx) => new Date(tx.datum).getFullYear() === parseInt(jahr)
    );

    // Coins gruppieren
    const coins = {};
    for (const tx of transaktionen) {
      const symbol = tx.waehrung || "?";
      if (!coins[symbol]) coins[symbol] = [];
      coins[symbol].push(tx);
    }
    // Hauptwährung ermitteln – bei CSV aus häufigster Transaktionswährung
    let hauptwaehrung;
    if (blockchain === "bitcoin") hauptwaehrung = "BTC";
    else if (blockchain === "ethereum") hauptwaehrung = "ETH";
    else if (blockchain === "solana") hauptwaehrung = "SOL";
    else {
      // CSV-Import: häufigste Währung aus den Transaktionen
      const haeufigkeit = {};
      for (const tx of transaktionen) {
        haeufigkeit[tx.waehrung] = (haeufigkeit[tx.waehrung] || 0) + 1;
      }
      hauptwaehrung = Object.entries(haeufigkeit).sort((a, b) => b[1] - a[1])[0]?.[0] || "BTC";
    }
    const coinSymbole = [
      hauptwaehrung,
      ...Object.keys(coins).filter((c) => c !== hauptwaehrung).sort(),
    ].filter((s) => coins[s]);

    const kursWert =
      typeof aktuellerKurs === "object"
        ? aktuellerKurs[hauptwaehrung] || aktuellerKurs.ETH || 0
        : aktuellerKurs || 0;

    // Jahresendgrenze für FIFO (Folgejahr-Käufe ausschliessen!)
    const jahresendeFilter = new Date(`${parseInt(jahr)}-12-31T23:59:59Z`);

    // kursStichtag: historischer 31.12.-Kurs.
    // Priorität: 1. kurs3112 aus POST-Body (analyze), 2. selbst holen (price-service.js), 3. live-Kurs
    let kursStichtag;
    if (kurs3112 && kurs3112 > 0) {
      kursStichtag = kurs3112;
    } else {
      // Single-wallet: kurs3112 nicht in Body → selbst holen (gleiche Quelle wie analyze)
      const { stichtagDatum, isLaufend: isJahrLaufend } = getJahresStatus(parseInt(jahr));
      const coinGeckoId = { BTC: "bitcoin", ETH: "ethereum", SOL: "solana" }[hauptwaehrung] || "bitcoin";
      const priceResult = await getHistoricalPriceChf(coinGeckoId, stichtagDatum);
      kursStichtag = priceResult?.price > 0 ? priceResult.price : kursWert;
    }
    const kursLabel = `Kurs 31.12.${jahr}:`;

    // FIFO für Hauptwährung – BIS Jahresende (Folgejahr-Käufe ausschliessen!)
    const fifo = berechneFifo(
      (coins[hauptwaehrung] || []).filter(tx => new Date(tx.datum) <= jahresendeFilter),
      kursStichtag
    );

    // ─── PDF-Dokument erstellen ────────────────────────────────────────────
    const pdf = await PDFDocument.create();
    const schriftBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const schrift = await pdf.embedFont(StandardFonts.Helvetica);

    const A4_BREITE = 595.28;
    const A4_HOEHE = 841.89;
    const RAND_L = 40;
    const RAND_R = 40;
    const INHALT_BREITE = A4_BREITE - RAND_L - RAND_R;

    // ─── Farben ───────────────────────────────────────────────────────────
    const ORANGE = rgb(0.969, 0.576, 0.102);
    const DUNKEL = rgb(0.067, 0.094, 0.153);
    const GRAU = rgb(0.45, 0.45, 0.45);
    const HELLGRAU = rgb(0.95, 0.95, 0.95);
    const GRUEN = rgb(0.086, 0.635, 0.243);
    const ROT = rgb(0.863, 0.078, 0.078);

    // ─── Seite 1: Deckblatt & Zusammenfassung ─────────────────────────────
    let seite = pdf.addPage([A4_BREITE, A4_HOEHE]);
    let y = A4_HOEHE - 80;

    zeichneSeiteKopf(seite, schriftBold, schrift, A4_BREITE, A4_HOEHE, 1, 2, jahr);

    // ─── Titel ───────────────────────────────────────────────────────────
    seite.drawText("Steuerübersicht Kryptowährungen", {
      x: RAND_L,
      y,
      size: 20,
      font: schriftBold,
      color: DUNKEL,
    });
    y -= 28;

    seite.drawText(`Steuerjahr ${jahr}`, {
      x: RAND_L,
      y,
      size: 12,
      font: schrift,
      color: GRAU,
    });
    y -= 40;

    // ─── Info-Block ───────────────────────────────────────────────────────
    const kundeAnzeige = (kundenInfo.vorname || kundenInfo.nachname)
      ? `${kundenInfo.vorname} ${kundenInfo.nachname}`.trim()
      : null;
    const hatAdresse = !!(kundenInfo.adresseStr || kundenInfo.plz || kundenInfo.ort);

    const infoZeilen = [
      ...(kundeAnzeige ? [["Name:", kundeAnzeige]] : []),
      ...(hatAdresse ? [["Adresse:", [
        kundenInfo.adresseStr,
        `${kundenInfo.plz || ""} ${kundenInfo.ort || ""}`.trim(),
      ].filter(Boolean).join(", ")]] : []),
      ...(kundeAnzeige || hatAdresse ? [["Kanton:", kundenInfo.kanton || "ZH"]] : []),
      ["Wallet-Adresse:", kuerzeText(adresse, 55)],
      ["Blockchain:", blockchain === "bitcoin" ? "Bitcoin (BTC)" : blockchain === "ethereum" ? "Ethereum (ERC-20)" : blockchain === "solana" ? "Solana (SOL)" : hauptwaehrung === "BTC" ? "Bitcoin (BTC)" : hauptwaehrung === "SOL" ? "Solana (SOL)" : `Ethereum / ${hauptwaehrung}`],
      ["Erstellt am:", new Date().toLocaleDateString("de-CH")],
      [kursLabel, kursStichtag > 0 ? `${formatCHF(kursStichtag)} / ${hauptwaehrung}` : "Nicht verfügbar"],
    ];

    const boxHoehe = 42 + (infoZeilen.length - 1) * 16;
    seite.drawRectangle({
      x: RAND_L,
      y: y - boxHoehe + 10,
      width: INHALT_BREITE,
      height: boxHoehe,
      color: HELLGRAU,
      borderRadius: 4,
    });

    let infoY = y - 18;
    for (const [label, wert] of infoZeilen) {
      seite.drawText(label, { x: RAND_L + 12, y: infoY, size: 9, font: schriftBold, color: DUNKEL });
      seite.drawText(wert, { x: RAND_L + 130, y: infoY, size: 9, font: schrift, color: GRAU });
      infoY -= 16;
    }
    y -= boxHoehe + 20;

    // ─── Zusammenfassung ──────────────────────────────────────────────────
    seite.drawText("Zusammenfassung", {
      x: RAND_L,
      y,
      size: 14,
      font: schriftBold,
      color: DUNKEL,
    });
    y -= 24;

    const txInJahr = txImJahr.filter((tx) => tx.waehrung === hauptwaehrung);

    // Portfoliowert per 31.12. – MIT jahresendeFilter (Folgejahr-Käufe ausschliessen!)
    const portfolioWertGesamt = coinSymbole.reduce((total, sym) => {
      const kurs = sym === hauptwaehrung ? kursStichtag : (alleTokenKurse[sym] ?? 0);
      if (!kurs) return total;
      const coinFifo = berechneFifo(
        (coins[sym] || []).filter(tx => new Date(tx.datum) <= jahresendeFilter),
        kurs
      );
      return total + coinFifo.restBestand * kurs;
    }, 0);

    // [label, formatiertWert, istGewinn, rohZahl] – rohZahl für korrekte Farbbestimmung
    const zusammenfassung = [
      ["Portfoliowert per 31.12." + jahr, formatCHF(portfolioWertGesamt), false, 0],
      ["Bestand " + hauptwaehrung, formatKrypto(fifo.restBestand) + " " + hauptwaehrung, false, 0],
      ["Kostenbasis (FIFO)", formatCHF(fifo.kostenbasis), false, 0],
      ["Realisierter Gewinn/Verlust", formatCHF(fifo.realisierterGewinn), true, fifo.realisierterGewinn],
      ["Unrealisierter Gewinn/Verlust", formatCHF(fifo.unrealisierterGewinn), true, fifo.unrealisierterGewinn],
      ["Gesamteingang " + jahr, formatCHF(txInJahr.filter(tx => tx.typ === "eingang").reduce((s, tx) => s + (tx.chfZeitpunkt || 0), 0)), false, 0],
      ["Gesamtausgang " + jahr, formatCHF(txInJahr.filter(tx => tx.typ === "ausgang").reduce((s, tx) => s + (tx.chfZeitpunkt || 0), 0)), false, 0],
    ];

    for (let i = 0; i < zusammenfassung.length; i++) {
      const [label, wert, istGewinn, rohZahl] = zusammenfassung[i];
      const zeilenFarbe = i % 2 === 0 ? HELLGRAU : rgb(1, 1, 1);

      seite.drawRectangle({
        x: RAND_L,
        y: y - 4,
        width: INHALT_BREITE,
        height: 20,
        color: zeilenFarbe,
      });

      seite.drawText(label, {
        x: RAND_L + 8,
        y: y + 4,
        size: 10,
        font: schrift,
        color: DUNKEL,
      });

      // Farbbestimmung anhand des rohen Zahlwerts (nicht des formatierten Strings)
      let wertFarbe = DUNKEL;
      if (istGewinn) {
        wertFarbe = rohZahl < 0 ? ROT : rohZahl > 0 ? GRUEN : DUNKEL;
      }

      seite.drawText(wert, {
        x: A4_BREITE - RAND_R - schriftBold.widthOfTextAtSize(wert, 10) - 8,
        y: y + 4,
        size: 10,
        font: schriftBold,
        color: wertFarbe,
      });

      y -= 20;
    }
    y -= 20;

    // ─── Hinweis auf Seite 2 ──────────────────────────────────────────────
    seite.drawText("> Detaillierte Transaktionsliste auf Seite 2", {
      x: RAND_L,
      y,
      size: 10,
      font: schrift,
      color: GRAU,
    });

    // Disclaimer unten
    const disclaimerY = 50;
    seite.drawLine({
      start: { x: RAND_L, y: disclaimerY + 18 },
      end: { x: A4_BREITE - RAND_R, y: disclaimerY + 18 },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.88),
    });
    seite.drawText(
      "Kein Steuerberater · Kein Ersatz für professionelle Beratung · CHF-Kurse via CoinGecko API · Angaben ohne Gewähr",
      {
        x: RAND_L,
        y: disclaimerY,
        size: 7.5,
        font: schrift,
        color: rgb(0.7, 0.7, 0.7),
      }
    );

    // ─── Seite 2: Transaktionsliste ───────────────────────────────────────
    seite = pdf.addPage([A4_BREITE, A4_HOEHE]);
    y = A4_HOEHE - 80;

    zeichneSeiteKopf(seite, schriftBold, schrift, A4_BREITE, A4_HOEHE, 2, 2, jahr);

    seite.drawText(`Transaktionen ${jahr}`, {
      x: RAND_L,
      y,
      size: 14,
      font: schriftBold,
      color: DUNKEL,
    });
    y -= 10;

    seite.drawText(
      `${txImJahr.length} Transaktionen · Wallet: ${kuerzeText(adresse, 42)}`,
      {
        x: RAND_L,
        y,
        size: 9,
        font: schrift,
        color: GRAU,
      }
    );
    y -= 24;

    // ─── Tabellen-Header ──────────────────────────────────────────────────
    const SPALTEN = [
      { label: "Datum", x: RAND_L, breite: 70 },
      { label: "Typ", x: RAND_L + 72, breite: 50 },
      { label: "Coin", x: RAND_L + 124, breite: 40 },
      { label: "Betrag", x: RAND_L + 166, breite: 90, rechts: true },
      { label: "CHF-Kurs", x: RAND_L + 260, breite: 80, rechts: true },
      { label: "CHF-Wert", x: RAND_L + 345, breite: 90, rechts: true },
      { label: "TX-Hash", x: RAND_L + 438, breite: 80 },
    ];

    // Tabellen-Header Hintergrund
    seite.drawRectangle({
      x: RAND_L,
      y: y - 4,
      width: INHALT_BREITE,
      height: 18,
      color: DUNKEL,
    });

    for (const sp of SPALTEN) {
      const textBreite = schriftBold.widthOfTextAtSize(sp.label, 8);
      const textX = sp.rechts ? sp.x + sp.breite - textBreite : sp.x + 4;
      seite.drawText(sp.label, {
        x: textX,
        y: y + 2,
        size: 8,
        font: schriftBold,
        color: rgb(1, 1, 1),
      });
    }
    y -= 20;

    // ─── Transaktionszeilen ───────────────────────────────────────────────
    for (let i = 0; i < txImJahr.length; i++) {
      const tx = txImJahr[i];

      // Neue Seite falls nötig
      if (y < 80) {
        seite = pdf.addPage([A4_BREITE, A4_HOEHE]);
        y = A4_HOEHE - 80;
        zeichneSeiteKopf(
          seite,
          schriftBold,
          schrift,
          A4_BREITE,
          A4_HOEHE,
          pdf.getPageCount(),
          pdf.getPageCount(),
          jahr
        );
        y -= 10;

        // Header wiederholen
        seite.drawRectangle({
          x: RAND_L,
          y: y - 4,
          width: INHALT_BREITE,
          height: 18,
          color: DUNKEL,
        });
        for (const sp of SPALTEN) {
          const textBreite = schriftBold.widthOfTextAtSize(sp.label, 8);
          const textX = sp.rechts ? sp.x + sp.breite - textBreite : sp.x + 4;
          seite.drawText(sp.label, {
            x: textX,
            y: y + 2,
            size: 8,
            font: schriftBold,
            color: rgb(1, 1, 1),
          });
        }
        y -= 20;
      }

      // Zeilen-Hintergrund abwechselnd
      if (i % 2 === 0) {
        seite.drawRectangle({
          x: RAND_L,
          y: y - 4,
          width: INHALT_BREITE,
          height: 16,
          color: HELLGRAU,
        });
      }

      const betrag = parseFloat(tx.betrag) || 0;
      const kursChf = betrag > 0 ? (tx.chfZeitpunkt || 0) / betrag : 0;
      const istEingang = tx.typ === "eingang";
      const wertFarbe = istEingang ? GRUEN : ROT;

      const zeile = [
        { text: formatDatum(tx.datum), sp: SPALTEN[0] },
        { text: istEingang ? "Eingang" : "Ausgang", sp: SPALTEN[1], farbe: wertFarbe, fett: true },
        { text: (tx.waehrung || "?").substring(0, 6), sp: SPALTEN[2] },
        {
          text: (istEingang ? "+" : "-") + formatKrypto(tx.betrag),
          sp: SPALTEN[3],
          farbe: wertFarbe,
          rechts: true,
        },
        { text: formatCHF(kursChf), sp: SPALTEN[4], rechts: true },
        {
          text: (istEingang ? "+" : "-") + formatCHF(tx.chfZeitpunkt),
          sp: SPALTEN[5],
          farbe: wertFarbe,
          fett: true,
          rechts: true,
        },
        { text: tx.hash ? tx.hash.substring(0, 10) + ".." : "-", sp: SPALTEN[6] },
      ];

      for (const { text, sp, farbe, fett, rechts } of zeile) {
        const f = fett ? schriftBold : schrift;
        const textBreite = f.widthOfTextAtSize(text, 8);
        const textX = rechts ? sp.x + sp.breite - textBreite - 4 : sp.x + 4;
        seite.drawText(text, {
          x: textX,
          y: y + 2,
          size: 8,
          font: f,
          color: farbe || DUNKEL,
        });
      }

      y -= 16;
    }

    // Disclaimer auf letzter Seite
    y -= 20;
    seite.drawLine({
      start: { x: RAND_L, y: Math.max(y, 60) },
      end: { x: A4_BREITE - RAND_R, y: Math.max(y, 60) },
      thickness: 0.5,
      color: rgb(0.88, 0.88, 0.88),
    });
    seite.drawText(
      "Kein Steuerberater · CHF-Kurse via CoinGecko API · Keine Gewähr · btcSteuerauszug.ch",
      {
        x: RAND_L,
        y: Math.max(y - 15, 40),
        size: 7.5,
        font: schrift,
        color: rgb(0.7, 0.7, 0.7),
      }
    );

    // ─── PDF speichern und zurückgeben ────────────────────────────────────
    const pdfBytes = await pdf.save();

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="btcsteuerauszug-${blockchain}-${jahr}.pdf"`,
      },
    });
  } catch (fehler) {
    console.error("PDF-Export Fehler:", fehler);
    return NextResponse.json(
      { error: "Fehler beim Generieren des PDFs" },
      { status: 500 }
    );
  }
}
