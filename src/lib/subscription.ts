import { getCloudflareContext } from "@opennextjs/cloudflare";

export type SubscriptionRecord = {
  active: boolean;
  status: string;
  currentPeriodEnd?: number;
  priceId?: string;
};

async function getKv(): Promise<KVNamespace | null> {
  try {
    const { env } = getCloudflareContext();
    const kv = (env as { INSIGHTS_KV?: KVNamespace }).INSIGHTS_KV;
    return kv ?? null;
  } catch {
    return null;
  }
}

const memorySubs = new Map<string, SubscriptionRecord>();

export async function getSubscriptionForCustomer(
  customerId: string | undefined,
): Promise<SubscriptionRecord | null> {
  if (!customerId) return null;
  const kv = await getKv();
  const key = `sub:${customerId}`;
  if (kv) {
    const raw = await kv.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SubscriptionRecord;
    } catch {
      return null;
    }
  }
  return memorySubs.get(customerId) ?? null;
}

export async function setSubscriptionForCustomer(
  customerId: string,
  record: SubscriptionRecord,
): Promise<void> {
  const kv = await getKv();
  const key = `sub:${customerId}`;
  const payload = JSON.stringify(record);
  if (kv) {
    await kv.put(key, payload);
  } else {
    memorySubs.set(customerId, record);
  }
}

export function isActiveSubscription(
  record: SubscriptionRecord | null | undefined,
): boolean {
  if (!record) return false;
  if (!record.active) return false;
  /** One-time Stripe payments omit `currentPeriodEnd` → treat as lifetime access. */
  if (record.currentPeriodEnd && record.currentPeriodEnd * 1000 < Date.now()) {
    return false;
  }
  return true;
}
