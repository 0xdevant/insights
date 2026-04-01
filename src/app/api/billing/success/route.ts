import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe-client";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.redirect(new URL("/?billing=missing", request.url));
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
    if (!customerId) {
      return NextResponse.redirect(
        new URL("/?billing=no_customer", request.url),
      );
    }

    const res = NextResponse.redirect(new URL("/?subscribed=1", request.url));
    res.cookies.set("insights_customer", customerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/?billing=error", request.url));
  }
}
