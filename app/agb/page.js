import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";

export const metadata = {
  title: "AGB – btcSteuerauszug.ch",
  description: "Allgemeine Geschäftsbedingungen von btcSteuerauszug.ch",
};

function Abschnitt({ nr, titel, children }) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2
        style={{
          fontSize: "1.05rem",
          fontWeight: 700,
          color: "#1e3a5f",
          marginBottom: "0.75rem",
          paddingBottom: "0.4rem",
          borderBottom: "2px solid #F7931A",
          display: "inline-block",
        }}
      >
        {nr}. {titel}
      </h2>
      <div style={{ fontSize: "0.9rem", color: "#374151", lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

export default function AgbPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />

      <main
        style={{
          flex: 1,
          maxWidth: 760,
          margin: "0 auto",
          padding: "3rem 1.5rem",
          width: "100%",
        }}
      >
        {/* Breadcrumb */}
        <div style={{ fontSize: "0.82rem", color: "#9ca3af", marginBottom: "2rem" }}>
          <Link href="/" style={{ color: "#9ca3af" }}>Startseite</Link>
          {" / "}
          <span style={{ color: "#374151" }}>AGB</span>
        </div>

        <h1
          style={{
            fontSize: "1.8rem",
            fontWeight: 800,
            color: "#1e3a5f",
            marginBottom: "0.5rem",
            letterSpacing: "-0.03em",
          }}
        >
          Allgemeine Geschäftsbedingungen
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: "2.5rem" }}>
          Gültig ab März 2026 · btcSteuerauszug.ch
        </p>

        <Abschnitt nr="1" titel="Geltungsbereich">
          <p>
            Diese Allgemeinen Geschäftsbedingungen (AGB) regeln die Nutzung des Dienstes
            btcSteuerauszug.ch (nachfolgend «Dienst»). Mit der Nutzung des Dienstes
            akzeptiert der Nutzer diese AGB vollumfänglich.
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Der Betreiber behält sich vor, diese AGB jederzeit zu ändern. Änderungen
            werden auf dieser Seite veröffentlicht und gelten ab dem Datum der Veröffentlichung.
          </p>
        </Abschnitt>

        <Abschnitt nr="2" titel="Leistungsbeschreibung">
          <p>btcSteuerauszug.ch bietet folgende Dienste an:</p>
          <ul style={{ paddingLeft: "1.5rem", marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <li>
              <strong>Kostenlos:</strong> Anzeige von Transaktionen (Bitcoin, Ethereum, Solana)
              sowie PDF Steuerauszug der Transaktionsdaten.
            </li>
            <li>
              <strong>Kostenpflichtig (CHF 2.10 / Wallet):</strong> Generierung eines
              eSteuerauszugs im PDF-Format, angelehnt an den eCH-0196 v2.2 Standard der
              Schweizer Banken. Jede weitere Wallet: CHF 1.00.
            </li>
          </ul>
          <p style={{ marginTop: "0.75rem" }}>
            Der Dienst ist als Hilfsmittel zur Vorbereitung der Steuererklärung gedacht
            und ersetzt keine professionelle Steuerberatung (siehe Ziffer 5).
          </p>
        </Abschnitt>

        <Abschnitt nr="3" titel="Zahlungsbedingungen">
          <p>
            Kostenpflichtige Leistungen werden über <strong>Stripe</strong> abgewickelt.
            Akzeptierte Zahlungsmittel: Kreditkarte (Visa, Mastercard, American Express).
          </p>
          <div style={{ marginTop: "0.75rem", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "0.75rem 1rem" }}>
            <strong style={{ color: "#92400e" }}>Keine Rückerstattung nach PDF-Download:</strong>
            <p style={{ color: "#78350f", marginTop: "0.25rem" }}>
              Da der eSteuerauszug unmittelbar nach der Zahlung generiert und heruntergeladen
              werden kann, besteht kein Widerrufsrecht nach erfolgtem Download (OR Art. 40a ff.).
              Bei technischen Problemen wenden Sie sich bitte an support@btcsteuerauszug.ch.
            </p>
          </div>
          <p style={{ marginTop: "0.75rem" }}>
            Alle Preise verstehen sich inkl. Mehrwertsteuer (sofern anwendbar).
          </p>
        </Abschnitt>

        <Abschnitt nr="4" titel="CHF-Kurse und Datengenauigkeit">
          <div style={{ background: "#fff8f0", border: "1px solid #fde8c8", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "0.75rem" }}>
            <strong style={{ color: "#92400e" }}>Wichtiger Hinweis zu CHF-Kursen:</strong>
            <p style={{ color: "#78350f", marginTop: "0.25rem" }}>
              Die im Dienst verwendeten CHF-Kurse stammen von CoinMarketCap und CryptoCompare.
              Diese <strong>können von den offiziellen ESTV-Kursen (Eidgenössische
              Steuerverwaltung) abweichen</strong>. Für die Steuererklärung massgebend
              sind die Kurse gemäss ESTV-Kursliste (estv.admin.ch).
            </p>
          </div>
          <p>
            Transaktionsdaten werden von öffentlichen Blockchain-APIs bezogen
            (blockchain.info, Alchemy, Solana RPC). Der Betreiber übernimmt keine Gewähr
            für die Vollständigkeit der Transaktionsdaten, insbesondere wenn Transaktionen
            die API-Limite überschreiten.
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Historische CHF-Kurse können für einige Daten nicht verfügbar sein («Kurs n.v.»).
            In diesen Fällen sind die FIFO-Berechnungen unvollständig und müssen manuell
            korrigiert werden.
          </p>
        </Abschnitt>

        <Abschnitt nr="5" titel="Kein Steuerberater – Haftungsausschluss">
          <p>
            <strong>btcSteuerauszug.ch ist kein zugelassener Steuerberater und bietet
            keine steuerrechtliche Beratung an.</strong>
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Der generierte eSteuerauszug ist ein Hilfsdokument und kein rechtsverbindliches
            Steuerdokument. Er ersetzt weder die Konsultation eines Steuerberaters noch
            eine offizielle Bescheinigung einer Bank oder Finanzbehörde.
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Der Betreiber haftet nicht für Schäden, die aus der Verwendung der bereitgestellten
            Daten oder Dokumente entstehen, insbesondere nicht für Steuernachforderungen,
            Bussen oder Verzugszinsen. Die Nutzung des Dienstes erfolgt auf eigenes Risiko.
          </p>
        </Abschnitt>

        <Abschnitt nr="6" titel="Datenschutz">
          <p>
            Die Verarbeitung personenbezogener Daten erfolgt gemäss der{" "}
            <Link href="/datenschutz" style={{ color: "#F7931A" }}>Datenschutzerklärung</Link>{" "}
            von btcSteuerauszug.ch, welche Bestandteil dieser AGB ist.
          </p>
        </Abschnitt>

        <Abschnitt nr="7" titel="Verfügbarkeit des Dienstes">
          <p>
            Der Betreiber bemüht sich um eine hohe Verfügbarkeit des Dienstes, übernimmt
            jedoch keine Garantie für ununterbrochene Erreichbarkeit. Wartungsarbeiten und
            technische Störungen sind möglich. Es besteht kein Anspruch auf Verfügbarkeit
            des Dienstes zu einem bestimmten Zeitpunkt.
          </p>
        </Abschnitt>

        <Abschnitt nr="8" titel="Geltendes Recht und Gerichtsstand">
          <p>
            Diese AGB sowie alle Rechtsbeziehungen zwischen Nutzer und Betreiber
            unterliegen ausschliesslich <strong>Schweizer Recht</strong>.
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Gerichtsstand für alle Streitigkeiten ist der Sitz des Betreibers in der
            Schweiz. Zwingend gesetzliche Gerichtsstände bleiben vorbehalten.
          </p>
        </Abschnitt>

        <Abschnitt nr="9" titel="Kontakt">
          <p>
            Bei Fragen zu diesen AGB oder zum Dienst wenden Sie sich bitte an:
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            <a href="mailto:support@btcsteuerauszug.ch" style={{ color: "#F7931A", fontWeight: 600 }}>
              support@btcsteuerauszug.ch
            </a>
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Vollständige Angaben zum Betreiber: <Link href="/impressum" style={{ color: "#F7931A" }}>Impressum</Link>
          </p>
        </Abschnitt>

        {/* Links */}
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid #f0f0f0", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <Link href="/impressum" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Impressum</Link>
          <Link href="/datenschutz" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Datenschutzerklärung</Link>
          <Link href="/kontakt" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Kontakt</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
