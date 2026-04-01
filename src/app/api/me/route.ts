import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getFreeGlobalDailyLimit,
  getGlobalFreeScanRemaining,
  isDeviceFreeScanUsed,
  isIpFreeScanUsed,
  isQuotaBypassIp,
  isUserFreeScanUsed,
} from "@/lib/quota";
import { getClientIp } from "@/lib/request-ip";
import {
  getSubscriptionForCustomer,
  isActiveSubscription,
} from "@/lib/subscription";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  const cookieStore = await cookies();
  const customerId = cookieStore.get("insights_customer")?.value;
  const sub = await getSubscriptionForCustomer(customerId);
  const paid = isActiveSubscription(sub);

  const ip = getClientIp(request);
  const bypass = isQuotaBypassIp(ip);
  const globalLimit = getFreeGlobalDailyLimit();

  const deviceParam = request.nextUrl.searchParams.get("deviceId")?.trim();
  const validDevice =
    deviceParam && z.string().uuid().safeParse(deviceParam).success ? deviceParam : null;

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

  let userAlreadyUsedFree = false;
  if (userId) {
    userAlreadyUsedFree = await isUserFreeScanUsed(userId);
  }
  let deviceAlreadyUsedFree = false;
  if (validDevice) {
    deviceAlreadyUsedFree = await isDeviceFreeScanUsed(validDevice);
  }
  const ipAlreadyUsedFree = await isIpFreeScanUsed(ip);
  const freeGlobalRemaining = await getGlobalFreeScanRemaining(globalLimit);

  return NextResponse.json({
    paid: false,
    quotaBypass: false,
    ipAlreadyUsedFree,
    userAlreadyUsedFree,
    deviceAlreadyUsedFree,
    freeGlobalRemaining,
    freeGlobalLimit: globalLimit,
  });
}
