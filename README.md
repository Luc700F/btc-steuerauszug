# btcSteuerauszug.ch

**Digitaler Steuerauszug für Bitcoin und Krypto-Assets — speziell für die Schweizer Steuererklärung.**

Angelehnt an den eSteuerauszug der Schweizer Banken gemäss Standard eCH-0270 / eCH-0196 v2.2.0.

## Features

- **Bitcoin (BTC)** — Einzeladresse, Multi-Wallet (bis 10), xpub/ypub/zpub HD-Wallets, CSV-Import (BitBox u.a.)
- **ERC-20 Tokens** — In Entwicklung (v2.0)
- **Solana (SOL)** — In Entwicklung (v2.0)
- Kostenloser PDF-Export (Steuerübersicht, A4 Portrait)
- Kostenpflichtiger eSteuerauszug (eCH-0196 v2.2.0, A4 Querformat + PDF417 Barcodes)
- Keine Datenspeicherung — alle Berechnungen erfolgen on-demand

## Unterstützte Eingabeformate

| Format | Beispiel | Status |
|--------|---------|--------|
| Bitcoin-Adresse | `bc1q...`, `1...`, `3...` | Aktiv |
| Extended Public Key | `zpub...` / `xpub...` / `ypub...` | Aktiv |
| Multi-Wallet | Bis zu 10 Adressen | Aktiv |
| CSV-Import | BitBox, Ledger, Trezor | Aktiv |

## Tech Stack

| Bereich | Technologie |
|---------|------------|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Inline CSS |
| PDF | pdf-lib |
| Barcodes | bwip-js (CODE128C), eigene PDF417-Implementierung |
| Payments | Stripe |
| HD-Wallet | bip32 + bitcoinjs-lib |
| Deployment | Vercel |

## Unterstützte Standards

- **eCH-0196 v2.2.0** — eSteuerauszug XML-Format (direkt in PrivaTax / TaxMe importierbar)
- **eCH-0270** — Barcode-Standard für Steuerauszüge
- **FIFO** — Kostenbasis-Berechnung gemäss Schweizer Steuerrecht
- **ESTV-Kurse** — Verbindliche Jahresendkurse der Eidgenössischen Steuerverwaltung

## Setup (Entwicklung)

```bash
npm install
cp .env.example .env.local
# .env.local mit API-Keys befüllen (siehe Kommentare in .env.example)
npm run dev
```

## Tests

```bash
npm run test:unit        # Unit-Tests (schnell, ~30s, kein Netzwerk)
npm run test:vercel      # Vercel-Kompatibilitätstests
npm run test:pre-deploy  # Alle Tests vor jedem Deploy ausführen
npm run test:realwallet  # Live-API-Tests (benötigt TEST_WALLET_1 in .env.local)
```

## Deployment

Deployment erfolgt automatisch via Vercel bei Push auf `main`.

```bash
# Lokal vor dem Push:
npm run test:pre-deploy
git push
```

## Pricing

| Wallets | Preis |
|---------|-------|
| 1 Wallet | CHF 2.10 |
| 2 Wallets | CHF 3.10 |
| N Wallets | CHF 2.10 + (N-1) × CHF 1.00 |

## Haftungsausschluss

btcSteuerauszug.ch ist kein Steuerberater und ersetzt keine professionelle Steuerberatung.
CHF-Kurse werden über öffentliche APIs berechnet und können von den offiziellen ESTV-Kursen abweichen.
Einmal bezahlte Exporte werden nicht rückerstattet.

## Lizenz

Proprietär. Alle Rechte vorbehalten.
