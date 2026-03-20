"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

export default function Header() {
  const [menuOffen, setMenuOffen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return (
    <header style={{ background: "#ffffff", borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68, minWidth: 0 }}>

        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "1.35rem", letterSpacing: "-0.03em", lineHeight: 1 }}>
            <span style={{ color: "#F7931A" }}>btc</span>
            <span style={{ color: "#1a1a1a" }}>Steuerauszug</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
            Ihr digitaler Steuerauszug für Bitcoin und Krypto
          </div>
        </Link>

        {/* Desktop Nav — nur wenn NICHT mobile */}
        {!isMobile && (
          <nav style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
            <Link href="/"        style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500, textDecoration: "none" }}>Startseite</Link>
            <Link href="/#preise" style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500, textDecoration: "none" }}>Preise</Link>
            <Link href="/#faq"    style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500, textDecoration: "none" }}>FAQ</Link>
            <Link href="/kontakt" style={{ color: "#374151", fontSize: "0.9rem", fontWeight: 500, textDecoration: "none" }}>Kontakt</Link>
          </nav>
        )}

        {/* Hamburger — nur wenn mobile */}
        {isMobile && (
          <button
            onClick={() => setMenuOffen(!menuOffen)}
            aria-label="Menü öffnen"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 8, display: "flex", flexDirection: "column", gap: 5 }}
          >
            <span style={{ display: "block", width: 24, height: 2, background: "#374151", borderRadius: 2, transition: "transform 0.2s", transform: menuOffen ? "rotate(45deg) translate(5px, 5px)" : "none" }} />
            <span style={{ display: "block", width: 24, height: 2, background: "#374151", borderRadius: 2, opacity: menuOffen ? 0 : 1, transition: "opacity 0.2s" }} />
            <span style={{ display: "block", width: 24, height: 2, background: "#374151", borderRadius: 2, transition: "transform 0.2s", transform: menuOffen ? "rotate(-45deg) translate(5px, -5px)" : "none" }} />
          </button>
        )}
      </div>

      {/* Mobile Dropdown */}
      {isMobile && menuOffen && (
        <div style={{ background: "#ffffff", borderTop: "1px solid #f0f0f0", padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Link href="/"        onClick={() => setMenuOffen(false)} style={{ color: "#374151", fontSize: "1rem", fontWeight: 500, textDecoration: "none" }}>Startseite</Link>
          <Link href="/#preise" onClick={() => setMenuOffen(false)} style={{ color: "#374151", fontSize: "1rem", fontWeight: 500, textDecoration: "none" }}>Preise</Link>
          <Link href="/#faq"    onClick={() => setMenuOffen(false)} style={{ color: "#374151", fontSize: "1rem", fontWeight: 500, textDecoration: "none" }}>FAQ</Link>
          <Link href="/kontakt" onClick={() => setMenuOffen(false)} style={{ color: "#374151", fontSize: "1rem", fontWeight: 500, textDecoration: "none" }}>Kontakt</Link>
        </div>
      )}
    </header>
  );
}
