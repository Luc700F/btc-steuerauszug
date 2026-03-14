import Header from "../components/Header";
import Footer from "../components/Footer";

// Kontaktseite – E-Mail und offizielle ESTV-Ressource
export default function Kontakt() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />

      <main style={{ flex: 1, maxWidth: 700, margin: "0 auto", width: "100%", padding: "3rem 1.5rem" }}>
        <h1
          style={{
            fontWeight: 800,
            fontSize: "clamp(1.6rem, 4vw, 2.2rem)",
            color: "#111827",
            letterSpacing: "-0.03em",
            marginBottom: "0.5rem",
          }}
        >
          Kontakt & Support
        </h1>
        <p style={{ color: "#6b7280", fontSize: "1rem", marginBottom: "2.5rem", lineHeight: 1.6 }}>
          Haben Sie Fragen oder benötigen Sie Hilfe? Wir helfen gerne weiter.
        </p>

        {/* E-Mail Karte */}
        <div
          style={{
            background: "#fff",
            border: "1.5px solid #e5e7eb",
            borderRadius: 14,
            padding: "1.75rem",
            marginBottom: "1.25rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#fff8f0",
                border: "1px solid #fde8c8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                flexShrink: 0,
              }}
            >
              ✉
            </div>
            <div>
              <h2 style={{ fontWeight: 700, fontSize: "1rem", color: "#111827", marginBottom: 2 }}>
                E-Mail Support
              </h2>
              <p style={{ fontSize: "0.82rem", color: "#9ca3af" }}>
                Antwort in der Regel innerhalb von 1–2 Werktagen
              </p>
            </div>
          </div>
          <a
            href="mailto:support@btcsteuerauszug.ch"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#F7931A",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "0.9rem",
              textDecoration: "none",
            }}
          >
            support@btcsteuerauszug.ch
          </a>
        </div>

        {/* ESTV Karte */}
        <div
          style={{
            background: "#f0f9ff",
            border: "1.5px solid #bae6fd",
            borderRadius: 14,
            padding: "1.75rem",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "#e0f2fe",
                border: "1px solid #bae6fd",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.2rem",
                flexShrink: 0,
              }}
            >
              🇨🇭
            </div>
            <div>
              <h2 style={{ fontWeight: 700, fontSize: "1rem", color: "#0369a1", marginBottom: 2 }}>
                Offizielle Informationen
              </h2>
              <p style={{ fontSize: "0.82rem", color: "#0284c7" }}>
                Bundesbehörde für Steuerinformationen
              </p>
            </div>
          </div>
          <p style={{ fontSize: "0.88rem", color: "#374151", lineHeight: 1.6, marginBottom: "1rem" }}>
            Massgebliche Informationen zur Besteuerung von Kryptowährungen in der Schweiz
            finden Sie direkt bei der Eidgenössischen Steuerverwaltung (ESTV):
          </p>
          <a
            href="https://www.estv.admin.ch/de/kryptowaehrungen-besteuerung"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 18px",
              background: "#0369a1",
              color: "#fff",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: "0.88rem",
              textDecoration: "none",
            }}
          >
            Offizielle Informationen des Bundes zur Besteuerung von Kryptowährungen (ESTV)
            <span style={{ fontSize: "0.8rem", opacity: 0.85 }}>↗</span>
          </a>
        </div>

        {/* Hinweis */}
        <div
          style={{
            marginTop: "2rem",
            padding: "12px 16px",
            background: "#fff8f0",
            border: "1px solid #fde8c8",
            borderRadius: 8,
          }}
        >
          <p style={{ fontSize: "0.78rem", color: "#78350f", lineHeight: 1.6 }}>
            <strong>Hinweis:</strong> btcSteuerauszug.ch ist kein Steuerberater und ersetzt
            keine professionelle Steuerberatung. Für verbindliche Auskünfte wenden Sie sich
            an Ihre kantonale Steuerbehörde.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
