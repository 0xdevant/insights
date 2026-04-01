import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe-client";
import { SITE_URL } from "@/lib/site";

const PAYMENT_UNIT_AMOUNT_CENTS = 1800;
const PAYMENT_CURRENCY = "usd";
const PRODUCT_NAME = "Insights Pro";

function stripeConfigError(): string | null {
  if (!getEnv("STRIPE_SECRET_KEY")?.trim()) {
    return "Stripe 未設定：請喺 `.env.local` 加入 `STRIPE_SECRET_KEY`（Stripe Dashboard → API keys，test/live 要一致）。";
  }
  return null;
}

export async function POST(request: NextRequest) {
  const missing = stripeConfigError();
  if (missing) {
    return NextResponse.json(
      { error: missing, code: "stripe_not_configured" as const },
      { status: 503 },
    );
  }

  try {
    const stripe = getStripe();

    const origin =
      request.headers.get("origin") ??
      getEnv("NEXT_PUBLIC_APP_URL") ??
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : SITE_URL);

    const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: PAYMENT_CURRENCY,
          unit_amount: PAYMENT_UNIT_AMOUNT_CENTS,
          product_data: { name: PRODUCT_NAME },
        },
      },
    ];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/api/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?checkout=cancel`,
      allow_promotion_codes: true,
      customer_creation: "always",
    });

    if (!session.url) {
      return NextResponse.json({ error: "無法建立結帳連結" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "無法開始結帳";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
