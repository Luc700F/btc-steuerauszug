import Link from "next/link";

// Footer – minimalistisch, weisser Hintergrund mit hellgrauer Trennlinie
export default function Footer() {
  const aktuellesJahr = new Date().getFullYear();

  return (
    <footer
      style={{
        borderTop: "1px solid #f0f0f0",
        background: "#fafafa",
        marginTop: "auto",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "3rem 1.5rem 2rem",
        }}
      >
        {/* Drei Spalten */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "2rem",
            marginBottom: "2.5rem",
          }}
        >
          {/* Logo & Beschreibung */}
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: "1.2rem",
                letterSpacing: "-0.03em",
                marginBottom: 8,
              }}
            >
              <span style={{ color: "#F7931A" }}>b</span>
              <span style={{ color: "#627EEA" }}>t</span>
              <span style={{ color: "#9945FF" }}>c</span>
              <span style={{ color: "#000" }}>Steuerauszug</span>
            </div>
            <p style={{ color: "#6b7280", fontSize: "0.85rem", lineHeight: 1.6 }}>
              Ihr digitaler Steuerauszug für Bitcoin, Ethereum und Solana –
              angelehnt an den eSteuerauszug der Schweizer Banken.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3
              style={{
                fontWeight: 600,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                marginBottom: 12,
              }}
            >
              Navigation
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { href: "/", label: "Startseite" },
                { href: "/#preise", label: "Preise" },
                { href: "/#faq", label: "FAQ" },
                { href: "/kontakt", label: "Kontakt" },
              ].map(({ href, label }) => (
                <Link
                  key={label}
                  href={href}
                  style={{ color: "#6b7280", fontSize: "0.88rem" }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          {/* Rechtliches */}
          <div>
            <h3
              style={{
                fontWeight: 600,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#9ca3af",
                marginBottom: 12,
              }}
            >
              Rechtliches
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { href: "/datenschutz", label: "Datenschutz" },
                { href: "/impressum",   label: "Impressum"   },
                { href: "/agb",         label: "AGB"         },
              ].map(({ href, label }) => (
                <Link
                  key={label}
                  href={href}
                  style={{ color: "#6b7280", fontSize: "0.88rem" }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Haftungsausschluss */}
        <div
          style={{
            background: "#fff8f0",
            border: "1px solid #fde8c8",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: "1.5rem",
          }}
        >
          <p style={{ fontWeight: 600, fontSize: "0.8rem", color: "#92400e", marginBottom: 4 }}>
            Kein Steuerberater
          </p>
          <p style={{ color: "#78350f", fontSize: "0.78rem", lineHeight: 1.6 }}>
            btcSteuerauszug.ch ist kein Steuerberater und ersetzt keine
            professionelle Steuerberatung. Die CHF-Werte werden über öffentliche
            APIs berechnet und können von den ESTV-Kursen abweichen. Bitte
            konsultieren Sie Ihre kantonale Steuerbehörde für verbindliche
            Auskünfte.
          </p>
        </div>

        <p style={{ color: "#d1d5db", fontSize: "0.78rem", textAlign: "center" }}>
          © {aktuellesJahr} btcSteuerauszug.ch · Schweiz ·{" "}
          <span style={{ color: "#F7931A" }}>b</span>
          <span style={{ color: "#627EEA" }}>t</span>
          <span style={{ color: "#9945FF" }}>c</span>Steuerauszug
        </p>
      </div>
    </footer>
  );
}
