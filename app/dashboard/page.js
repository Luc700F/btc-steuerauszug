"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Header from "../components/Header";
import Footer from "../components/Footer";
import LoadingBar from "../components/LoadingBar";
import { getSteuerjahre, getJahresStatus } from "../../lib/jahres-utils";
import { detectInputType } from "../../lib/xpub-detector";

// ─── Farben ──────────────────────────────────────────────────────────────────
const FARBEN = {
  bitcoin: "#F7931A",
  ethereum: "#627EEA",
  solana: "#9945FF",
};

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

const formatCHF = (betrag) =>
  new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(betrag || 0);

const formatKrypto = (betrag, stellen = 6) =>
  parseFloat(betrag || 0).toFixed(stellen).replace(/\.?0+$/, "") || "0";

const formatDatum = (datumString) =>
  new Date(datumString).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const kuerzeHash = (hash) =>
  hash ? `${hash.substring(0, 8)}...${hash.substring(hash.length - 6)}` : "–";

const explorerUrl = (hash, kette) => {
  if (kette === "bitcoin") return `https://blockstream.info/tx/${hash}`;
  if (kette === "ethereum") return `https://etherscan.io/tx/${hash}`;
  if (kette === "csv") return "#";
  return `https://solscan.io/tx/${hash}`;
};

// ─── FIFO-Berechnung ─────────────────────────────────────────────────────────
// Berechnet realisierten und unrealisierten Gewinn/Verlust nach FIFO-Methode
function berechneFifo(transaktionen, aktuellerKurs) {
  // Chronologisch sortieren (älteste zuerst für FIFO)
  const sortiert = [...transaktionen].sort(
    (a, b) => new Date(a.datum) - new Date(b.datum)
  );

  const kaufWarteschlange = []; // FIFO-Queue: [{menge, kursChf}]
  let realisierterGewinn = 0;
  let gesamtEingang = 0;
  let gesamtAusgang = 0;

  for (const tx of sortiert) {
    const menge = parseFloat(tx.betrag) || 0;
    const kursChf =
      menge > 0 ? (tx.chfZeitpunkt || 0) / menge : tx.chfZeitpunkt || 0;

    if (tx.typ === "eingang") {
      gesamtEingang += tx.chfZeitpunkt || 0;
      kaufWarteschlange.push({ menge, kursChf });
    } else if (tx.typ === "ausgang") {
      gesamtAusgang += tx.chfZeitpunkt || 0;
      let zuVerkaufen = menge;
      const verkaufsKurs = kursChf;

      while (zuVerkaufen > 1e-10 && kaufWarteschlange.length > 0) {
        const aeltesterKauf = kaufWarteschlange[0];
        if (aeltesterKauf.menge <= zuVerkaufen) {
          realisierterGewinn +=
            (verkaufsKurs - aeltesterKauf.kursChf) * aeltesterKauf.menge;
          zuVerkaufen -= aeltesterKauf.menge;
          kaufWarteschlange.shift();
        } else {
          realisierterGewinn +=
            (verkaufsKurs - aeltesterKauf.kursChf) * zuVerkaufen;
          aeltesterKauf.menge -= zuVerkaufen;
          zuVerkaufen = 0;
        }
      }
    }
  }

  // Unrealisierter Gewinn: aktueller Wert − Kostenbasis der verbleibenden Bestände
  const restBestand = kaufWarteschlange.reduce((s, k) => s + k.menge, 0);
  const kostenbasis = kaufWarteschlange.reduce(
    (s, k) => s + k.menge * k.kursChf,
    0
  );
  const aktuellerWert = restBestand * (aktuellerKurs || 0);
  const unrealisierterGewinn = aktuellerWert - kostenbasis;

  return {
    realisierterGewinn,
    unrealisierterGewinn,
    restBestand,
    kostenbasis,
    gesamtEingang,
    gesamtAusgang,
  };
}

// ─── Checkout-Modal (optionale Kundendaten vor PDF-Export) ───────────────────

const KANTONE_LISTE = ["AG","AI","AR","BE","BL","BS","FR","GE","GL","GR","JU","LU","NE","NW","OW","SG","SH","SO","SZ","TG","TI","UR","VD","VS","ZG","ZH"];

function CheckoutModal({ kantonDefault, onBestaetigen, onUeberspringen, titel }) {
  const [formular, setFormular] = useState({
    vorname: "", nachname: "", adresse: "", plz: "", ort: "",
    kanton: kantonDefault || "ZH",
  });

  const aendern = (feld) => (e) =>
    setFormular((prev) => ({ ...prev, [feld]: e.target.value }));

  const inputStyle = {
    width: "100%", padding: "8px 10px",
    border: "1.5px solid #e5e7eb", borderRadius: 7,
    fontSize: "0.88rem", background: "#fff", boxSizing: "border-box",
    outline: "none",
  };
  const labelStyle = {
    fontSize: "0.77rem", color: "#6b7280",
    display: "block", marginBottom: 4,
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.52)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1rem",
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, padding: "1.75rem",
        width: "100%", maxWidth: 460,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 700, color: "#111827", marginBottom: 4 }}>
          {titel || "Angaben für Ihren Steuerauszug"}
        </h2>
        <p style={{ fontSize: "0.82rem", color: "#6b7280", marginBottom: "1.25rem" }}>
          Optional – erscheinen auf dem Dokument
        </p>

        {/* Vorname + Nachname */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={labelStyle}>Vorname</label>
            <input value={formular.vorname} onChange={aendern("vorname")} placeholder="Max" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Nachname</label>
            <input value={formular.nachname} onChange={aendern("nachname")} placeholder="Mustermann" style={inputStyle} />
          </div>
        </div>

        {/* Adresse */}
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={labelStyle}>Adresse (Strasse + Nr.)</label>
          <input value={formular.adresse} onChange={aendern("adresse")} placeholder="Musterstrasse 1" style={inputStyle} />
        </div>

        {/* PLZ + Ort */}
        <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <label style={labelStyle}>PLZ</label>
            <input value={formular.plz} onChange={aendern("plz")} placeholder="8001" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Ort</label>
            <input value={formular.ort} onChange={aendern("ort")} placeholder="Zürich" style={inputStyle} />
          </div>
        </div>

        {/* Kanton */}
        <div style={{ marginBottom: "1.25rem" }}>
          <label style={labelStyle}>
            Kanton <span style={{ color: "#dc2626" }}>*</span>
          </label>
          <select
            value={formular.kanton}
            onChange={aendern("kanton")}
            style={{ ...inputStyle }}
          >
            {KANTONE_LISTE.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>

        {/* Datenschutz-Hinweis */}
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7,
          padding: "8px 12px", marginBottom: "0.75rem",
          fontSize: "0.77rem", color: "#166534",
        }}>
          🔒 Ihre Angaben verlassen nicht diesen Browser
        </div>

        {/* Haftungsausschluss vor Bezahlung */}
        <div style={{
          background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 7,
          padding: "10px 12px", marginBottom: "1.25rem",
          fontSize: "0.76rem", color: "#92400e", lineHeight: 1.5,
        }}>
          <strong>Bitte vor der Bezahlung prüfen:</strong> Kontrolliere alle Transaktionen
          und Steuerwerte auf Vollständigkeit und Richtigkeit. btcSteuerauszug.ch übernimmt
          keine Haftung für fehlerhafte oder unvollständige Daten.{" "}
          <strong>Einmal bezahlte Exporte werden nicht rückerstattet.</strong>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onUeberspringen}
            style={{
              background: "none", border: "none",
              color: "#9ca3af", fontSize: "0.83rem", cursor: "pointer", padding: "8px 0",
            }}
          >
            Überspringen
          </button>
          <button
            onClick={() => onBestaetigen(formular)}
            style={{
              padding: "10px 24px", background: "#F7931A", color: "#fff",
              border: "none", borderRadius: 8,
              fontSize: "0.88rem", fontWeight: 700, cursor: "pointer",
            }}
          >
            Steuerauszug erstellen →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Transaktions-Tabelle ─────────────────────────────────────────────────────

function TransaktionsTabelle({ transaktionen, kette, farbe }) {
  if (transaktionen.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "2.5rem",
          color: "#9ca3af",
          fontSize: "0.88rem",
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>📭</div>
        Keine Transaktionen in diesem Jahr
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f9fafb", borderBottom: "1px solid #f0f0f0" }}>
            {["Datum", "Typ", "Betrag", "CHF-Kurs", "CHF-Wert", "Hash"].map(
              (kopf, i) => (
                <th
                  key={kopf}
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#9ca3af",
                    textAlign: i >= 2 && i < 5 ? "right" : "left",
                    whiteSpace: "nowrap",
                  }}
                >
                  {kopf}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {transaktionen.map((tx, index) => {
            const kurs =
              tx.betrag > 0
                ? (tx.chfZeitpunkt || 0) / parseFloat(tx.betrag)
                : 0;
            return (
              <tr
                key={`${tx.wallet || tx.walletAddress || 'w'}-${tx.hash || index}`}
                style={{
                  borderBottom: "1px solid #f9fafb",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <td
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.83rem",
                    color: "#374151",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDatum(tx.datum)}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      ...(tx.typ === "eingang"
                        ? { background: "#dcfce7", color: "#166534" }
                        : { background: "#fee2e2", color: "#991b1b" }),
                    }}
                  >
                    {tx.typ === "eingang" ? "↓ Eingang" : "↑ Ausgang"}
                  </span>
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.83rem",
                    fontFamily: "monospace",
                    textAlign: "right",
                    color: "#374151",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tx.typ === "eingang" ? "+" : "−"}
                  {formatKrypto(tx.betrag)} {tx.waehrung}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.83rem",
                    textAlign: "right",
                    color: "#9ca3af",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatCHF(kurs)}
                </td>
                <td
                  style={{
                    padding: "10px 14px",
                    fontSize: "0.83rem",
                    fontWeight: 600,
                    textAlign: "right",
                    color: tx.typ === "eingang" ? "#16a34a" : "#dc2626",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tx.chfZeitpunkt !== null && tx.chfZeitpunkt !== undefined
                    ? `${tx.typ === "eingang" ? "+" : "−"}${formatCHF(tx.chfZeitpunkt)}`
                    : <span style={{ color: "#9ca3af", fontSize: "0.75rem", fontWeight: 400 }}>Kurs n.v.</span>
                  }
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <a
                    href={explorerUrl(tx.hash, kette)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontFamily: "monospace",
                      fontSize: "0.78rem",
                      color: "#9ca3af",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = farbe)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
                    title={tx.hash}
                  >
                    {kuerzeHash(tx.hash)}
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Coin-Sektion (gruppiert nach Token) ─────────────────────────────────────

function CoinSektion({ coinSymbol, transaktionen, aktuellerKurs, kette, farbe, ausgewaehltesJahr }) {
  const txImJahr = transaktionen.filter(
    (tx) => new Date(tx.datum).getFullYear() === parseInt(ausgewaehltesJahr)
  );
  const allesTxs = transaktionen; // für FIFO über alle Jahre

  const fifo = berechneFifo(allesTxs, aktuellerKurs);

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #f0f0f0",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: "1rem",
      }}
    >
      {/* Coin-Header */}
      <div
        style={{
          padding: "1rem 1.25rem",
          borderBottom: "1px solid #f0f0f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#fafafa",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: farbe,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: "0.75rem",
            }}
          >
            {coinSymbol.substring(0, 4)}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: "#111827", fontSize: "0.95rem" }}>
              {coinSymbol}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              {txImJahr.length} Transaktionen in {ausgewaehltesJahr}
            </div>
          </div>
        </div>

        {/* Kennzahlen */}
        <div style={{ display: "flex", gap: "1.5rem", textAlign: "right" }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", textTransform: "uppercase" }}>
              Bestand
            </div>
            <div style={{ fontWeight: 700, color: "#111827", fontSize: "0.9rem" }}>
              {formatKrypto(fifo.restBestand)} {coinSymbol}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", textTransform: "uppercase" }}>
              Real. G/V
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.9rem",
                color: fifo.realisierterGewinn >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              {fifo.realisierterGewinn >= 0 ? "+" : ""}
              {formatCHF(fifo.realisierterGewinn)}
            </div>
          </div>
          <div className="hidden sm:block">
            <div style={{ fontSize: "0.7rem", color: "#9ca3af", textTransform: "uppercase" }}>
              Unreal. G/V
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: "0.9rem",
                color: fifo.unrealisierterGewinn >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              {fifo.unrealisierterGewinn >= 0 ? "+" : ""}
              {formatCHF(fifo.unrealisierterGewinn)}
            </div>
          </div>
        </div>
      </div>

      {/* Transaktions-Tabelle für dieses Jahr */}
      <TransaktionsTabelle transaktionen={txImJahr} kette={kette} farbe={farbe} />
    </div>
  );
}

// ─── Wallet-Dashboard (für eine einzelne Wallet) ─────────────────────────────

function WalletDashboard({ walletDaten, istAktiv, externeTransaktionen = null, externAktuellerKurs = null, externKurs3112 = null, anzahlWallets = 1 }) {
  const { adresse, kette } = walletDaten;
  const farbe = FARBEN[kette] || "#F7931A";

  // Wenn externeTransaktionen übergeben: direkt verwenden (kein eigener API-Aufruf)
  const [alleTransaktionen, setAlleTransaktionen] = useState(externeTransaktionen || []);
  const [aktuellerKurs, setAktuellerKurs] = useState(externAktuellerKurs);
  const [kurs3112, setKurs3112] = useState(externKurs3112);
  const [laedt, setLaedt] = useState(externeTransaktionen === null);
  const [fehler, setFehler] = useState(null);
  const [ausgewaehltesJahr, setAusgewaehltesJahr] = useState(String(new Date().getFullYear() - 1));
  const [exportLaedt, setExportLaedt] = useState(false);
  const [kanton, setKanton] = useState("ZH");
  const [tokenKurse, setTokenKurse] = useState({});
  const [zeigteCheckoutModal, setZeigteCheckoutModal] = useState(false);
  const [zeigePdfModal, setZeigePdfModal] = useState(false);
  const [scamAnzahl, setScamAnzahl] = useState(0);

  // Externe Daten übernehmen wenn sie geändert haben (Multi-Wallet-Merge)
  useEffect(() => {
    if (externeTransaktionen === null) return;
    setAlleTransaktionen(externeTransaktionen);
    if (externAktuellerKurs !== null) setAktuellerKurs(externAktuellerKurs);
    if (externKurs3112 !== null) setKurs3112(externKurs3112);
    setLaedt(false);
    if (externeTransaktionen.length > 0) {
      const _akt = new Date().getFullYear();
      const _max = Math.max(...externeTransaktionen.map((tx) => new Date(tx.datum).getFullYear()).filter((j) => j < _akt));
      setAusgewaehltesJahr(String(isFinite(_max) ? _max : _akt - 1));
    }
  }, [externeTransaktionen, externAktuellerKurs]);

  // externKurs3112 separat synchronisieren (auch für Single-Wallet ohne externeTransaktionen)
  useEffect(() => {
    if (externKurs3112 !== null && externKurs3112 > 0) setKurs3112(externKurs3112);
  }, [externKurs3112]);

  // Transaktionen laden (nur wenn keine externen Daten)
  const ladeTransaktionen = useCallback(async () => {
    if (externeTransaktionen !== null) return; // Externe Daten → kein API-Aufruf
    setLaedt(true);
    setFehler(null);

    try {
      // ── CSV-Import: Daten aus sessionStorage laden ─────────────────────
      if (kette === "csv") {
        const gespeichert = sessionStorage.getItem("csv_import_data");
        if (!gespeichert) {
          throw new Error("CSV-Importdaten nicht gefunden. Bitte erneut hochladen.");
        }
        const daten = JSON.parse(gespeichert);
        setAlleTransaktionen(daten.transaktionen || []);
        setAktuellerKurs(daten.aktuellerKurs || 0);
        if (daten.kurse) setTokenKurse(daten.kurse);
        if (daten.scamAnzahl > 0) setScamAnzahl(daten.scamAnzahl);
        if (daten.transaktionen?.length > 0) {
          // Bei CSV: ältestes Jahr nehmen (Steuerjahr = erstes Jahr mit Transaktionen)
          const aeltestesJahr = Math.min(
            ...daten.transaktionen.map((tx) => new Date(tx.datum).getFullYear())
          ).toString();
          setAusgewaehltesJahr(aeltestesJahr);
        }
        setLaedt(false);
        return;
      }

      // ── xPub/ypub/zpub: über /api/analyze routen (nicht direkt wallet/bitcoin) ─
      if (kette === "bitcoin" && ["xpub", "ypub", "zpub"].includes(detectInputType(adresse))) {
        const taxYear = new Date().getFullYear() - 1;
        const analyzeAntwort = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallets: [adresse], taxYear, blockchain: "bitcoin" }),
        });
        let analyzeDaten;
        try {
          analyzeDaten = await analyzeAntwort.json();
        } catch {
          throw new Error(`Server-Fehler (HTTP ${analyzeAntwort.status}): Ungültige API-Antwort`);
        }
        if (!analyzeAntwort.ok) {
          throw new Error(analyzeDaten.error || "HD-Wallet Analyse fehlgeschlagen");
        }
        setAlleTransaktionen(analyzeDaten.transaktionen || []);
        setAktuellerKurs(analyzeDaten.aktuellerKurs || 0);
        if (analyzeDaten.kurs3112) setKurs3112(analyzeDaten.kurs3112);
        setTokenKurse({ BTC: analyzeDaten.aktuellerKurs || 0 });
        if (analyzeDaten.transaktionen?.length > 0) {
          const _akt = new Date().getFullYear();
          const _max = Math.max(...analyzeDaten.transaktionen.map((tx) => new Date(tx.datum).getFullYear()).filter((j) => j < _akt));
          const neuestesJahr = String(isFinite(_max) ? _max : _akt - 1);
          setAusgewaehltesJahr(neuestesJahr);
        }
        return; // finally setzt setLaedt(false)
      }

      const endpunkt =
        kette === "bitcoin"
          ? `/api/wallet/bitcoin?address=${encodeURIComponent(adresse)}`
          : kette === "ethereum"
          ? `/api/wallet/ethereum?address=${encodeURIComponent(adresse)}`
          : `/api/wallet/solana?address=${encodeURIComponent(adresse)}`;

      const antwort = await fetch(endpunkt);

      // JSON-Parsing absichern – API könnte bei Fehlern plain text zurückgeben
      let daten;
      try {
        daten = await antwort.json();
      } catch {
        throw new Error(`Server-Fehler (HTTP ${antwort.status}): Ungültige API-Antwort`);
      }

      if (!antwort.ok) {
        // xpub_detected: WalletDashboard ist nicht zuständig – Parent liefert Daten via externeTransaktionen
        if (antwort.status === 422 && daten.error === "xpub_detected") {
          return; // finally setzt laedt=false; kein Fehler zeigen
        }
        throw new Error(daten.error || "Fehler beim Laden");
      }

      // API-Hinweis anzeigen (z.B. fehlender Etherscan Key)
      if (daten.fehler) {
        setFehler(daten.fehler);
        return;
      }

      setAlleTransaktionen(daten.transaktionen || []);
      if (daten.scamAnzahl > 0) setScamAnzahl(daten.scamAnzahl);
      const hauptwährungSymbol = kette === "bitcoin" ? "BTC" : kette === "ethereum" ? "ETH" : "SOL";
      const aktKurs = typeof daten.aktuellerKurs === "object"
        ? daten.aktuellerKurs[hauptwährungSymbol] || null
        : daten.aktuellerKurs;
      setAktuellerKurs(aktKurs);

      // Token-Kurse für CHF-10-Filter (daten.kurse = { ETH:2500, USDC:1.0, ... } oder null)
      if (daten.kurse && typeof daten.kurse === "object") {
        setTokenKurse(daten.kurse);
      } else {
        setTokenKurse({ [hauptwährungSymbol]: aktKurs || 0 });
      }

      // Letztes abgeschlossenes Jahr wählen (nie laufendes Jahr)
      if (daten.transaktionen?.length > 0) {
        const _akt = new Date().getFullYear();
        const _max = Math.max(...daten.transaktionen.map((tx) => new Date(tx.datum).getFullYear()).filter((j) => j < _akt));
        const neuestesJahr = String(isFinite(_max) ? _max : _akt - 1);
        setAusgewaehltesJahr(neuestesJahr);
      }
    } catch (err) {
      setFehler(err.message);
    } finally {
      setLaedt(false);
    }
  }, [adresse, kette, externeTransaktionen]);

  useEffect(() => {
    ladeTransaktionen();
  }, [ladeTransaktionen]);

  // Jahre mit Transaktionen ermitteln
  const vorhandeneJahre = [
    ...new Set(
      alleTransaktionen.map((tx) => new Date(tx.datum).getFullYear().toString())
    ),
  ].sort((a, b) => b - a);

  // Transaktionen nach Jahr filtern
  const txImJahr = alleTransaktionen.filter(
    (tx) => new Date(tx.datum).getFullYear() === parseInt(ausgewaehltesJahr)
  );

  // Coins gruppieren (für ETH/SOL mit Token-Support)
  const coins = {};
  for (const tx of alleTransaktionen) {
    const symbol = tx.waehrung || "?";
    if (!coins[symbol]) coins[symbol] = [];
    coins[symbol].push(tx);
  }

  // Hauptwährung zuerst (ETH vor ERC-20, SOL vor SPL; bei CSV: häufigste Währung)
  const hauptwaehrung = (() => {
    if (kette === "bitcoin") return "BTC";
    if (kette === "ethereum") return "ETH";
    if (kette === "csv" && alleTransaktionen.length > 0) {
      const haeufigkeit = {};
      for (const tx of alleTransaktionen) {
        haeufigkeit[tx.waehrung] = (haeufigkeit[tx.waehrung] || 0) + 1;
      }
      return Object.entries(haeufigkeit).sort((a, b) => b[1] - a[1])[0]?.[0] || "BTC";
    }
    return "SOL";
  })();
  const coinSymbole = [
    ...(coins[hauptwaehrung] ? [hauptwaehrung] : []),
    ...Object.keys(coins)
      .filter((c) => c !== hauptwaehrung)
      .sort(),
  ];

  // Token mit aktuellem Wert < CHF 10 ausblenden (Staubmengen)
  const tokenAktuellerWert = (symbol) => {
    const kurs = tokenKurse[symbol] ?? 0;
    const fifo = berechneFifo(coins[symbol] || [], kurs);
    return fifo.restBestand * kurs;
  };
  const sichtbareCoinSymbole = coinSymbole.filter(
    (sym) => sym === hauptwaehrung || tokenAktuellerWert(sym) >= 10
  );
  const ausgeblendeteTokenAnzahl = coinSymbole.length - sichtbareCoinSymbole.length;

  // FIFO für Hauptwährung (für Zusammenfassung oben)
  const hauptFifo = berechneFifo(
    coins[hauptwaehrung] || [],
    aktuellerKurs || 0
  );

  // Hilfsfunktion: besten verfügbaren Kurs für ein Symbol ermitteln
  // Reihenfolge: tokenKurse → aktuellerKurs (Hauptwährung) → chfHeute/betrag aus Transaktionen
  const holeKursFuerSymbol = (sym, txReferenz) => {
    const ausKurse = tokenKurse[sym];
    if (ausKurse > 0) return ausKurse;
    if (sym === hauptwaehrung && aktuellerKurs > 0) return aktuellerKurs;
    // Letzter Fallback: Preis aus chfHeute einer Referenztransaktion ableiten
    const refTx = (txReferenz || alleTransaktionen).find(
      (t) => t.waehrung === sym && t.betrag > 0 && t.chfHeute > 0
    );
    return refTx ? refTx.chfHeute / refTx.betrag : 0;
  };

  // Portfoliowert per 31.12. des gewählten Jahres (alle Coins summiert)
  const portfolioWertStichtag = (() => {
    const txBisStichtag = alleTransaktionen.filter(
      (tx) => new Date(tx.datum) <= new Date(`${ausgewaehltesJahr}-12-31T23:59:59`)
    );
    const alleCoins = [...new Set(txBisStichtag.map((tx) => tx.waehrung))];
    return alleCoins.reduce((total, sym) => {
      const kurs = holeKursFuerSymbol(sym, txBisStichtag);
      if (!kurs) return total;
      const fifo = berechneFifo(
        txBisStichtag.filter((tx) => tx.waehrung === sym),
        kurs
      );
      return total + fifo.restBestand * kurs;
    }, 0);
  })();

  // Gesamt-FIFO über alle Coins (für G/V-Karten)
  const gesamtFifo = (() => {
    let realisierterGewinn = 0;
    let unrealisierterGewinn = 0;
    let kostenbasis = 0;
    for (const sym of coinSymbole) {
      const kurs = holeKursFuerSymbol(sym, null);
      if (!kurs) continue;
      const f = berechneFifo(coins[sym] || [], kurs);
      realisierterGewinn += f.realisierterGewinn;
      unrealisierterGewinn += f.unrealisierterGewinn;
      kostenbasis += f.kostenbasis;
    }
    return { realisierterGewinn, unrealisierterGewinn, kostenbasis };
  })();

  // CSV-Export
  const handleCsvExport = async () => {
    setExportLaedt(true);
    try {
      const antwort = await fetch("/api/export/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaktionen: txImJahr,
          adresse,
          blockchain: kette,
          jahr: ausgewaehltesJahr,
        }),
      });
      if (!antwort.ok) throw new Error("CSV-Export fehlgeschlagen");
      const blob = await antwort.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `btcsteuerauszug-${kette}-${ausgewaehltesJahr}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Fehler beim CSV-Export: " + err.message);
    } finally {
      setExportLaedt(false);
    }
  };

  // PDF-Export (Gratis) – optionale Kundendaten via Modal
  const handlePdfExport = async (kundenDaten = {}) => {
    setZeigePdfModal(false);
    setExportLaedt(true);
    const aktiverKanton = kundenDaten.kanton || kanton;
    if (kundenDaten.kanton) setKanton(kundenDaten.kanton);
    try {
      const antwort = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaktionen: alleTransaktionen,
          adresse,
          blockchain: kette,
          jahr: ausgewaehltesJahr,
          aktuellerKurs,
          kurs3112,     // ← historischer 31.12.-Kurs (aus analyze, wenn verfügbar)
          tokenKurse,   // ← alle Token-Kurse für korrekte ERC-20 Portfoliowert
          kanton: aktiverKanton,
          kundenDaten,
        }),
      });
      if (!antwort.ok) throw new Error("PDF-Export fehlgeschlagen");
      const blob = await antwort.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err) {
      alert("Fehler beim PDF-Export: " + err.message);
    } finally {
      setExportLaedt(false);
    }
  };

  // Premium PDF-Export (eSteuerauszug mit Barcode) – via Stripe oder direkt (Bypass)
  // kundenDaten: { vorname, nachname, adresse, plz, ort, kanton }
  const handlePremiumExport = async (kundenDaten = {}) => {
    setZeigteCheckoutModal(false);
    setExportLaedt(true);
    // kanton aus kundenDaten übernehmen falls vorhanden
    const aktiverKanton = kundenDaten.kanton || kanton;
    if (kundenDaten.kanton) setKanton(kundenDaten.kanton);

    try {
      // Transaktionsdaten in sessionStorage sichern (für nach der Zahlung oder Direktgenerierung)
      sessionStorage.setItem(
        "steuerauszug_daten",
        JSON.stringify({
          transaktionen: alleTransaktionen,
          adresse,
          blockchain: kette,
          jahr: ausgewaehltesJahr,
          aktuellerKurs,
          tokenKurse,   // ← alle Token-Kurse für korrekte ERC-20 Summe
          kurs3112,     // ← historischer 31.12.-Kurs (für Stripe-Rückgabe)
          kanton: aktiverKanton,
          kundenDaten,
        })
      );

      // Checkout-Route anfragen (prüft STRIPE_ACTIVE serverseitig)
      const antwort = await fetch("/api/payment/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anzahlWallets,
          adresse,
          blockchain: kette,
        }),
      });

      if (!antwort.ok) throw new Error("Checkout konnte nicht erstellt werden");
      const { checkoutUrl, bypass, error } = await antwort.json();
      if (error) throw new Error(error);

      // STRIPE_ACTIVE=false → PDF direkt generieren ohne Zahlung
      if (bypass) {
        const pdfAntwort = await fetch("/api/export/steuerauszug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaktionen: alleTransaktionen,
            adresse,
            blockchain: kette,
            jahr: ausgewaehltesJahr,
            aktuellerKurs,
            tokenKurse,   // ← alle Token-Kurse
            kurs3112,     // ← historischer 31.12.-Kurs (verhindert Re-Fetch mit anderer Quelle)
            kanton: aktiverKanton,
            kundenDaten,
          }),
        });
        if (!pdfAntwort.ok) throw new Error("PDF-Generierung fehlgeschlagen");
        const blob = await pdfAntwort.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        sessionStorage.removeItem("steuerauszug_daten");
        setExportLaedt(false);
        return;
      }

      // Normaler Stripe-Flow: Weiterleitung zu Stripe
      window.location.href = checkoutUrl;
    } catch (err) {
      sessionStorage.removeItem("steuerauszug_daten");
      alert("Fehler beim Checkout: " + err.message);
      setExportLaedt(false);
    }
    // setExportLaedt(false) wird NICHT aufgerufen wenn Seite zu Stripe weiterleitet
  };

  if (laedt) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 1.5rem" }}>
        <div
          style={{
            width: 44,
            height: 44,
            border: `3px solid #f0f0f0`,
            borderTopColor: farbe,
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto 1rem",
          }}
        />
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          Blockchain-Daten und historische CHF-Kurse werden geladen...
        </p>
      </div>
    );
  }

  if (fehler) {
    return (
      <div
        style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 10,
          padding: "1.25rem",
          color: "#dc2626",
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: 6 }}>⚠ Fehler beim Laden</p>
        <p style={{ fontSize: "0.88rem" }}>{fehler}</p>
        <button
          onClick={ladeTransaktionen}
          style={{
            marginTop: 12,
            padding: "6px 14px",
            background: "#dc2626",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: "0.82rem",
            fontWeight: 600,
          }}
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* ─── Jahres-Tabs ─── */}
      <div
        style={{
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          marginBottom: "1.25rem",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.82rem", color: "#9ca3af", fontWeight: 500 }}>
          Steuerjahr:
        </span>
        {(vorhandeneJahre.length > 0
          ? vorhandeneJahre
          : getSteuerjahre().map(String)
        ).map((jahr) => {
          const hatTxs = vorhandeneJahre.includes(jahr);
          return (
            <button
              key={jahr}
              onClick={() => hatTxs && setAusgewaehltesJahr(jahr)}
              title={!hatTxs ? `Keine Transaktionen in ${jahr}` : undefined}
              style={{
                padding: "5px 14px",
                borderRadius: 6,
                border: "1.5px solid transparent",
                cursor: hatTxs ? "pointer" : "default",
                fontSize: "0.85rem",
                fontWeight: 600,
                transition: "all 0.15s",
                opacity: !hatTxs ? 0.4 : 1,
                ...(ausgewaehltesJahr === jahr
                  ? { background: farbe, color: "#fff", borderColor: farbe }
                  : { background: "#f3f4f6", color: "#374151", borderColor: "transparent" }),
              }}
            >
              {jahr}
            </button>
          );
        })}
      </div>

      {/* ─── Laufendes Jahr Hinweis ─── */}
      {(() => {
        const jahresStatus = getJahresStatus(parseInt(ausgewaehltesJahr));
        return jahresStatus.isLaufend && jahresStatus.hinweis ? (
          <div
            style={{
              background: "#fffbeb",
              border: "1.5px solid #f59e0b",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: "1.25rem",
              fontSize: "0.82rem",
              color: "#92400e",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: "1rem" }}>⚠️</span>
            <span>{jahresStatus.hinweis}</span>
          </div>
        ) : null;
      })()}

      {/* ─── Statistik-Karten ─── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        {[
          {
            label: `Portfolio per 31.12.${ausgewaehltesJahr}`,
            wert: formatCHF(portfolioWertStichtag),
            untertext: "aktueller Kurs",
            farbe,
          },
          {
            label: "Transaktionen",
            wert: txImJahr.length,
            untertext: `in ${ausgewaehltesJahr}`,
            farbe: "#374151",
          },
          {
            label: "Realisierter G/V",
            wert: formatCHF(gesamtFifo.realisierterGewinn),
            untertext: "FIFO, alle Assets",
            farbe: gesamtFifo.realisierterGewinn >= 0 ? "#16a34a" : "#dc2626",
          },
          {
            label: "Unrealisierter G/V",
            wert: formatCHF(gesamtFifo.unrealisierterGewinn),
            untertext: "alle Assets",
            farbe: gesamtFifo.unrealisierterGewinn >= 0 ? "#16a34a" : "#dc2626",
          },
        ].map(({ label, wert, untertext, farbe: f }) => (
          <div
            key={label}
            style={{
              background: "#fff",
              border: "1px solid #f0f0f0",
              borderRadius: 10,
              padding: "1rem",
              borderTopWidth: 3,
              borderTopColor: f,
            }}
          >
            <p
              style={{
                fontSize: "0.7rem",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 6,
                lineHeight: 1.3,
              }}
            >
              {label}
            </p>
            <p style={{ fontWeight: 800, fontSize: "1.1rem", color: f }}>
              {wert}
            </p>
            <p style={{ fontSize: "0.72rem", color: "#d1d5db", marginTop: 2 }}>
              {untertext}
            </p>
          </div>
        ))}
      </div>

      {/* ─── Export-Leiste ─── */}
      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "#fafafa",
          borderRadius: 10,
          border: "1px solid #f0f0f0",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.82rem", color: "#6b7280", fontWeight: 500 }}>
            Export für {ausgewaehltesJahr}:
          </span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {/* Gratis-PDF */}
          <button
            onClick={() => setZeigePdfModal(true)}
            disabled={exportLaedt || txImJahr.length === 0}
            style={{
              padding: "8px 14px",
              border: "1.5px solid #e5e7eb",
              borderRadius: 7,
              background: "#fff",
              color: "#374151",
              fontSize: "0.83rem",
              fontWeight: 600,
              cursor: exportLaedt ? "not-allowed" : "pointer",
              opacity: txImJahr.length === 0 ? 0.5 : 1,
            }}
          >
            📄 PDF (kostenlos)
          </button>

          {/* eSteuerauszug Premium */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setZeigteCheckoutModal(true)}
                  disabled={exportLaedt}
                  style={{
                    padding: "8px 14px",
                    border: "none",
                    borderRadius: 7,
                    background: farbe,
                    color: "#fff",
                    fontSize: "0.83rem",
                    fontWeight: 700,
                    cursor: exportLaedt ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  🏦 eSteuerauszug (CHF {(2.10 + (anzahlWallets - 1) * 1.00).toFixed(2)})
                </button>
              </div>
              {/* Beta-Badge: sichtbar solange STRIPE_ACTIVE=false */}
              <span
                style={{
                  background: "#dcfce7",
                  color: "#166534",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: 4,
                  border: "1px solid #bbf7d0",
                  whiteSpace: "nowrap",
                }}
              >
                Beta: Kostenloser Zugang
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Token-Sektionen (gruppiert) ─── */}
      {coinSymbole.length > 1 ? (
        <>
          {ausgeblendeteTokenAnzahl > 0 && (
            <div style={{
              fontSize: "0.78rem", color: "#9ca3af", padding: "0.4rem 0.5rem",
              background: "#f9fafb", borderRadius: 6, border: "1px solid #f0f0f0",
              marginBottom: "0.5rem",
            }}>
              {ausgeblendeteTokenAnzahl} Token unter CHF 10 ausgeblendet
            </div>
          )}
          {scamAnzahl > 0 && (
            <div
              title="Token ohne CoinMarketCap-Listing oder mit verdächtigen Namen wurden ausgeblendet"
              style={{ fontSize: "0.77rem", color: "#9ca3af", padding: "4px 0" }}
            >
              🛡️ {scamAnzahl} Scam/Spam-Token ausgeblendet
            </div>
          )}
          {sichtbareCoinSymbole.map((symbol) => (
            <CoinSektion
              key={symbol}
              coinSymbol={symbol}
              transaktionen={coins[symbol] || []}
              aktuellerKurs={tokenKurse[symbol] ?? aktuellerKurs ?? 0}
              kette={kette}
              farbe={symbol === hauptwaehrung ? farbe : "#6b7280"}
              ausgewaehltesJahr={ausgewaehltesJahr}
            />
          ))}
        </>
      ) : (
        /* Einzelne Coin-Ansicht (Bitcoin) */
        <div
          style={{
            background: "#fff",
            border: "1px solid #f0f0f0",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h3 style={{ fontWeight: 700, color: "#111827", fontSize: "0.95rem" }}>
              Transaktionen {ausgewaehltesJahr}
              <span
                style={{
                  marginLeft: 8,
                  fontSize: "0.78rem",
                  fontWeight: 400,
                  color: "#9ca3af",
                }}
              >
                ({txImJahr.length} Einträge)
              </span>
            </h3>
            {aktuellerKurs && (
              <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                Kurs:{" "}
                <strong style={{ color: farbe }}>
                  {formatCHF(aktuellerKurs)}
                </strong>{" "}
                / {hauptwaehrung}
              </span>
            )}
          </div>
          <TransaktionsTabelle transaktionen={txImJahr} kette={kette} farbe={farbe} />
        </div>
      )}

      <p
        style={{
          fontSize: "0.73rem",
          color: "#d1d5db",
          marginTop: "0.75rem",
          textAlign: "center",
        }}
      >
        CHF-Kurse via CoinMarketCap/CryptoCompare · Historische Kurse können leicht von ESTV-Kursen abweichen · Kein Steuerberater
      </p>

      {/* Checkout-Modal (eSteuerauszug) */}
      {zeigteCheckoutModal && (
        <CheckoutModal
          kantonDefault={kanton}
          onBestaetigen={(kundenDaten) => handlePremiumExport(kundenDaten)}
          onUeberspringen={() => handlePremiumExport({ kanton })}
        />
      )}

      {/* PDF-Modal (Gratis PDF) */}
      {zeigePdfModal && (
        <CheckoutModal
          kantonDefault={kanton}
          titel="PDF-Download"
          onBestaetigen={(kd) => handlePdfExport(kd)}
          onUeberspringen={() => handlePdfExport({ kanton })}
        />
      )}
    </div>
  );
}

// ─── Dashboard Hauptkomponente ─────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter();
  const [wallets, setWallets] = useState(null);
  const [aktiverWalletIndex, setAktiverWalletIndex] = useState(0);
  const [zahlungLaedt, setZahlungLaedt] = useState(false);
  const [zahlungMeldung, setZahlungMeldung] = useState(null);

  // Multi-Wallet: zusammengeführte Transaktionen (für mehrere BTC-Wallets)
  const [gemergteTransaktionen, setGemergteTransaktionen] = useState(null);
  const [gemergterKurs, setGemergterKurs] = useState(null);
  const [gemergterKurs3112, setGemergterKurs3112] = useState(null);
  const [multiWalletLaedt, setMultiWalletLaedt] = useState(false);
  const analyzeGeladen = useRef(false);

  // Wallets aus localStorage laden
  useEffect(() => {
    const gespeicherteWallets = localStorage.getItem("cryptotax_wallets");
    const einzelneWallet = localStorage.getItem("cryptotax_wallet");
    const einzelneKette = localStorage.getItem("cryptotax_chain");

    if (gespeicherteWallets) {
      try {
        const parsed = JSON.parse(gespeicherteWallets);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWallets(parsed);
          return;
        }
      } catch {}
    }

    // Rückwärtskompatibilität
    if (einzelneWallet) {
      setWallets([{ adresse: einzelneWallet, kette: einzelneKette || "bitcoin" }]);
    } else {
      router.push("/");
    }
  }, [router]);

  // ─── Single BTC-Wallet: kurs3112 + xpub-Transaktionen via analyze ───────────
  useEffect(() => {
    if (!wallets || wallets.length !== 1 || wallets[0].kette !== "bitcoin") return;
    if (analyzeGeladen.current) return; // Doppel-Call verhindern (StrictMode / Re-Render)
    analyzeGeladen.current = true;

    const adresse = wallets[0].adresse;

    (async () => {
      try {
        const antwort = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallets: [adresse],
            taxYear: new Date().getFullYear() - 1,
            blockchain: "bitcoin",
          }),
        });
        if (antwort.ok) {
          const daten = await antwort.json();
          if (daten.kurs3112 > 0) setGemergterKurs3112(daten.kurs3112);
          if (daten.transaktionen?.length > 0) {
            setGemergteTransaktionen(daten.transaktionen);
          }
          if (daten.aktuellerKurs > 0) setGemergterKurs(daten.aktuellerKurs);
        }
      } catch {}
    })();

    return () => { analyzeGeladen.current = false; };
  }, [wallets]);

  // ─── Multi-Wallet: alle BTC-Transaktionen parallel laden und zusammenführen ──
  useEffect(() => {
    if (!wallets || wallets.length <= 1) return;
    const alleBtc = wallets.every((w) => w.kette === "bitcoin");
    if (!alleBtc) return;

    // Multi-Wallet: /api/analyze → kombiniertes FIFO über alle Wallets
    const holeAlleTransaktionen = async () => {
      setMultiWalletLaedt(true);
      try {
        const antwort = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallets:    wallets.map((w) => w.adresse),
            taxYear:    new Date().getFullYear() - 1,  // ESTV-Kurs des letzten abgeschlossenen Jahres
            blockchain: "bitcoin",
          }),
        });
        if (!antwort.ok) throw new Error(`Analyse-Fehler HTTP ${antwort.status}`);
        const daten = await antwort.json();
        // Transaktionen neueste zuerst (für Tabellen-Anzeige)
        const sortiert = (daten.transaktionen || []).sort(
          (a, b) => new Date(b.datum) - new Date(a.datum)
        );
        setGemergteTransaktionen(sortiert);
        setGemergterKurs(daten.aktuellerKurs ?? null);
        setGemergterKurs3112(daten.kurs3112 ?? null);
      } catch (e) {
        console.warn("[Dashboard] Multi-Wallet Analyse fehlgeschlagen:", e.message);
        // Fallback: je Wallet einzeln laden (alte Methode)
        const ergebnisse = await Promise.all(
          wallets.map((w) =>
            fetch(`/api/wallet/bitcoin?address=${encodeURIComponent(w.adresse)}`)
              .then((r) => r.json())
              .catch(() => ({ transaktionen: [], aktuellerKurs: null }))
          )
        );
        const alleTxs = ergebnisse.flatMap((d) => d.transaktionen || []);
        const kurs = ergebnisse.find((d) => d.aktuellerKurs > 0)?.aktuellerKurs ?? null;
        setGemergteTransaktionen(alleTxs);
        setGemergterKurs(kurs);
      } finally {
        setMultiWalletLaedt(false);
      }
    };

    holeAlleTransaktionen();
  }, [wallets]);

  // ─── Stripe-Rückgabe prüfen ────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const zahlung = params.get("zahlung");

    if (!sessionId || zahlung !== "erfolg") return;

    const verifiziereUndExportiere = async () => {
      setZahlungLaedt(true);
      setZahlungMeldung("Zahlung wird verifiziert...");

      try {
        // Session bei Stripe verifizieren
        const verifyAntwort = await fetch(
          `/api/payment/verify?session_id=${sessionId}`
        );
        const verifyDaten = await verifyAntwort.json();

        if (!verifyDaten.bezahlt) {
          setZahlungMeldung("Zahlung konnte nicht verifiziert werden.");
          return;
        }

        setZahlungMeldung("PDF wird generiert...");

        // Transaktionsdaten aus sessionStorage laden
        const gespeichert = sessionStorage.getItem("steuerauszug_daten");
        if (!gespeichert) {
          setZahlungMeldung(
            "Transaktionsdaten nicht gefunden. Bitte erneut analysieren und kaufen."
          );
          return;
        }

        const {
          transaktionen, adresse, blockchain, jahr, aktuellerKurs,
          tokenKurse: gespeichertTokenKurse,
          kurs3112: gespeichertKurs3112,
          kanton: gespeichertKanton, kundenDaten: gespeichertKundenDaten,
        } = JSON.parse(gespeichert);

        // eSteuerauszug PDF generieren
        const pdfAntwort = await fetch("/api/export/steuerauszug", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transaktionen,
            adresse,
            blockchain,
            jahr,
            aktuellerKurs,
            tokenKurse: gespeichertTokenKurse || {},
            kurs3112: gespeichertKurs3112 || null,  // ← historischer 31.12.-Kurs
            kanton: gespeichertKanton || "ZH",
            kundenDaten: gespeichertKundenDaten || {},
          }),
        });

        if (!pdfAntwort.ok) throw new Error("PDF-Generierung fehlgeschlagen");

        const blob = await pdfAntwort.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");

        // Aufräumen
        sessionStorage.removeItem("steuerauszug_daten");
        setZahlungMeldung("eSteuerauszug wurde erfolgreich generiert!");

        // URL-Parameter entfernen (ohne Neuladen)
        window.history.replaceState({}, "", "/dashboard");
      } catch (err) {
        setZahlungMeldung("Fehler bei der Verarbeitung: " + err.message);
      } finally {
        setZahlungLaedt(false);
      }
    };

    verifiziereUndExportiere();
  }, []); // Nur einmal beim Laden prüfen

  const neueAnalyse = () => {
    localStorage.removeItem("cryptotax_wallets");
    localStorage.removeItem("cryptotax_wallet");
    localStorage.removeItem("cryptotax_chain");
    router.push("/");
  };

  const aktiveWallet = wallets?.[aktiverWalletIndex];
  const farbe = aktiveWallet ? FARBEN[aktiveWallet.kette] || "#F7931A" : "#F7931A";

  // Multi-Wallet: mehrere BTC-Adressen → zusammengeführte Analyse
  const istMultiWallet =
    wallets?.length > 1 && wallets.every((w) => w.kette === "bitcoin");

  // Alle Wallets laden (zeigt LoadingBar während die erste noch lädt)
  const globalLaedt = !wallets || (istMultiWallet && multiWalletLaedt);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <LoadingBar isLoading={globalLaedt} />
      <Header />

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "2rem 1.5rem" }}>

        {/* ─── Zahlungs-Status-Banner ─── */}
        {(zahlungLaedt || zahlungMeldung) && (
          <div
            style={{
              marginBottom: "1.25rem",
              padding: "0.875rem 1.25rem",
              borderRadius: 10,
              background: zahlungLaedt
                ? "#fffbeb"
                : zahlungMeldung?.includes("erfolgreich")
                ? "#f0fdf4"
                : zahlungMeldung?.includes("Fehler") || zahlungMeldung?.includes("nicht")
                ? "#fef2f2"
                : "#fffbeb",
              border: `1px solid ${
                zahlungLaedt
                  ? "#fde68a"
                  : zahlungMeldung?.includes("erfolgreich")
                  ? "#bbf7d0"
                  : zahlungMeldung?.includes("Fehler") || zahlungMeldung?.includes("nicht")
                  ? "#fecaca"
                  : "#fde68a"
              }`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: "0.88rem",
              color: "#374151",
            }}
          >
            {zahlungLaedt ? (
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid #fde68a",
                  borderTopColor: "#d97706",
                  borderRadius: "50%",
                  animation: "spin 0.7s linear infinite",
                  flexShrink: 0,
                  display: "inline-block",
                }}
              />
            ) : zahlungMeldung?.includes("erfolgreich") ? (
              <span style={{ color: "#16a34a", fontWeight: 700 }}>✓</span>
            ) : (
              <span>ℹ</span>
            )}
            <span>{zahlungMeldung}</span>
            {!zahlungLaedt && (
              <button
                onClick={() => setZahlungMeldung(null)}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#9ca3af",
                  fontSize: "1rem",
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* ─── Seiten-Header ─── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              style={{
                fontWeight: 800,
                fontSize: "1.5rem",
                color: "#111827",
                letterSpacing: "-0.02em",
              }}
            >
              Dashboard
            </h1>
            <p style={{ color: "#9ca3af", fontSize: "0.85rem", marginTop: 2 }}>
              Ihre Krypto-Steuerübersicht
            </p>
          </div>
          <button
            onClick={neueAnalyse}
            style={{
              padding: "8px 16px",
              border: "1.5px solid #e5e7eb",
              borderRadius: 8,
              background: "#fff",
              color: "#374151",
              fontSize: "0.85rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Neue Analyse
          </button>
        </div>

        {/* ─── Multi-Wallet Info-Banner (mehrere BTC-Wallets zusammengeführt) ─── */}
        {istMultiWallet && (
          <div style={{
            background: "#fff8f0", border: "1px solid #fde8c8", borderRadius: 8,
            padding: "0.75rem 1rem", marginBottom: "1.25rem",
            fontSize: "0.83rem", color: "#92400e", display: "flex", gap: 8, alignItems: "center",
          }}>
            <span>₿</span>
            <span>
              <strong>{wallets.length} Bitcoin-Wallets</strong> zusammengeführt –
              FIFO-Berechnung über alle Adressen kombiniert.
            </span>
          </div>
        )}

        {/* ─── Wallet-Tabs (falls mehrere Wallets, nur bei gemischten Chains) ─── */}
        {wallets && wallets.length > 1 && !istMultiWallet && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              marginBottom: "1.25rem",
              flexWrap: "wrap",
            }}
          >
            {wallets.map((wallet, index) => {
              const f = FARBEN[wallet.kette] || "#6b7280";
              const symbol =
                wallet.kette === "bitcoin"
                  ? "₿"
                  : wallet.kette === "ethereum"
                  ? "Ξ"
                  : "◎";
              return (
                <button
                  key={index}
                  onClick={() => setAktiverWalletIndex(index)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1.5px solid",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    transition: "all 0.15s",
                    ...(aktiverWalletIndex === index
                      ? { background: f, color: "#fff", borderColor: f }
                      : { background: "#fff", color: "#374151", borderColor: "#e5e7eb" }),
                  }}
                >
                  <span>{symbol}</span>
                  <span>
                    {wallet.adresse.substring(0, 8)}...
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ─── Aktives Wallet-Dashboard ─── */}
        {istMultiWallet ? (
          multiWalletLaedt || gemergteTransaktionen === null ? (
            // Ladescreen während Multi-Wallet-Fetch
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 16, padding: "4rem 1.5rem",
            }}>
              <div style={{
                width: 48, height: 48,
                border: "4px solid #f3f4f6", borderTopColor: "#F7931A",
                borderRadius: "50%", animation: "spin 0.9s linear infinite",
              }} />
              <p style={{ fontWeight: 700, color: "#374151", fontSize: "1rem", margin: 0 }}>
                {wallets?.length} Bitcoin-Wallets werden analysiert…
              </p>
              <p style={{ color: "#9ca3af", fontSize: "0.83rem", margin: 0 }}>
                Historische CHF-Kurse werden abgerufen
              </p>
              <div style={{ width: "100%", maxWidth: 380, marginTop: 4 }}>
                {wallets?.map((w, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 0", fontSize: "0.8rem", color: "#6b7280",
                    borderBottom: "1px solid #f3f4f6",
                  }}>
                    <span style={{ color: "#F7931A" }}>₿</span>
                    <span style={{ fontFamily: "monospace" }}>
                      {w.adresse?.substring(0, 12)}…{w.adresse?.slice(-6)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Multi-Wallet: zusammengeführte Analyse aller BTC-Adressen
            <WalletDashboard
              walletDaten={{
                adresse: wallets.map((w) => w.adresse).join(", "),
                kette: "bitcoin",
              }}
              externeTransaktionen={gemergteTransaktionen}
              externAktuellerKurs={gemergterKurs}
              externKurs3112={gemergterKurs3112}
              anzahlWallets={wallets.length}
              istAktiv
            />
          )
        ) : aktiveWallet ? (
          <WalletDashboard
            walletDaten={aktiveWallet}
            externeTransaktionen={gemergteTransaktionen}
            externAktuellerKurs={gemergterKurs}
            externKurs3112={gemergterKurs3112}
            istAktiv
          />
        ) : (
          !globalLaedt && (
            <div style={{ textAlign: "center", padding: "4rem" }}>
              <p style={{ color: "#9ca3af" }}>Keine Wallet-Daten gefunden.</p>
            </div>
          )
        )}
      </main>

      <Footer />
    </div>
  );
}
