# Vercel Setup Guide – btcSteuerauszug.ch

## Voraussetzungen
- GitHub-Account
- Vercel-Account (kostenlos für Hobby, Pro für Custom Domain)
- Stripe-Account (Live-Keys für Produktion)
- CoinMarketCap API-Key (kostenlos, Basic Plan)
- Alchemy API-Key (kostenlos)
- Etherscan API-Key (kostenlos)

---

## Schritt 1: GitHub Repository erstellen

```bash
# Im Projektordner:
git init
git add -A
git commit -m "feat: Initial commit – btcSteuerauszug v1.0"

# GitHub Repo erstellen (ohne .env.local zu committen!)
gh repo create btcsteuerauszug --private --source=. --push
# ODER: manuell auf github.com erstellen, dann:
git remote add origin https://github.com/DEIN-USER/btcsteuerauszug.git
git push -u origin main
```

**Wichtig:** `.env.local` ist in `.gitignore` und wird NICHT gepusht. ✅

---

## Schritt 2: Vercel Deployment

### Option A: Vercel CLI

```bash
npm i -g vercel
vercel login
vercel --prod
```

### Option B: Vercel Dashboard (empfohlen)

1. Gehe zu [vercel.com](https://vercel.com)
2. "New Project" → GitHub Repository importieren
3. Framework: **Next.js** (auto-detected)
4. Root Directory: `.` (Standard)
5. Build Command: `npm run build` (Standard)
6. Output Directory: `.next` (Standard)

---

## Schritt 3: Environment Variables in Vercel

In Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Wert | Umgebung |
|---|---|---|
| `ALCHEMY_API_KEY` | `dein_alchemy_key` | Production, Preview |
| `ETHERSCAN_API_KEY` | `dein_etherscan_key` | Production, Preview |
| `COINMARKETCAP_API_KEY` | `dein_cmc_key` | Production, Preview |
| `FreeCryptoAPI` | `dein_freecryptoapi_key` | Production, Preview |
| `STRIPE_SECRET_KEY` | `sk_live_xxx` | Production |
| `STRIPE_SECRET_KEY` | `sk_test_xxx` | Preview |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | `pk_live_xxx` | Production |
| `NEXT_PUBLIC_STRIPE_PUBLIC_KEY` | `pk_test_xxx` | Preview |
| `STRIPE_ACTIVE` | `true` | Production |
| `STRIPE_ACTIVE` | `false` | Preview (Bypass für Tests) |

**Hinweis FreeCryptoAPI:** Der kostenlose Tier unterstützt nur aktuelle Preise (kein Historical). Das 4-stufige Fallback-System (CMC → CryptoCompare → CoinGecko → Mempool) deckt historische Kurse vollständig ab.

**WICHTIG:** `STRIPE_ACTIVE=true` nur in Production setzen. In Preview immer `false` lassen.

---

## Schritt 4: Custom Domain (btcsteuerauszug.ch)

1. Vercel Dashboard → Project → Settings → Domains
2. "Add Domain" → `btcsteuerauszug.ch`
3. DNS-Einträge beim Domain-Registrar setzen:
   ```
   A     @       76.76.21.21
   CNAME www     cname.vercel-dns.com
   ```
4. Warten bis SSL-Zertifikat automatisch ausgestellt wird (~5 Minuten)

---

## Schritt 5: Stripe Webhook (für Production)

Wenn `STRIPE_ACTIVE=true`:

1. Stripe Dashboard → Developers → Webhooks → "Add endpoint"
2. URL: `https://btcsteuerauszug.ch/api/payment/verify`
3. Events: `checkout.session.completed`
4. Webhook Secret als `STRIPE_WEBHOOK_SECRET` in Vercel hinzufügen

**Hinweis:** Aktuell verwendet die App Polling statt Webhooks (POST zu `/api/payment/verify` aus dem Dashboard). Webhooks sind optional für robustere Integration.

---

## Schritt 6: Post-Deploy Checks

Nach dem ersten Deployment:

```bash
# Live-API testen
curl "https://btcsteuerauszug.ch/api/wallet/bitcoin?address=12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S"
curl "https://btcsteuerauszug.ch/api/wallet/ethereum?address=0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
curl "https://btcsteuerauszug.ch/api/wallet/solana?address=7v91N7iZ9mNicL8WfG6cgSCKyRXydQjLh6UYBWwm6y1Q"
```

Vercel Logs prüfen: Dashboard → Project → Deployments → Functions

---

## Bekannte Vercel-Limitierungen

| Limit | Hobby | Pro |
|---|---|---|
| Function Timeout | 10s | 300s |
| Function Memory | 1024 MB | 3009 MB |
| Bandwidth | 100 GB/Monat | Unbegrenzt |

**⚠️ Wichtig:** Die Steuerauszug-Generierung (PDF417 Barcode + historische Kursabfragen mit 1s Delay × 15 Daten = ~15s) überschreitet das **Hobby-Timeout von 10 Sekunden**!

**Empfehlung:** Vercel **Pro** Plan ($20/Monat) für 300s Timeout, ODER Anzahl historischer Kursabfragen reduzieren.

---

## Next.js Konfiguration prüfen

Sicherstellen dass `next.config.js` vorhanden ist:

```js
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

---

## Deployment-Checkliste

- [ ] `.env.local` nicht im Repository ✅ (.gitignore)
- [ ] Alle Env-Variablen in Vercel gesetzt
- [ ] `STRIPE_ACTIVE=true` nur in Production
- [ ] Custom Domain konfiguriert
- [ ] SSL-Zertifikat aktiv
- [ ] BTC/ETH/SOL API-Endpunkte auf Live-URL getestet
- [ ] Steuerauszug PDF-Download getestet
- [ ] Stripe Checkout getestet (test → live)
- [ ] Vercel Pro Plan für >10s Function Timeout
