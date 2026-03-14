import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";

export const metadata = {
  title: "Datenschutzerklärung – btcSteuerauszug.ch",
  description: "Datenschutzerklärung gemäss nDSG (Schweizer Datenschutzgesetz)",
};

function Abschnitt({ titel, children }) {
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
        {titel}
      </h2>
      <div style={{ fontSize: "0.9rem", color: "#374151", lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

export default function DatenschutzPage() {
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
          <span style={{ color: "#374151" }}>Datenschutzerklärung</span>
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
          Datenschutzerklärung
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: "2.5rem" }}>
          Gemäss nDSG (Schweizer Datenschutzgesetz, in Kraft seit 1. September 2023)
        </p>

        {/* Hinweis-Box */}
        <div
          style={{
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: 8,
            padding: "1rem 1.25rem",
            marginBottom: "2.5rem",
            fontSize: "0.88rem",
            color: "#14532d",
            lineHeight: 1.6,
          }}
        >
          <strong>Datensparsamkeit:</strong> btcSteuerauszug.ch speichert keine
          persönlichen Daten dauerhaft. Wallet-Adressen sind öffentliche Blockchain-Daten.
          Es werden keine Cookies zur Verfolgung gesetzt.
        </div>

        <Abschnitt titel="1. Verantwortlicher">
          <p>
            Verantwortlicher für die Datenverarbeitung ist der Betreiber von btcSteuerauszug.ch.
            Kontakt: <a href="mailto:support@btcsteuerauszug.ch" style={{ color: "#F7931A" }}>support@btcsteuerauszug.ch</a>
          </p>
          <p style={{ marginTop: "0.5rem" }}>
            Vollständige Kontaktangaben finden Sie im <Link href="/impressum" style={{ color: "#F7931A" }}>Impressum</Link>.
          </p>
        </Abschnitt>

        <Abschnitt titel="2. Welche Daten werden verarbeitet?">
          <p style={{ marginBottom: "1rem" }}>
            btcSteuerauszug.ch verarbeitet ausschliesslich folgende Daten:
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "0.75rem 1rem" }}>
              <strong>Wallet-Adressen (öffentliche Blockchain-Daten)</strong>
              <p style={{ marginTop: "0.25rem", color: "#6b7280" }}>
                Wallet-Adressen (Bitcoin, Ethereum, Solana) sind öffentlich auf der jeweiligen
                Blockchain einsehbar. Diese Daten werden nicht gespeichert; sie werden nur
                während Ihrer Session temporär zur Anzeige verwendet.
              </p>
            </div>

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "0.75rem 1rem" }}>
              <strong>Transaktionsdaten (temporär, im Browser)</strong>
              <p style={{ marginTop: "0.25rem", color: "#6b7280" }}>
                Transaktionsdaten werden im Browser-Speicher (localStorage, sessionStorage)
                zwischengespeichert und automatisch beim Schliessen des Browsers gelöscht.
                Keine Übertragung an Server ausser für die PDF-Generierung.
              </p>
            </div>

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "0.75rem 1rem" }}>
              <strong>Zahlungsdaten (via Stripe)</strong>
              <p style={{ marginTop: "0.25rem", color: "#6b7280" }}>
                Bei Kauf eines eSteuerauszugs werden Zahlungsdaten ausschliesslich von
                Stripe verarbeitet. btcSteuerauszug.ch speichert keine Kreditkartendaten.
                Stripe ist nach PCI DSS zertifiziert. Datenschutzerklärung: stripe.com/privacy
              </p>
            </div>

            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "0.75rem 1rem" }}>
              <strong>Server-Logs (technisch notwendig)</strong>
              <p style={{ marginTop: "0.25rem", color: "#6b7280" }}>
                Vercel (unser Hosting-Anbieter) protokolliert technische Daten (IP-Adresse,
                Zeitstempel, HTTP-Anfragen) für max. 30 Tage. Dies dient der Fehlerdiagnose.
                Vercel ist DSGVO/nDSG-konform.
              </p>
            </div>
          </div>
        </Abschnitt>

        <Abschnitt titel="3. Cookies und Browser-Speicher">
          <p>
            btcSteuerauszug.ch verwendet <strong>keine Tracking-Cookies</strong> und kein
            Analytics. Wir verwenden ausschliesslich technisch notwendige Browser-Speicher:
          </p>
          <ul style={{ paddingLeft: "1.5rem", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <li>
              <strong>localStorage</strong> – Speichert Ihre Wallet-Adressen lokal im Browser
              (Schlüssel: <code style={{ fontSize: "0.8rem", background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>cryptotax_wallets</code>).
              Bleibt bis zur manuellen Löschung erhalten.
            </li>
            <li>
              <strong>sessionStorage</strong> – Temporäre Daten für die PDF-Generierung nach
              Stripe-Zahlung. Wird beim Schliessen des Tabs gelöscht.
            </li>
          </ul>
          <p style={{ marginTop: "0.75rem" }}>
            Sie können den Browser-Speicher jederzeit über die Entwicklertools Ihres
            Browsers löschen (F12 → Application → Storage → Clear).
          </p>
        </Abschnitt>

        <Abschnitt titel="4. Externe Dienste (Datenverarbeitung Dritter)">
          <p style={{ marginBottom: "1rem" }}>
            Für die Bereitstellung des Dienstes werden folgende externe APIs verwendet.
            Dabei werden die jeweiligen Wallet-Adressen an diese Dienste übertragen:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {[
              { name: "CoinMarketCap", zweck: "Aktuelle CHF-Kurse", url: "coinmarketcap.com" },
              { name: "CryptoCompare", zweck: "Historische CHF-Kurse", url: "cryptocompare.com" },
              { name: "Alchemy", zweck: "Ethereum-Transaktionen und Token-Balances", url: "alchemy.com" },
              { name: "Etherscan", zweck: "Ethereum-Transaktionen (Fallback)", url: "etherscan.io" },
              { name: "blockchain.info / Blockstream", zweck: "Bitcoin-Transaktionen", url: "blockchain.info" },
              { name: "Solana Labs (Public RPC)", zweck: "Solana-Transaktionen", url: "solana.com" },
              { name: "Stripe", zweck: "Zahlungsabwicklung (eSteuerauszug)", url: "stripe.com" },
              { name: "Vercel", zweck: "Hosting und Server-Infrastruktur", url: "vercel.com" },
            ].map(({ name, zweck, url }) => (
              <div
                key={name}
                style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "0.25rem 1rem", padding: "0.5rem 0", borderBottom: "1px solid #f3f4f6" }}
              >
                <strong>{name}</strong>
                <span style={{ color: "#6b7280" }}>{zweck}</span>
                <span />
                <a href={`https://www.${url}`} target="_blank" rel="noopener noreferrer" style={{ color: "#F7931A", fontSize: "0.82rem" }}>
                  www.{url}
                </a>
              </div>
            ))}
          </div>
        </Abschnitt>

        <Abschnitt titel="5. Aufbewahrung und Löschung">
          <p>
            btcSteuerauszug.ch speichert <strong>keine persönlichen Daten</strong> dauerhaft
            auf eigenen Servern. Transaktionsdaten existieren nur während der Nutzungssession
            im Browser. Nach dem Schliessen des Browsers oder der manuellen Löschung sind
            alle Daten unwiderruflich gelöscht.
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            Stripe-Zahlungsdaten unterliegen den gesetzlichen Aufbewahrungsfristen (in der
            Schweiz: 10 Jahre gemäss OR Art. 962). Diese Daten werden ausschliesslich von
            Stripe verwaltet.
          </p>
        </Abschnitt>

        <Abschnitt titel="6. Ihre Rechte gemäss nDSG">
          <p style={{ marginBottom: "0.75rem" }}>
            Gemäss dem Schweizer Datenschutzgesetz (nDSG) haben Sie folgende Rechte:
          </p>
          <ul style={{ paddingLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <li><strong>Auskunftsrecht:</strong> Sie können Auskunft über Ihre gespeicherten Daten verlangen.</li>
            <li><strong>Berichtigungsrecht:</strong> Sie können die Korrektur unrichtiger Daten verlangen.</li>
            <li><strong>Löschungsrecht:</strong> Sie können die Löschung Ihrer Daten verlangen.</li>
            <li><strong>Widerspruchsrecht:</strong> Sie können der Datenverarbeitung widersprechen.</li>
          </ul>
          <p style={{ marginTop: "0.75rem" }}>
            Da btcSteuerauszug.ch keine personenbezogenen Daten dauerhaft speichert, können
            diese Rechte nur gegenüber den jeweiligen Drittanbietern (Stripe, Vercel etc.)
            geltend gemacht werden.
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            Für Fragen zum Datenschutz: <a href="mailto:support@btcsteuerauszug.ch" style={{ color: "#F7931A" }}>support@btcsteuerauszug.ch</a>
          </p>
        </Abschnitt>

        <Abschnitt titel="7. Änderungen dieser Datenschutzerklärung">
          <p>
            Der Betreiber behält sich vor, diese Datenschutzerklärung jederzeit anzupassen.
            Die jeweils aktuelle Version ist unter btcsteuerauszug.ch/datenschutz abrufbar.
            Stand: März 2026.
          </p>
        </Abschnitt>

        {/* Links */}
        <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid #f0f0f0", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <Link href="/impressum" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Impressum</Link>
          <Link href="/agb" style={{ color: "#F7931A", fontSize: "0.88rem" }}>AGB</Link>
          <Link href="/kontakt" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Kontakt</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
