"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "./components/Header";
import Footer from "./components/Footer";

// ─── Coin-Logos (offizielle SVG-Icons) ──────────────────────────────────────

function BtcLogo({ size = 20, farbe = "currentColor", aktiv = false }) {
  // Aktiv (auf orangem Hintergrund): weisser Kreis + oranges ₿
  // Inaktiv: orangener Kreis + weisses ₿
  const circleFill = aktiv ? "white" : farbe;
  const symbolFill = aktiv ? farbe : "white";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="16" fill={circleFill} />
      <path
        d="M22.1 14.0c.3-2.1-1.3-3.2-3.5-3.9l.7-2.8-1.7-.4-.7 2.7c-.4-.1-.9-.2-1.4-.3l.7-2.7-1.7-.4-.7 2.7c-.4-.1-.7-.1-.7-.1l-2.2-.6-.5 1.8s1.3.3 1.3.3c.7.2.8.7.7 1.1l-.8 3.3.1.1h-.2l-1.1 4.5s-.2.4-.6.3c0 0-1.3-.3-1.3-.3l-.8 2 2.1.5.7.2-.7 2.8 1.7.4.7-2.7c.5.1 1 .2 1.5.3l-.7 2.7 1.7.4.7-2.8c2.9.6 5 .3 5.9-2.3.7-2-.03-3.2-1.5-3.9 1.1-.3 1.9-1.1 2.1-2.6zm-3.7 5.2c-.5 2-3.9.9-5 .6l.9-3.5c1.1.3 4.6.9 4.1 2.9zm.5-5.3c-.5 1.8-3.3.9-4.2.7l.8-3.1c1 .3 4 .7 3.4 2.4z"
        fill={symbolFill}
      />
    </svg>
  );
}

function EthLogo({ size = 20, farbe = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2.5l-9.5 14 9.5-3.4 9.5 3.4z" fill={farbe} fillOpacity="0.55" />
      <path d="M6.5 16.5l9.5 3.5 9.5-3.5-9.5-3.4z" fill={farbe} />
      <path d="M16 21.5l-9.5-3.4 9.5 11.4z" fill={farbe} fillOpacity="0.55" />
      <path d="M16 21.5l9.5-3.4-9.5 11.4z" fill={farbe} />
      <path d="M16 13.1l-9.5 3.4 9.5-14z" fill={farbe} fillOpacity="0.8" />
      <path d="M16 13.1l9.5 3.4-9.5-14z" fill={farbe} />
    </svg>
  );
}

function SolLogo({ size = 20, farbe = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M5 23.5h17.8c.3 0 .6.1.8.3l2.4 2.4c.3.3.1.8-.4.8H7.8c-.3 0-.6-.1-.8-.3L4.6 24.3c-.3-.3-.1-.8.4-.8z" fill={farbe} />
      <path d="M5 14.5h17.8c.3 0 .6.1.8.3l2.4 2.4c.3.3.1.8-.4.8H7.8c-.3 0-.6-.1-.8-.3L4.6 15.3c-.3-.3-.1-.8.4-.8z" fill={farbe} />
      <path d="M25.6 9.1l-2.4-2.4c-.2-.2-.5-.3-.8-.3H4.6c-.5 0-.7.5-.4.8l2.4 2.4c.2.2.5.3.8.3h17.8c.5 0 .7-.5.4-.8z" fill={farbe} />
    </svg>
  );
}

// ─── Konstanten ─────────────────────────────────────────────────────────────

const KETTEN = [
  {
    id: "bitcoin",
    label: "Bitcoin (BTC)",
    Logo: BtcLogo,
    farbe: "#F7931A",
    farbeDunkel: "#d97706",
    platzhalter: "bc1…bknm",
    hinweis: null,
    aktiv: true,
  },
  {
    id: "ethereum",
    label: "ERC-20 Tokens",
    Logo: EthLogo,
    farbe: "#627EEA",
    farbeDunkel: "#4f63c4",
    platzhalter: "0xd…045",
    hinweis: "Zeigt ETH + alle ERC-20 Tokens (USDC, LINK, UNI etc.)",
    aktiv: false,
  },
  {
    id: "solana",
    label: "Solana (SOL)",
    Logo: SolLogo,
    farbe: "#9945FF",
    farbeDunkel: "#7c32d9",
    platzhalter: "7v9…y1q",
    hinweis: null,
    aktiv: false,
  },
];

// ─── Adress-Validierung ──────────────────────────────────────────────────────

function validiereAdresse(adresse, kette) {
  const bereinigt = adresse.trim();
  if (!bereinigt) return "Bitte geben Sie eine Wallet-Adresse ein.";

  if (kette === "bitcoin") {
    if (!/^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(bereinigt))
      return "Ungültige Bitcoin-Adresse. Gültige Formate: 1..., 3..., bc1...";
  } else if (kette === "ethereum") {
    if (!/^0x[a-fA-F0-9]{40}$/.test(bereinigt))
      return "Ungültige Ethereum-Adresse. Format: 0x + 40 Hex-Zeichen.";
  } else if (kette === "solana") {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(bereinigt))
      return "Ungültige Solana-Adresse (Base58, 32–44 Zeichen).";
  }
  return null;
}

// ─── WalletKarte – einzelne Wallet-Eingabe ───────────────────────────────────

function WalletKarte({ walletDaten, onUpdate, onEntfernen, onAnalysieren, istErste }) {
  const { id, kette, adresse } = walletDaten;
  const [fehler, setFehler] = useState("");
  const [laedt, setLaedt] = useState(false);

  const aktiveKetteInfo = KETTEN.find((k) => k.id === kette);
  const ketteAktiv = aktiveKetteInfo?.aktiv !== false;

  const handleKetteWechsel = (neueKette) => {
    onUpdate(id, { kette: neueKette, adresse: "" });
    setFehler("");
  };

  const handleAdresseAendern = (neueAdresse) => {
    onUpdate(id, { adresse: neueAdresse });
    setFehler("");
  };

  const handleAnalysieren = () => {
    const validierungsFehler = validiereAdresse(adresse, kette);
    if (validierungsFehler) {
      setFehler(validierungsFehler);
      return;
    }
    setLaedt(true);
    onAnalysieren(id);
  };

  return (
    <div
      style={{
        border: "1.5px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
        background: "#fff",
        position: "relative",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* Schliessen-Button für zusätzliche Wallets */}
      {!istErste && (
        <button
          onClick={() => onEntfernen(id)}
          title="Wallet entfernen"
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#9ca3af",
            fontSize: "1.3rem",
            lineHeight: 1,
            zIndex: 2,
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      )}

      {/* Chain-Tabs mit farbigen Hintergründen */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
        {KETTEN.map((k) => {
          const aktiv = kette === k.id;
          return (
            <button
              key={k.id}
              onClick={() => handleKetteWechsel(k.id)}
              style={{
                flex: 1,
                padding: "13px 8px",
                border: "none",
                cursor: "pointer",
                fontWeight: aktiv ? 700 : 500,
                fontSize: "0.87rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "background 0.15s, color 0.15s",
                background: aktiv ? k.farbe : "#f9fafb",
                color: aktiv ? "#fff" : "#6b7280",
                borderRight: "1px solid #e5e7eb",
              }}
            >
              <k.Logo
                size={18}
                farbe={k.id === "bitcoin" ? k.farbe : (aktiv ? "#fff" : k.farbe)}
                aktiv={k.id === "bitcoin" ? aktiv : false}
              />
              <span className="hidden sm:inline">{k.label}</span>
              <span className="inline sm:hidden">{k.id === "bitcoin" ? "BTC" : k.id === "ethereum" ? "ERC-20" : "SOL"}</span>
              {!k.aktiv && (
                <span style={{ fontSize: "9px", fontWeight: 600, opacity: 0.8 }}>
                  🔧
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Eingabebereich */}
      <div style={{ padding: "1.25rem" }}>
        {/* Für inaktive Ketten: gesperrtes Input + Checkliste */}
        {!ketteAktiv ? (
          <div>
            <div style={{ position: "relative" }}>
              <input
                disabled
                placeholder="In Development"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  paddingRight: "140px",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 8,
                  fontSize: "0.88rem",
                  fontFamily: "monospace",
                  background: "#f5f5f5",
                  color: "#9ca3af",
                  cursor: "not-allowed",
                  boxSizing: "border-box",
                }}
              />
              <span style={{
                position: "absolute", top: "50%", right: "12px",
                transform: "translateY(-50%)",
                fontSize: "11px", color: "#f59e0b", fontWeight: 600,
                pointerEvents: "none",
              }}>
                🔧 In Development
              </span>
            </div>
            <button
              disabled
              style={{
                marginTop: 8,
                padding: "11px 18px",
                background: "#d1d5db",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                cursor: "not-allowed",
                fontSize: "0.88rem",
                opacity: 0.4,
              }}
            >
              Analysieren →
            </button>

            {/* Checkliste für ERC-20 */}
            {kette === "ethereum" && (
              <div style={{
                background: "#fffbeb", border: "1px solid #f59e0b",
                borderRadius: 8, padding: 16, marginTop: 12,
              }}>
                <p style={{ fontWeight: 700, color: "#92400e", marginBottom: 8, fontSize: "0.88rem" }}>
                  🔧 ERC-20 Support – In Development
                </p>
                <p style={{ fontSize: "0.8rem", color: "#78350f", marginBottom: 8 }}>
                  Folgende Features werden noch entwickelt:
                </p>
                <ul style={{ fontSize: "0.8rem", color: "#78350f", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                  <li>☐ Multi-Asset PDF (ETH + alle ERC-20 Token pro Seite)</li>
                  <li>☐ eSteuerauszug XML mit mehreren Assets (eCH-0196 v2.2)</li>
                  <li>☐ Vollständige historische CHF-Kurse für alle ERC-20 Token</li>
                  <li>☐ Top-500 CoinGecko Validierung (Scam-Token filtern)</li>
                  <li>☐ FIFO G/V Berechnung über mehrere Assets</li>
                  <li>☐ Anfangsbestand 01.01. pro Token</li>
                </ul>
                <p style={{ fontSize: "0.75rem", color: "#92400e", marginTop: 10 }}>
                  Verfügbar in Phase 2 – benachrichtige mich unter{" "}
                  <a href="mailto:info@btcsteuerauszug.ch" style={{ color: "#F7931A" }}>info@btcsteuerauszug.ch</a>
                </p>
              </div>
            )}

            {/* Checkliste für Solana */}
            {kette === "solana" && (
              <div style={{
                background: "#fffbeb", border: "1px solid #f59e0b",
                borderRadius: 8, padding: 16, marginTop: 12,
              }}>
                <p style={{ fontWeight: 700, color: "#92400e", marginBottom: 8, fontSize: "0.88rem" }}>
                  🔧 Solana Support – In Development
                </p>
                <ul style={{ fontSize: "0.8rem", color: "#78350f", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
                  <li>☐ Solana Wallet Analyse (SPL Tokens)</li>
                  <li>☐ Multi-Asset PDF für SOL + SPL Tokens</li>
                  <li>☐ eSteuerauszug XML Solana-Assets</li>
                  <li>☐ Historische SOL/CHF Kurse (alle Transaktionsdaten)</li>
                  <li>☐ FIFO G/V Berechnung</li>
                </ul>
                <p style={{ fontSize: "0.75rem", color: "#92400e", marginTop: 10 }}>
                  Verfügbar in Phase 2
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Hinweis für ERC-20 (nur wenn aktiv) */}
            {aktiveKetteInfo.hinweis && (
              <div
                style={{
                  fontSize: "0.78rem",
                  color: "#4f63c4",
                  marginBottom: 10,
                  padding: "6px 10px",
                  background: "#f0f3ff",
                  borderRadius: 6,
                  border: "1px solid #e0e7ff",
                }}
              >
                ℹ️ {aktiveKetteInfo.hinweis}
              </div>
            )}

            {/* Adress-Eingabe + Analysieren-Button */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={adresse}
                onChange={(e) => handleAdresseAendern(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAnalysieren()}
                placeholder={aktiveKetteInfo.platzhalter}
                disabled={laedt}
                style={{
                  flex: 1,
                  padding: "11px 14px",
                  border: `1.5px solid ${fehler ? "#ef4444" : "#e5e7eb"}`,
                  borderRadius: 8,
                  fontSize: "0.88rem",
                  fontFamily: "monospace",
                  outline: "none",
                  background: "#fff",
                  color: "#111827",
                  minWidth: 0,
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = aktiveKetteInfo.farbe;
                  e.target.style.boxShadow = `0 0 0 3px ${aktiveKetteInfo.farbe}22`;
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = fehler ? "#ef4444" : "#e5e7eb";
                  e.target.style.boxShadow = "none";
                }}
              />

              <button
                onClick={handleAnalysieren}
                disabled={laedt}
                style={{
                  padding: "11px 18px",
                  background: laedt ? "#d1d5db" : aktiveKetteInfo.farbe,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: laedt ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  fontSize: "0.88rem",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={(e) => !laedt && (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {laedt ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: "2px solid rgba(255,255,255,0.4)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                        display: "inline-block",
                      }}
                    />
                    Laden...
                  </>
                ) : (
                  "Analysieren →"
                )}
              </button>
            </div>

            {/* Fehlermeldung */}
            {fehler && (
              <p
                style={{
                  color: "#dc2626",
                  fontSize: "0.78rem",
                  marginTop: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                ⚠ {fehler}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Live-Preise Sektion ──────────────────────────────────────────────────────

function LivePreise() {
  const [preise, setPreise] = useState(null);
  const [fehler, setFehler] = useState(false);

  const ladePreise = useCallback(async () => {
    try {
      const antwort = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=chf&include_24hr_change=true"
      );
      if (!antwort.ok) throw new Error("Fehler");
      const daten = await antwort.json();
      setPreise({
        BTC: { preis: daten.bitcoin?.chf, aenderung: daten.bitcoin?.chf_24h_change },
        ETH: { preis: daten.ethereum?.chf, aenderung: daten.ethereum?.chf_24h_change },
        SOL: { preis: daten.solana?.chf, aenderung: daten.solana?.chf_24h_change },
      });
      setFehler(false);
    } catch {
      setFehler(true);
    }
  }, []);

  useEffect(() => {
    ladePreise();
    const intervall = setInterval(ladePreise, 60_000);
    return () => clearInterval(intervall);
  }, [ladePreise]);

  const COINS = [
    { symbol: "BTC", name: "Bitcoin",  farbe: "#F7931A", Logo: BtcLogo },
    { symbol: "ETH", name: "Ethereum", farbe: "#627EEA", Logo: EthLogo },
    { symbol: "SOL", name: "Solana",   farbe: "#9945FF", Logo: SolLogo },
  ];

  const formatPreis = (wert) =>
    wert
      ? new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF", maximumFractionDigits: 0 }).format(wert)
      : "—";

  if (fehler) return null;

  return (
    <section
      style={{
        padding: "1.5rem 1.5rem",
        background: "#fafafa",
        borderTop: "1px solid #f0f0f0",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.75rem",
          }}
        >
          {COINS.map(({ symbol, name, farbe, Logo }) => {
            const d = preise?.[symbol];
            const positiv = (d?.aenderung ?? 0) >= 0;
            return (
              <div
                key={symbol}
                style={{
                  background: "#fff",
                  border: "1px solid #f0f0f0",
                  borderRadius: 10,
                  padding: "0.875rem 1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Logo size={22} farbe={farbe} />
                  <span style={{ fontSize: "0.78rem", color: "#6b7280", fontWeight: 600 }}>
                    {name}
                  </span>
                </div>
                <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#111827" }}>
                  {d ? formatPreis(d.preis) : (
                    <span style={{
                      display: "inline-block", width: 80, height: 14,
                      background: "#f0f0f0", borderRadius: 4, animation: "pulse 1.5s ease-in-out infinite",
                    }} />
                  )}
                </div>
                {d?.aenderung != null && (
                  <div style={{
                    fontSize: "0.75rem", fontWeight: 600,
                    color: positiv ? "#16a34a" : "#dc2626",
                  }}>
                    {positiv ? "▲" : "▼"} {Math.abs(d.aenderung).toFixed(2)}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p style={{ textAlign: "center", fontSize: "0.68rem", color: "#d1d5db", marginTop: "0.5rem" }}>
          Live-Kurse in CHF · Quelle: CoinGecko · Auto-Refresh alle 60s
        </p>
      </div>
    </section>
  );
}

// ─── Feature-Box ─────────────────────────────────────────────────────────────

function FeatureBox({ icon, titel, text, preis, highlight }) {
  return (
    <div
      style={{
        background: highlight ? "#fff8f0" : "#fafafa",
        border: `1.5px solid ${highlight ? "#fde8c8" : "#f0f0f0"}`,
        borderRadius: 12,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        position: "relative",
      }}
    >
      {highlight && (
        <div
          style={{
            position: "absolute",
            top: -10,
            right: 16,
            background: "#F7931A",
            color: "#fff",
            fontSize: "0.65rem",
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 4,
            letterSpacing: "0.06em",
          }}
        >
          EMPFOHLEN
        </div>
      )}
      <div style={{ fontSize: "1.8rem" }}>{icon}</div>
      <div>
        <h3 style={{ fontWeight: 700, color: "#111827", marginBottom: 4, fontSize: "1rem" }}>
          {titel}
        </h3>
        {preis && (
          <span
            style={{
              fontSize: "0.8rem",
              fontWeight: 700,
              color: "#F7931A",
              marginBottom: 4,
              display: "block",
            }}
          >
            {preis}
          </span>
        )}
        <p style={{ color: "#6b7280", fontSize: "0.85rem", lineHeight: 1.5 }}>{text}</p>
      </div>
    </div>
  );
}

// ─── Preisrechner für mehrere Wallets ────────────────────────────────────────

function PreisAnzeige({ anzahlWallets }) {
  if (anzahlWallets <= 1) return null;
  const preis = (2.10 + (anzahlWallets - 1) * 1.00).toFixed(2);
  return (
    <div
      style={{
        background: "#f0f5ff",
        border: "1px solid #e0e7ff",
        borderRadius: 8,
        padding: "10px 16px",
        fontSize: "0.85rem",
        color: "#374151",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>
        {anzahlWallets} Wallets für den eSteuerauszug
      </span>
      <span style={{ fontWeight: 700, color: "#4f46e5" }}>
        CHF {preis}
      </span>
    </div>
  );
}

// ─── Hauptkomponente ─────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter();

  // Aktive Chain-Auswahl (nur BTC ist derzeit freigeschaltet)
  const [aktiveKette, setAktiveKette] = useState("bitcoin");

  // BTC-Wallet-Adressen – einfaches String-Array, nur Bitcoin
  const [wallets, setWallets] = useState([""]);
  const [walletFehler, setWalletFehler] = useState([]);
  const [analysieren, setAnalysieren] = useState(false); // Sofort-Feedback beim Klick

  const addWallet = () => setWallets((prev) => [...prev, ""]);
  const removeWallet = (i) =>
    setWallets((prev) => prev.filter((_, idx) => idx !== i));
  const updateWallet = (i, val) => {
    setWallets((prev) => { const u = [...prev]; u[i] = val; return u; });
    setWalletFehler((prev) => { const u = [...prev]; u[i] = ""; return u; });
  };

  // Alle ausgefüllten Wallets auf einmal analysieren
  const handleAnalyzeAll = useCallback(() => {
    const ausgefuellte = wallets
      .map((adresse, i) => ({ adresse: adresse.trim(), i }))
      .filter((w) => w.adresse);

    if (ausgefuellte.length === 0) return;

    // Alle ausgefüllten Adressen validieren
    const fehlerListe = [...walletFehler];
    let hatFehler = false;
    ausgefuellte.forEach(({ adresse, i }) => {
      const f = validiereAdresse(adresse, "bitcoin");
      fehlerListe[i] = f || "";
      if (f) hatFehler = true;
    });

    if (hatFehler) {
      setWalletFehler(fehlerListe);
      return;
    }

    // Sofort Ladeindikator zeigen (vor router.push)
    setAnalysieren(true);

    // Wallets als Objekt-Array in localStorage speichern
    const walletObjekte = ausgefuellte.map(({ adresse }, idx) => ({
      id: Date.now() + idx,
      kette: "bitcoin",
      adresse,
    }));
    localStorage.setItem("cryptotax_wallets", JSON.stringify(walletObjekte));
    localStorage.setItem("cryptotax_wallet", walletObjekte[0].adresse);
    localStorage.setItem("cryptotax_chain", "bitcoin");

    router.push("/dashboard");
  }, [wallets, walletFehler, router]);

  // ─── CSV Upload ────────────────────────────────────────────────────────────
  const [csvLaedt, setCsvLaedt] = useState(false);
  const [csvStatus, setCsvStatus] = useState(null); // null | { typ: "fehler"|"ok", text }
  const [csvDragOver, setCsvDragOver] = useState(false);
  const csvInputRef = useRef(null);

  // BitBox-Format: Time,Type,Amount,Unit,Fee,Fee Unit,Address,Transaction ID,Note
  const parseBitBoxCsv = (csvText) => {
    const zeilen = csvText.trim().split(/\r?\n/);
    if (zeilen.length < 2) throw new Error("CSV enthält keine Datensätze");

    const header = zeilen[0].split(",").map((s) => s.trim().replace(/"/g, "").toLowerCase());
    const txs = [];

    for (let i = 1; i < zeilen.length; i++) {
      const felder = zeilen[i].split(",").map((s) => s.trim().replace(/"/g, ""));
      if (felder.length < 4) continue;

      const row = {};
      header.forEach((h, idx) => { row[h] = felder[idx] || ""; });

      if (!row.time && !row.date) continue;

      let betrag = parseFloat(row.amount || "0");
      let waehrung = (row.unit || "").trim().toUpperCase();

      // Einheit konvertieren
      if (waehrung === "SATOSHI") { betrag /= 100_000_000; waehrung = "BTC"; }
      else if (waehrung === "WEI") { betrag /= 1e18; waehrung = "ETH"; }

      if (isNaN(betrag) || betrag <= 0) continue;

      const rawTyp = (row.type || "").toLowerCase();
      const typ = rawTyp === "received" || rawTyp === "eingang" ? "eingang" : "ausgang";

      const datum = row.time || row.date;
      txs.push({
        datum,
        datumStr: datum.slice(0, 10),
        typ,
        betrag,
        waehrung,
        hash: row["transaction id"] || row.txid || row.hash || "",
      });
    }

    if (txs.length === 0) throw new Error("Keine gültigen Transaktionen gefunden");
    return txs;
  };

  const handleCsvDatei = async (datei) => {
    if (!datei || !datei.name.endsWith(".csv")) {
      setCsvStatus({ typ: "fehler", text: "Bitte nur .csv Dateien hochladen" });
      return;
    }

    setCsvLaedt(true);
    setCsvStatus({ typ: "info", text: `${datei.name} wird verarbeitet...` });

    try {
      const inhalt = await datei.text();
      const transaktionen = parseBitBoxCsv(inhalt);

      setCsvStatus({ typ: "info", text: `${transaktionen.length} Transaktionen gefunden. CHF-Kurse werden geladen...` });

      const antwort = await fetch("/api/wallet/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaktionen, dateiname: datei.name.replace(".csv", "") }),
      });

      if (!antwort.ok) {
        const err = await antwort.json().catch(() => ({}));
        throw new Error(err.error || "API-Fehler");
      }

      const daten = await antwort.json();
      sessionStorage.setItem("csv_import_data", JSON.stringify(daten));

      // Als "csv"-Wallet in localStorage speichern
      const csvWallet = { id: Date.now(), kette: "csv", adresse: datei.name.replace(".csv", "") };
      localStorage.setItem("cryptotax_wallets", JSON.stringify([csvWallet]));
      localStorage.setItem("cryptotax_wallet", csvWallet.adresse);
      localStorage.setItem("cryptotax_chain", "csv");

      setCsvStatus({ typ: "ok", text: `${transaktionen.length} Transaktionen importiert` });
      setTimeout(() => router.push("/dashboard"), 600);
    } catch (err) {
      setCsvStatus({ typ: "fehler", text: err.message });
    } finally {
      setCsvLaedt(false);
    }
  };

  // FAQ-Einträge
  const FAQ_EINTRAEGE = [
    {
      frage: "Welche Daten benötige ich?",
      antwort:
        "Nur Ihre öffentliche Wallet-Adresse – kein Private Key, kein Login, keine Registrierung. Alle Daten werden direkt von der Blockchain geladen.",
    },
    {
      frage: "Wie werden die CHF-Kurse berechnet?",
      antwort:
        "Historische CHF-Kurse werden via CoinMarketCap und CryptoCompare abgerufen (4-stufiges Fallback-System). Für den Stichtag 31.12. empfehlen wir die Kursliste der ESTV zu verwenden.",
    },
    {
      frage: "Was ist der eSteuerauszug mit Barcode?",
      antwort:
        "Der eSteuerauszug enthält einen maschinenlesbaren Barcode nach dem Schweizer eCH-0196 v2.2.0 Standard und kann direkt in Steuersoftware (PrivaTax, TaxMe etc.) importiert werden.",
    },
    {
      frage: "Kann ich mehrere Wallets gleichzeitig analysieren?",
      antwort:
        "Ja! Fügen Sie beliebig viele Wallets mit dem «+ Weitere Wallet» Button hinzu. Im Dashboard werden alle Wallets übersichtlich angezeigt.",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <Header />

      {/* Spinner-Keyframe – in echtem Code würde man @keyframes in CSS schreiben */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      <main style={{ flex: 1 }}>
        {/* ─── Hero-Bereich ─── */}
        <section
          style={{
            background: "#fff",
            padding: "4rem 1.5rem 3rem",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            {/* Schweizer Badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                background: "#f0f9ff",
                border: "1px solid #bae6fd",
                borderRadius: 20,
                fontSize: "0.78rem",
                color: "#0369a1",
                fontWeight: 500,
                marginBottom: "1.5rem",
              }}
            >
              🇨🇭 Speziell für die Schweizer Steuererklärung
            </div>

            {/* Haupttitel */}
            <h1
              style={{
                fontSize: "clamp(1.8rem, 5vw, 2.8rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#111827",
                lineHeight: 1.15,
                marginBottom: "1rem",
              }}
            >
              Wallet-Adresse eingeben.{" "}
              <span style={{ color: "#F7931A" }}>Steuerauszug erhalten.</span>
            </h1>

            <p
              style={{
                color: "#6b7280",
                fontSize: "1.05rem",
                lineHeight: 1.65,
                marginBottom: "2.5rem",
                maxWidth: 520,
                margin: "0 auto 2.5rem",
              }}
            >
              Ihr digitaler Steuerauszug für Krypto-Assets – angelehnt an den
              eSteuerauszug der Schweizer Banken.
            </p>

            {/* ─── Chain-Tabs (BTC / ERC-20 / SOL) ─── */}
            <div style={{
              display: "flex",
              borderRadius: 12,
              border: "1.5px solid #e5e7eb",
              overflow: "hidden",
              marginBottom: 16,
            }}>
              {KETTEN.map((k) => {
                const aktiv = aktiveKette === k.id;
                return (
                  <button
                    key={k.id}
                    onClick={() => setAktiveKette(k.id)}
                    style={{
                      flex: 1,
                      padding: "12px 8px",
                      border: "none",
                      borderRight: "1px solid #e5e7eb",
                      cursor: "pointer",
                      fontWeight: aktiv ? 700 : 500,
                      fontSize: "0.87rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      background: aktiv ? k.farbe : "#f9fafb",
                      color: aktiv ? "#fff" : "#6b7280",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    <k.Logo
                      size={18}
                      farbe={k.id === "bitcoin" ? k.farbe : (aktiv ? "#fff" : k.farbe)}
                      aktiv={k.id === "bitcoin" ? aktiv : false}
                    />
                    <span>{k.label}</span>
                    {!k.aktiv && (
                      <span style={{ fontSize: "9px", fontWeight: 600, opacity: 0.8 }}>🔧</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ─── Bitcoin Wallet-Eingaben ─── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0, textAlign: "left" }}>

              {/* ERC-20 "In Development" */}
              {aktiveKette === "ethereum" && (
                <div>
                  <input
                    disabled
                    placeholder="In Development"
                    style={{
                      width: "100%",
                      padding: "11px 14px",
                      border: "1.5px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: "0.88rem",
                      fontFamily: "monospace",
                      background: "#f5f5f5",
                      color: "#9ca3af",
                      cursor: "not-allowed",
                      boxSizing: "border-box",
                      marginBottom: 8,
                    }}
                  />
                  <button disabled style={{
                    padding: "13px 24px", background: "#d1d5db", color: "#fff",
                    border: "none", borderRadius: 8, fontWeight: 700,
                    cursor: "not-allowed", fontSize: "0.95rem",
                    width: "100%", opacity: 0.4, marginBottom: 8,
                  }}>
                    Analysieren →
                  </button>
                  <div style={{
                    background: "#fffbeb", border: "1px solid #f59e0b",
                    borderRadius: 8, padding: "12px 16px", marginTop: 4,
                    fontSize: "13px", color: "#92400e",
                  }}>
                    <strong>🔧 ERC-20 – In Development</strong><br />
                    Multi-Asset Support (ETH + Token), eSteuerauszug XML und historische
                    CHF-Kurse für alle ERC-20 Token werden aktuell entwickelt.<br />
                    <span style={{ fontSize: "12px", marginTop: 4, display: "block" }}>
                      Verfügbar in Phase 2 ·{" "}
                      <a href="mailto:info@btcsteuerauszug.ch" style={{ color: "#f59e0b" }}>
                        Benachrichtigung anfordern
                      </a>
                    </span>
                  </div>
                </div>
              )}

              {/* Solana "In Development" */}
              {aktiveKette === "solana" && (
                <div>
                  <input
                    disabled
                    placeholder="In Development"
                    style={{
                      width: "100%",
                      padding: "11px 14px",
                      border: "1.5px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: "0.88rem",
                      fontFamily: "monospace",
                      background: "#f5f5f5",
                      color: "#9ca3af",
                      cursor: "not-allowed",
                      boxSizing: "border-box",
                      marginBottom: 8,
                    }}
                  />
                  <button disabled style={{
                    padding: "13px 24px", background: "#d1d5db", color: "#fff",
                    border: "none", borderRadius: 8, fontWeight: 700,
                    cursor: "not-allowed", fontSize: "0.95rem",
                    width: "100%", opacity: 0.4, marginBottom: 8,
                  }}>
                    Analysieren →
                  </button>
                  <div style={{
                    background: "#fffbeb", border: "1px solid #f59e0b",
                    borderRadius: 8, padding: "12px 16px", marginTop: 4,
                    fontSize: "13px", color: "#92400e",
                  }}>
                    <strong>🔧 Solana – In Development</strong><br />
                    Solana Wallet Analyse (SOL + SPL Tokens), eSteuerauszug XML und
                    historische CHF-Kurse werden aktuell entwickelt.<br />
                    <span style={{ fontSize: "12px", marginTop: 4, display: "block" }}>
                      Verfügbar in Phase 2 ·{" "}
                      <a href="mailto:info@btcsteuerauszug.ch" style={{ color: "#f59e0b" }}>
                        Benachrichtigung anfordern
                      </a>
                    </span>
                  </div>
                </div>
              )}

              {/* Bitcoin Multi-Wallet Eingaben */}
              {aktiveKette === "bitcoin" && wallets.map((w, i) => (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        type="text"
                        value={w}
                        onChange={(e) => updateWallet(i, e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAnalyzeAll()}
                        placeholder="bc1q...bknm"
                        style={{
                          width: "100%",
                          padding: "11px 56px 11px 14px",
                          border: `1.5px solid ${walletFehler[i] ? "#ef4444" : "#e5e7eb"}`,
                          borderRadius: 8,
                          fontSize: "0.88rem",
                          fontFamily: "monospace",
                          outline: "none",
                          background: "#fff",
                          color: "#111827",
                          boxSizing: "border-box",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "#F7931A";
                          e.target.style.boxShadow = "0 0 0 3px #F7931A22";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = walletFehler[i] ? "#ef4444" : "#e5e7eb";
                          e.target.style.boxShadow = "none";
                        }}
                      />
                      <span style={{
                        position: "absolute", right: 10, top: "50%",
                        transform: "translateY(-50%)",
                        fontSize: "11px", color: "#F7931A", fontWeight: 700,
                        pointerEvents: "none",
                      }}>
                        ₿ BTC
                      </span>
                    </div>
                    {wallets.length > 1 && (
                      <button
                        onClick={() => removeWallet(i)}
                        title="Wallet entfernen"
                        style={{
                          padding: "11px 14px",
                          background: "none",
                          border: "1.5px solid #e5e7eb",
                          borderRadius: 8,
                          cursor: "pointer",
                          color: "#dc2626",
                          fontSize: "1.1rem",
                          flexShrink: 0,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {walletFehler[i] && (
                    <p style={{ color: "#dc2626", fontSize: "0.78rem", marginTop: 4 }}>
                      ⚠ {walletFehler[i]}
                    </p>
                  )}
                </div>
              ))}

              {/* + Weitere Bitcoin Wallet (nur bei BTC) */}
              {aktiveKette === "bitcoin" && (
                <button
                  onClick={addWallet}
                  style={{
                    background: "none",
                    border: "1.5px dashed #fde8c8",
                    borderRadius: 10,
                    padding: "10px",
                    cursor: "pointer",
                    color: "#f59e0b",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    marginBottom: 8,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#F7931A";
                    e.currentTarget.style.color = "#d97706";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#fde8c8";
                    e.currentTarget.style.color = "#f59e0b";
                  }}
                >
                  + Weitere Bitcoin Wallet hinzufügen
                </button>
              )}

              {/* Preishinweis bei mehreren ausgefüllten Wallets */}
              {aktiveKette === "bitcoin" && wallets.filter((w) => w.trim()).length > 1 && (
                <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: 8, marginTop: -4 }}>
                  eSteuerauszug: CHF 2.10 + {wallets.filter((w) => w.trim()).length - 1} × CHF 1.00
                  {" = CHF "}{(2.10 + (wallets.filter((w) => w.trim()).length - 1) * 1.00).toFixed(2)}
                </p>
              )}

              {/* EINZIGER Analysieren-Button für alle Wallets (nur BTC aktiv) */}
              {aktiveKette === "bitcoin" && (
                <button
                  onClick={handleAnalyzeAll}
                  disabled={wallets.every((w) => !w.trim()) || analysieren}
                  style={{
                    padding: "13px 24px",
                    background: wallets.every((w) => !w.trim()) || analysieren ? "#d1d5db" : "#F7931A",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    cursor: wallets.every((w) => !w.trim()) || analysieren ? "not-allowed" : "pointer",
                    fontSize: "0.95rem",
                    width: "100%",
                    marginBottom: 12,
                    transition: "opacity 0.15s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                  onMouseEnter={(e) => !wallets.every((w) => !w.trim()) && !analysieren && (e.currentTarget.style.opacity = "0.9")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                >
                  {analysieren ? (
                    <>
                      <span style={{
                        width: 16, height: 16,
                        border: "2px solid rgba(255,255,255,0.4)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                        display: "inline-block", flexShrink: 0,
                      }} />
                      {wallets.filter((w) => w.trim()).length > 1
                        ? `${wallets.filter((w) => w.trim()).length} Wallets werden geladen…`
                        : "Wird geladen…"}
                    </>
                  ) : (
                    wallets.filter((w) => w.trim()).length > 1
                      ? `${wallets.filter((w) => w.trim()).length} Wallets analysieren →`
                      : "Analysieren →"
                  )}
                </button>
              )}

              {/* ─── CSV-Upload ─── */}
              <div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  margin: "0.5rem 0 0.5rem",
                }}>
                  <div style={{ flex: 1, height: 1, background: "#f0f0f0" }} />
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
                    oder CSV-Datei importieren
                  </span>
                  <div style={{ flex: 1, height: 1, background: "#f0f0f0" }} />
                </div>

                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleCsvDatei(e.target.files[0])}
                />

                <div
                  onDragOver={(e) => { e.preventDefault(); setCsvDragOver(true); }}
                  onDragLeave={() => setCsvDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setCsvDragOver(false);
                    const datei = e.dataTransfer.files[0];
                    if (datei) handleCsvDatei(datei);
                  }}
                  onClick={() => csvInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${csvDragOver ? "#F7931A" : csvStatus?.typ === "fehler" ? "#ef4444" : "#e5e7eb"}`,
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                    cursor: csvLaedt ? "default" : "pointer",
                    background: csvDragOver ? "#fff8f0" : "#fafafa",
                    transition: "border-color 0.15s, background 0.15s",
                    textAlign: "center",
                  }}
                >
                  {csvLaedt ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <span style={{
                        width: 16, height: 16,
                        border: "2px solid #f0f0f0", borderTopColor: "#F7931A",
                        borderRadius: "50%", animation: "spin 0.7s linear infinite",
                        display: "inline-block", flexShrink: 0,
                      }} />
                      <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                        {csvStatus?.text || "Wird verarbeitet..."}
                      </span>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: "1.4rem", marginBottom: 4 }}>📂</div>
                      <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "#374151", margin: 0 }}>
                        CSV hier ablegen oder klicken
                      </p>
                      <p style={{ fontSize: "0.75rem", color: "#9ca3af", margin: "2px 0 0" }}>
                        BitBox-Export-Format (Time, Type, Amount, Unit, ...)
                      </p>
                    </div>
                  )}
                </div>

                {/* Status-Meldung */}
                {csvStatus && !csvLaedt && (
                  <p style={{
                    marginTop: 6, fontSize: "0.78rem",
                    color: csvStatus.typ === "fehler" ? "#dc2626" : csvStatus.typ === "ok" ? "#16a34a" : "#6b7280",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    {csvStatus.typ === "fehler" ? "⚠ " : csvStatus.typ === "ok" ? "✓ " : ""}
                    {csvStatus.text}
                  </p>
                )}
              </div>
            </div>

            {/* Trust-Indikatoren */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "0.75rem 1.5rem",
                marginTop: "1.75rem",
                color: "#9ca3af",
                fontSize: "0.8rem",
              }}
            >
              {[
                "Kein Private Key nötig",
                "Keine Registrierung",
                "Daten nur im Browser",
                "PDF Steuerauszug gratis",
              ].map((text) => (
                <span
                  key={text}
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span> {text}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Live-Preise ─── */}
        <LivePreise />

        {/* ─── Feature-Boxen ─── */}
        <section
          id="features"
          style={{
            padding: "3rem 1.5rem",
            borderTop: "1px solid #f0f0f0",
            background: "#fff",
          }}
        >
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <h2
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: "1.5rem",
                color: "#111827",
                marginBottom: "2rem",
                letterSpacing: "-0.02em",
              }}
            >
              Was Sie erhalten
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1rem",
              }}
            >
              <FeatureBox
                icon="📊"
                titel="Kostenlose Übersicht"
                preis="Kostenlos"
                text="Alle Transaktionen mit historischen CHF-Kursen. Jahresübersicht, FIFO-Berechnung, Gratis-PDF."
              />
              <FeatureBox
                icon="📄"
                titel="PDF Steuerauszug"
                preis="Kostenlos"
                text="Druckbares, professionell formatiertes PDF mit allen Transaktionen und Gewinn-/Verlustberechnung."
              />
              <FeatureBox
                icon="🏦"
                titel="eSteuerauszug mit Barcode"
                preis="CHF 2.10 + CHF 1.00 je weitere Wallet"
                text="Maschinenlesbarer Steuerauszug nach Schweizer eCH-0196 v2.2.0 Standard. Direkt importierbar in PrivaTax und TaxMe."
                highlight
              />
            </div>
          </div>
        </section>

        {/* ─── Preise ─── */}
        <section
          id="preise"
          style={{
            padding: "3rem 1.5rem",
            background: "#fafafa",
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <div style={{ maxWidth: 800, margin: "0 auto" }}>
            <h2
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: "1.5rem",
                color: "#111827",
                marginBottom: "2rem",
                letterSpacing: "-0.02em",
              }}
            >
              Transparente Preise
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "1rem",
              }}
            >
              {/* Gratis */}
              <div
                style={{
                  background: "#fff",
                  border: "1.5px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "1.5rem",
                }}
              >
                <p
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#9ca3af",
                    marginBottom: 8,
                  }}
                >
                  Kostenlos
                </p>
                <p
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#F7931A",
                    marginBottom: "1.25rem",
                  }}
                >
                  Kostenlos
                </p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Transaktions-Analyse",
                    "CHF-Kurse historisch",
                    "Jahresübersicht",
                    "FIFO-Berechnung",
                    "PDF Steuerauszug",
                  ].map((item) => (
                    <li
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "0.87rem",
                        color: "#374151",
                      }}
                    >
                      <span style={{ color: "#22c55e", fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Premium */}
              <div
                style={{
                  background: "#fff8f0",
                  border: "2px solid #F7931A",
                  borderRadius: 12,
                  padding: "1.5rem",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "#F7931A",
                    color: "#fff",
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    padding: "3px 10px",
                    borderRadius: 4,
                    letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}
                >
                  EMPFOHLEN
                </div>
                <p
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#F7931A",
                    marginBottom: 8,
                  }}
                >
                  Premium
                </p>
                <p
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#111827",
                    marginBottom: 4,
                  }}
                >
                  CHF 2.10
                </p>
                <p style={{ color: "#9ca3af", fontSize: "0.8rem", marginBottom: "1.25rem" }}>
                  Einmalig pro Steuerjahr · +CHF 1.00 je weitere Wallet
                </p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    "Alles aus Kostenlos",
                    "eSteuerauszug mit Barcode",
                    "eCH-0196 v2.2.0 XML-Barcode",
                    "Alle Schweizer Kantone",
                    "eCH-0196 v2.2.0 Standard",
                  ].map((item) => (
                    <li
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: "0.87rem",
                        color: "#374151",
                      }}
                    >
                      <span style={{ color: "#F7931A", fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section
          id="faq"
          style={{
            padding: "3rem 1.5rem",
            background: "#fff",
            borderTop: "1px solid #f0f0f0",
          }}
        >
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            <h2
              style={{
                textAlign: "center",
                fontWeight: 700,
                fontSize: "1.5rem",
                color: "#111827",
                marginBottom: "2rem",
                letterSpacing: "-0.02em",
              }}
            >
              Häufige Fragen
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {FAQ_EINTRAEGE.map(({ frage, antwort }) => (
                <FaqEintrag key={frage} frage={frage} antwort={antwort} />
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

// ─── FAQ-Eintrag mit Akkordeon ───────────────────────────────────────────────

function FaqEintrag({ frage, antwort }) {
  const [offen, setOffen] = useState(false);

  return (
    <div
      style={{
        border: "1px solid #f0f0f0",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <button
        onClick={() => setOffen(!offen)}
        style={{
          width: "100%",
          padding: "1rem 1.25rem",
          background: "#fafafa",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          textAlign: "left",
          fontWeight: 600,
          fontSize: "0.92rem",
          color: "#111827",
        }}
      >
        {frage}
        <span
          style={{
            fontSize: "1.1rem",
            color: "#9ca3af",
            transform: offen ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        >
          ▾
        </span>
      </button>
      {offen && (
        <div
          style={{
            padding: "0.75rem 1.25rem 1rem",
            color: "#6b7280",
            fontSize: "0.88rem",
            lineHeight: 1.65,
            borderTop: "1px solid #f0f0f0",
          }}
        >
          {antwort}
        </div>
      )}
    </div>
  );
}
