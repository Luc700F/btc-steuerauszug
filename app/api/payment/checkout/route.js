import { NextResponse } from "next/server";
import Stripe from "stripe";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── Stripe Checkout Session erstellen ──────────────────────────────────────
// Preis: CHF 2.10 für erste Wallet (210 Rappen) + CHF 1.00 je weitere (100 Rappen)
export async function POST(request) {
  // STRIPE_ACTIVE=false → Stripe komplett überspringen, PDF direkt generieren
  if (process.env.STRIPE_ACTIVE === "false") {
    console.log("[Stripe] STRIPE_ACTIVE=false → Bypass aktiv, kein Checkout");
    return NextResponse.json({ bypass: true });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;

  console.log("[Stripe] Checkout-Anfrage eingegangen");
  console.log(`[Stripe] STRIPE_SECRET_KEY: ${stripeKey ? "gesetzt ✓" : "FEHLT ✗"}`);

  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe ist nicht konfiguriert. Bitte STRIPE_SECRET_KEY in .env.local setzen." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body" }, { status: 400 });
  }

  const { anzahlWallets, adresse, blockchain } = body;
  console.log(`[Stripe] anzahlWallets=${anzahlWallets}, blockchain=${blockchain}, adresse=${adresse?.substring(0, 16)}...`);

  const anzahl = Math.max(1, parseInt(anzahlWallets) || 1);
  const betragRappen = 210 + (anzahl - 1) * 100; // CHF 2.10 + CHF 1.00/Wallet
  console.log(`[Stripe] Betrag: ${betragRappen} Rappen (CHF ${(betragRappen / 100).toFixed(2)})`);

  // Origin aus Request-Headers ermitteln
  // request.headers.get("origin") ist die zuverlässigste Quelle
  let origin = request.headers.get("origin");
  if (!origin) {
    const referer = request.headers.get("referer");
    if (referer) {
      try {
        origin = new URL(referer).origin; // Nur Schema + Host + Port
      } catch {
        origin = null;
      }
    }
  }
  origin = origin || "https://btcsteuerauszug.ch";
  console.log(`[Stripe] Origin: ${origin}`);

  try {
    const stripe = new Stripe(stripeKey);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "chf",
            product_data: {
              name: `eSteuerauszug – ${anzahl} Wallet${anzahl > 1 ? "s" : ""}`,
              description: `Kryptowährungen Steuerauszug · ${blockchain} · ${
                adresse?.substring(0, 16) ?? "–"
              }...`,
            },
            unit_amount: betragRappen,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}&zahlung=erfolg`,
      cancel_url:  `${origin}/dashboard?zahlung=abgebrochen`,
      metadata: {
        adresse:       adresse?.substring(0, 200) ?? "",
        blockchain:    blockchain ?? "",
        anzahlWallets: anzahl.toString(),
      },
    });

    console.log(`[Stripe] Session erstellt: ${session.id}`);
    console.log(`[Stripe] Checkout-URL: ${session.url?.substring(0, 60)}...`);

    return NextResponse.json({ checkoutUrl: session.url });
  } catch (fehler) {
    console.error("[Stripe] Fehler beim Erstellen der Session:", fehler.message);
    console.error("[Stripe] Fehler-Code:", fehler.code);
    console.error("[Stripe] Fehler-Typ:", fehler.type);
    return NextResponse.json(
      { error: `Stripe-Fehler: ${fehler.message}` },
      { status: 500 }
    );
  }
}
