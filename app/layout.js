import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Viewport: Zoom verhindern, korrektes Mobile-Rendering
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Metadaten für Suchmaschinen – Deutsch / Schweiz
export const metadata = {
  title: "btcSteuerauszug – Digitaler Steuerauszug für Bitcoin und Krypto",
  description:
    "Ihr digitaler Steuerauszug für Bitcoin, Ethereum und Solana – angelehnt an den eSteuerauszug der Schweizer Banken. Automatisch, korrekt, druckfertig.",
  keywords:
    "Bitcoin Steuerauszug Schweiz, BTC Steuererklärung, Krypto CHF, eSteuerauszug, ERC-20 Steuern",
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
