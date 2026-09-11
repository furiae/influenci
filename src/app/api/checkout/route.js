import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { BillingService } from "@/lib/services/billing";

export async function POST(req) {
  try {
    const user = await requireUser();
    if (!user) return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });

    const { planId } = await req.json();
    if (!planId) {
      return NextResponse.json({ error: "Missing planId parameter" }, { status: 400 });
    }

    const checkoutUrl = await BillingService.createCheckoutSession(user.id, planId);
    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Checkout route error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
