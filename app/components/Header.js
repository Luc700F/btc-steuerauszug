"use client";

import Link from "next/link";
import { useState } from "react";

// Header mit neuem Multi-Color-Logo: b=BTC-Orange, t=ETH-Blau, c=SOL-Violett, Steuerauszug=Schwarz
export default function Header() {
  const [menuOffen, setMenuOffen] = useState(false);

  return (
    <header
      style={{
        background: "#ffffff",
        borderBottom: "1px solid #f0f0f0",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 68,
          position: "relative",
        }}
      >
        {/* Logo: Drei Krypto-Farben + Schwarz */}
        <Link href="/" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: "1.45rem",
              letterSpacing: "-0.03em",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "#F7931A" }}>b</span>
            <span style={{ color: "#627EEA" }}>t</span>
            <span style={{ color: "#9945FF" }}>c</span>
            <span style={{ color: "#000000" }}>Steuerauszug</span>
          </div>
          <div style={{ fontSize: "0.65rem", color: "#9ca3af", letterSpacing: 0 }}>
            Ihr digitaler Steuerauszug für Bitcoin und Krypto
          </div>
        </Link>

        {/* Desktop-Navigation */}
        <nav
          style={{ display: "flex", alignItems: "center", gap: "2rem" }}
          className="hidden md:flex"
        >
          <Link
            href="/"
            style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500 }}
          >
            Startseite
          </Link>
          <Link
            href="/#preise"
            style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500 }}
          >
            Preise
          </Link>
          <Link
            href="/#faq"
            style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500 }}
          >
            FAQ
          </Link>
          <Link
            href="/kontakt"
            style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500 }}
          >
            Kontakt
          </Link>
        </nav>

        {/* Mobile Hamburger-Button */}
        <button
          onClick={() => setMenuOffen(!menuOffen)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 5,
          }}
          className="block md:hidden"
          aria-label="Menü"
        >
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "#374151",
              borderRadius: 2,
              transition: "transform 0.2s",
              transform: menuOffen ? "rotate(45deg) translate(5px, 5px)" : "none",
            }}
          />
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "#374151",
              borderRadius: 2,
              opacity: menuOffen ? 0 : 1,
              transition: "opacity 0.2s",
            }}
          />
          <span
            style={{
              display: "block",
              width: 22,
              height: 2,
              background: "#374151",
              borderRadius: 2,
              transition: "transform 0.2s",
              transform: menuOffen ? "rotate(-45deg) translate(5px, -5px)" : "none",
            }}
          />
        </button>
      </div>

      {/* Mobile-Menü – Dropdown direkt unter ☰ Button, rechts ausgerichtet */}
      {menuOffen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: "1.5rem",
            left: "auto",
            width: 200,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: 1000,
            padding: "8px 0",
          }}
        >
          <nav style={{ display: "flex", flexDirection: "column" }}>
            <Link
              href="/"
              onClick={() => setMenuOffen(false)}
              style={{ color: "#374151", fontSize: "0.92rem", fontWeight: 500, padding: "10px 16px", display: "block" }}
            >
              Startseite
            </Link>
            <Link
              href="/#preise"
              onClick={() => setMenuOffen(false)}
              style={{ color: "#374151", fontSize: "0.92rem", fontWeight: 500, padding: "10px 16px", display: "block" }}
            >
              Preise
            </Link>
            <Link
              href="/#faq"
              onClick={() => setMenuOffen(false)}
              style={{ color: "#374151", fontSize: "0.92rem", fontWeight: 500, padding: "10px 16px", display: "block" }}
            >
              FAQ
            </Link>
            <Link
              href="/kontakt"
              onClick={() => setMenuOffen(false)}
              style={{ color: "#374151", fontSize: "0.92rem", fontWeight: 500, padding: "10px 16px", display: "block" }}
            >
              Kontakt
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
