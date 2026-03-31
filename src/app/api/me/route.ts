import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  getFreeGlobalDailyLimit,
  getGlobalFreeScanRemaining,
  isIpFreeScanUsed,
  isQuotaBypassIp,
} from "@/lib/quota";
import { getClientIp } from "@/lib/request-ip";
import {
  getSubscriptionForCustomer,
  isActiveSubscription,
} from "@/lib/subscription";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("crawlme_customer")?.value;
  const sub = await getSubscriptionForCustomer(customerId);
  const paid = isActiveSubscription(sub);

  const ip = getClientIp(request);
  const bypass = isQuotaBypassIp(ip);
  const globalLimit = getFreeGlobalDailyLimit();

  if (paid) {
    return NextResponse.json({ paid: true });
  }

  if (bypass) {
    const freeGlobalRemaining = await getGlobalFreeScanRemaining(globalLimit);
    return NextResponse.json({
      paid: false,
      quotaBypass: true,
      freeGlobalRemaining,
      freeGlobalLimit: globalLimit,
    });
  }

  const ipAlreadyUsedFree = await isIpFreeScanUsed(ip);
  const freeGlobalRemaining = await getGlobalFreeScanRemaining(globalLimit);

  return NextResponse.json({
    paid: false,
    quotaBypass: false,
    ipAlreadyUsedFree,
    freeGlobalRemaining,
    freeGlobalLimit: globalLimit,
  });
}
