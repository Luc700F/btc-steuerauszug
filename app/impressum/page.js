import Header from "../components/Header";
import Footer from "../components/Footer";
import Link from "next/link";

export const metadata = {
  title: "Impressum – btcSteuerauszug.ch",
  description: "Impressum und Angaben zum Betreiber von btcSteuerauszug.ch",
};

export default function ImpressumPage() {
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
          <span style={{ color: "#374151" }}>Impressum</span>
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
          Impressum
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: "2.5rem" }}>
          Angaben gemäss OR Art. 3 UWG
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>

          {/* Betreiber */}
          <section>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1e3a5f", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "2px solid #F7931A", display: "inline-block" }}>
              Betreiber
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "0.5rem 1rem", fontSize: "0.9rem" }}>
              <span style={{ color: "#6b7280", fontWeight: 600 }}>Bezeichnung</span>
              <span style={{ color: "#374151" }}>btcSteuerauszug.ch</span>

              <span style={{ color: "#6b7280", fontWeight: 600 }}>Inhaber</span>
              <span style={{ color: "#374151" }}>Luca Fries</span>

              <span style={{ color: "#6b7280", fontWeight: 600 }}>Adresse</span>
              <span style={{ color: "#374151" }}>
                Schweiz
              </span>

              <span style={{ color: "#6b7280", fontWeight: 600 }}>E-Mail</span>
              <span style={{ color: "#374151" }}>
                <a
                  href="mailto:support@btcsteuerauszug.ch"
                  style={{ color: "#F7931A", textDecoration: "none" }}
                >
                  support@btcsteuerauszug.ch
                </a>
              </span>

              <span style={{ color: "#6b7280", fontWeight: 600 }}>Website</span>
              <span style={{ color: "#374151" }}>btcsteuerauszug.ch</span>
            </div>
          </section>

          {/* Haftungsausschluss */}
          <section>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1e3a5f", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "2px solid #F7931A", display: "inline-block" }}>
              Haftungsausschluss
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.7 }}>
              <p>
                <strong>Kein Steuerberater:</strong> btcSteuerauszug.ch ist kein zugelassener
                Steuerberater und bietet keine steuerrechtliche Beratung an. Die bereitgestellten
                Dokumente und Berechnungen ersetzen keine professionelle Steuerberatung.
              </p>
              <p>
                <strong>Kursgenauigkeit:</strong> Die CHF-Kurse werden über öffentliche APIs
                (CoinMarketCap, CryptoCompare) abgerufen und können von den offiziellen
                ESTV-Kursen (Eidgenössische Steuerverwaltung) abweichen. Für verbindliche
                Steuerwerte konsultieren Sie bitte die ESTV-Kursliste.
              </p>
              <p>
                <strong>Vollständigkeit:</strong> Die Korrektheit und Vollständigkeit der
                geladenen Transaktionsdaten hängt von den verwendeten Blockchain-APIs ab.
                Der Betreiber übernimmt keine Gewähr für die Vollständigkeit der Daten.
              </p>
            </div>
          </section>

          {/* Verwendete Dienste */}
          <section>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1e3a5f", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "2px solid #F7931A", display: "inline-block" }}>
              Verwendete externe Dienste
            </h2>
            <div style={{ fontSize: "0.9rem", color: "#374151", lineHeight: 1.7 }}>
              <p style={{ marginBottom: "0.5rem" }}>
                btcSteuerauszug.ch verwendet folgende externe APIs zur Datenabfrage:
              </p>
              <ul style={{ paddingLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <li>CoinMarketCap (coinmarketcap.com) – aktuelle + historische CHF-Kurse (primär)</li>
                <li>CryptoCompare (cryptocompare.com) – historische CHF-Kurse (Fallback)</li>
                <li>CoinGecko (coingecko.com) – historische CHF-Kurse (Fallback)</li>
                <li>Mempool.space (mempool.space) – Bitcoin-Kurse (Fallback)</li>
                <li>Alchemy (alchemy.com) – Ethereum-Transaktionen und Balances</li>
                <li>Etherscan (etherscan.io) – Ethereum-Transaktionen (Fallback)</li>
                <li>blockchain.info / Blockstream – Bitcoin-Transaktionen</li>
                <li>Solana Public RPC (mainnet-beta.solana.com) – Solana-Transaktionen</li>
                <li>Stripe (stripe.com) – Zahlungsabwicklung</li>
              </ul>
            </div>
          </section>

          {/* Geltendes Recht */}
          <section
            style={{
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "1rem 1.25rem",
              fontSize: "0.85rem",
              color: "#6b7280",
              lineHeight: 1.6,
            }}
          >
            <strong style={{ color: "#374151" }}>Geltendes Recht:</strong> Dieses Impressum und
            alle Rechtsbeziehungen zwischen Nutzer und Betreiber unterliegen ausschliesslich
            schweizerischem Recht. Gerichtsstand ist der Sitz des Betreibers in der Schweiz.
          </section>

        </div>

        {/* Links zu anderen Rechtspages */}
        <div style={{ marginTop: "3rem", paddingTop: "1.5rem", borderTop: "1px solid #f0f0f0", display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
          <Link href="/datenschutz" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Datenschutzerklärung</Link>
          <Link href="/agb" style={{ color: "#F7931A", fontSize: "0.88rem" }}>AGB</Link>
          <Link href="/kontakt" style={{ color: "#F7931A", fontSize: "0.88rem" }}>Kontakt</Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
