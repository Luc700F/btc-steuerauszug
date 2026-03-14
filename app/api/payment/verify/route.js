import { NextResponse } from "next/server";
import Stripe from "stripe";

export const maxDuration = 60;
export const dynamic     = "force-dynamic";

// ─── Stripe Session verifizieren ─────────────────────────────────────────────
// Prüft ob eine Checkout Session erfolgreich bezahlt wurde
export async function GET(request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe ist nicht konfiguriert." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json({ error: "session_id fehlt" }, { status: 400 });
  }

  console.log(`[Stripe Verify] Prüfe Session: ${sessionId}`);

  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    console.log(`[Stripe Verify] payment_status: ${session.payment_status}`);

    if (session.payment_status !== "paid") {
      return NextResponse.json({
        bezahlt: false,
        status: session.payment_status,
      });
    }

    console.log("[Stripe Verify] Zahlung bestätigt ✓");
    return NextResponse.json({
      bezahlt: true,
      metadata: session.metadata,
    });
  } catch (fehler) {
    console.error("[Stripe Verify] Fehler:", fehler.message);
    return NextResponse.json(
      { error: "Fehler bei der Zahlungsverifizierung" },
      { status: 500 }
    );
  }
}
