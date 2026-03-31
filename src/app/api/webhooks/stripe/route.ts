import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { setSubscriptionForCustomer } from "@/lib/subscription";
import { getStripe } from "@/lib/stripe-client";

export async function POST(request: NextRequest) {
  const secret = getEnv("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    return NextResponse.json({ error: "Webhooks not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const active = sub.status === "active" || sub.status === "trialing";
        await setSubscriptionForCustomer(customerId, {
          active,
          status: sub.status,
          currentPeriodEnd: sub.items.data[0]?.current_period_end,
          priceId: sub.items.data[0]?.price.id,
        });
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (!customerId) break;

        if (session.mode === "payment" && session.payment_status === "paid") {
          await setSubscriptionForCustomer(customerId, {
            active: true,
            status: "paid",
          });
          break;
        }

        if (session.mode === "subscription") {
          const stripe = getStripe();
          const subs = await stripe.subscriptions.list({ customer: customerId, limit: 3 });
          const first = subs.data[0];
          if (first) {
            await setSubscriptionForCustomer(customerId, {
              active: first.status === "active" || first.status === "trialing",
              status: first.status,
              currentPeriodEnd: first.items.data[0]?.current_period_end,
              priceId: first.items.data[0]?.price.id,
            });
          }
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
