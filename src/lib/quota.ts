import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getEnv } from "@/lib/env";

const memory = new Map<string, number>();
const memoryIpOnce = new Map<string, true>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getKv(): Promise<KVNamespace | null> {
  try {
    const { env } = getCloudflareContext();
    const kv = (env as { CRAWLME_KV?: KVNamespace }).CRAWLME_KV;
    return kv ?? null;
  } catch {
    return null;
  }
}

/** Comma-separated IPs that skip free-tier quota (e.g. your home IP). */
export function getQuotaBypassIps(): string[] {
  const raw = getEnv("CRAWLME_QUOTA_BYPASS_IPS");
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Skip free-tier IP-once + global daily quota when:
 * - IP is listed in CRAWLME_QUOTA_BYPASS_IPS (comma-separated, e.g. your public IP for staging/prod), or
 * - NODE_ENV=development and CRAWLME_QUOTA_BYPASS_DEV=true (unlimited local testing only; never use in production builds).
 */
export function isQuotaBypassIp(ip: string): boolean {
  if (
    process.env.NODE_ENV === "development" &&
    getEnv("CRAWLME_QUOTA_BYPASS_DEV") === "true"
  ) {
    return true;
  }
  if (ip === "unknown") return false;
  return getQuotaBypassIps().includes(ip);
}

/** Total free scans allowed platform-wide per UTC day (inference budget). */
export function getFreeGlobalDailyLimit(): number {
  const raw = getEnv("FREE_GLOBAL_DAILY_SCANS");
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n > 0) return n;
  return 100;
}

const globalKey = (day: string) => `quota:free:global:${day}`;
const ipOnceKey = (ip: string) => `quota:free:ip-once:${ip}`;

/** Whether this IP has already used its one lifetime free scan. */
export async function isIpFreeScanUsed(ip: string): Promise<boolean> {
  if (ip === "unknown") return false;
  const key = ipOnceKey(ip);
  const kv = await getKv();
  if (kv) {
    const v = await kv.get(key);
    return v === "1";
  }
  return memoryIpOnce.has(key);
}

/** After a successful experience-tier scan, block this IP until expiry — unless the user has an active paid subscription (Stripe). */
export async function markIpFreeScanUsed(ip: string): Promise<void> {
  if (ip === "unknown") return;
  const key = ipOnceKey(ip);
  const kv = await getKv();
  if (kv) {
    await kv.put(key, "1", { expirationTtl: 60 * 60 * 24 * 365 * 10 });
    return;
  }
  memoryIpOnce.set(key, true);
}

export async function getGlobalFreeScanRemaining(dailyGlobalLimit: number): Promise<number> {
  const day = utcDay();
  const key = globalKey(day);
  const kv = await getKv();

  if (kv) {
    const raw = await kv.get(key);
    const used = raw ? Number.parseInt(raw, 10) : 0;
    const safeUsed = Number.isFinite(used) ? used : 0;
    return Math.max(0, dailyGlobalLimit - safeUsed);
  }

  const used = memory.get(key) ?? 0;
  return Math.max(0, dailyGlobalLimit - used);
}

export async function checkAndConsumeGlobalFreeScanQuota(params: {
  dailyGlobalLimit: number;
}): Promise<{ allowed: true; remaining: number } | { allowed: false; remaining: number }> {
  const day = utcDay();
  const key = globalKey(day);
  const kv = await getKv();

  if (kv) {
    const raw = await kv.get(key);
    const used = raw ? Number.parseInt(raw, 10) : 0;
    const safeUsed = Number.isFinite(used) ? used : 0;
    if (safeUsed >= params.dailyGlobalLimit) {
      return { allowed: false, remaining: 0 };
    }
    await kv.put(key, String(safeUsed + 1), { expirationTtl: 60 * 60 * 48 });
    return {
      allowed: true,
      remaining: Math.max(0, params.dailyGlobalLimit - safeUsed - 1),
    };
  }

  const prev = memory.get(key) ?? 0;
  if (prev >= params.dailyGlobalLimit) {
    return { allowed: false, remaining: 0 };
  }
  memory.set(key, prev + 1);
  return {
    allowed: true,
    remaining: Math.max(0, params.dailyGlobalLimit - prev - 1),
  };
}

/** If scan failed after a global slot was consumed, put one back (best-effort). */
export async function refundGlobalFreeScanQuota(): Promise<void> {
  const day = utcDay();
  const key = globalKey(day);
  const kv = await getKv();

  if (kv) {
    const raw = await kv.get(key);
    const used = raw ? Number.parseInt(raw, 10) : 0;
    const safeUsed = Number.isFinite(used) ? used : 0;
    if (safeUsed <= 0) return;
    await kv.put(key, String(safeUsed - 1), { expirationTtl: 60 * 60 * 48 });
    return;
  }

  const prev = memory.get(key) ?? 0;
  if (prev <= 0) return;
  memory.set(key, prev - 1);
}
