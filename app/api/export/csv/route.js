// ─── API Route: CSV-Export ──────────────────────────────────────────────────
// Empfängt Transaktionsdaten und gibt eine CSV-Datei zurück (kostenlos)
export const maxDuration = 60;
export const dynamic     = "force-dynamic";

export async function POST(request) {
  try {
    const { transaktionen, adresse, blockchain, jahr } = await request.json();

    // Eingaben validieren
    if (!transaktionen || !Array.isArray(transaktionen)) {
      return Response.json({ error: "Ungültige Transaktionsdaten" }, { status: 400 });
    }

    // ─── CSV-Header ────────────────────────────────────────────────────────
    // Schweizer Format: Semikolon als Trennzeichen (Excel-kompatibel)
    const header = [
      "Datum",
      "Uhrzeit",
      "Typ",
      `Betrag (${blockchain === "bitcoin" ? "BTC" : blockchain === "solana" ? "SOL" : "ETH"})`,
      "Währung",
      "CHF-Wert (Zeitpunkt)",
      "CHF-Wert (Heute)",
      "Transaktions-Hash",
    ].join(";");

    // ─── CSV-Zeilen generieren ─────────────────────────────────────────────
    const zeilen = transaktionen.map((tx) => {
      const datum = new Date(tx.datum);
      const datumStr = datum.toLocaleDateString("de-CH"); // DD.MM.YYYY
      const zeitStr = datum.toLocaleTimeString("de-CH", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const typ = tx.typ === "eingang" ? "Eingang" : "Ausgang";

      // Zahlen mit Komma als Dezimaltrennzeichen (Schweizer Format)
      const betrag = tx.betrag.toFixed(8).replace(".", ",");
      const chfZeitpunkt = tx.chfZeitpunkt !== null && tx.chfZeitpunkt !== undefined
        ? tx.chfZeitpunkt.toFixed(2).replace(".", ",")
        : "k.A.";
      const chfHeute = tx.chfHeute !== null && tx.chfHeute !== undefined
        ? tx.chfHeute.toFixed(2).replace(".", ",")
        : "k.A.";

      return [
        datumStr,
        zeitStr,
        typ,
        betrag,
        tx.waehrung,
        chfZeitpunkt,
        chfHeute,
        tx.hash,
      ].join(";");
    });

    // ─── Zusammenfassung am Ende ───────────────────────────────────────────
    // Nur Transaktionen mit bekanntem CHF-Kurs in die Zusammenfassung einbeziehen
    const txMitKurs = transaktionen.filter((tx) => tx.chfZeitpunkt !== null && tx.chfZeitpunkt !== undefined);
    const txOhneKurs = transaktionen.length - txMitKurs.length;
    const gesamtEingang = txMitKurs
      .filter((tx) => tx.typ === "eingang")
      .reduce((sum, tx) => sum + tx.chfZeitpunkt, 0);
    const gesamtAusgang = txMitKurs
      .filter((tx) => tx.typ === "ausgang")
      .reduce((sum, tx) => sum + tx.chfZeitpunkt, 0);

    const zusammenfassung = [
      "",
      `Zusammenfassung Steuerjahr ${jahr}`,
      `Gesamteingang (CHF);;${gesamtEingang.toFixed(2).replace(".", ",")}`,
      `Gesamtausgang (CHF);;${gesamtAusgang.toFixed(2).replace(".", ",")}`,
      `Netto (CHF);;${(gesamtEingang - gesamtAusgang).toFixed(2).replace(".", ",")}`,
      `Anzahl Transaktionen;;${transaktionen.length}`,
      txOhneKurs > 0 ? `Ohne historischen Kurs;;${txOhneKurs} (als "k.A." markiert)` : "",
      `Wallet-Adresse;;${adresse}`,
      `Erstellt am;;${new Date().toLocaleDateString("de-CH")}`,
    ].filter(Boolean).join("\n");

    // BOM (Byte Order Mark) für korrekte Excel-Darstellung von Umlauten
    const bom = "\uFEFF";
    const csvInhalt = bom + [header, ...zeilen, zusammenfassung].join("\n");

    // Dateinamen erstellen
    const dateiname = `btcsteuerauszug-${blockchain}-${adresse.substring(0, 8)}-${jahr}.csv`;

    return new Response(csvInhalt, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${dateiname}"`,
      },
    });
  } catch (fehler) {
    console.error("CSV-Export Fehler:", fehler);
    return Response.json({ error: "Fehler beim Generieren der CSV-Datei" }, { status: 500 });
  }
}
