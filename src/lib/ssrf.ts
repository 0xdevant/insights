const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata",
  "169.254.169.254",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function isPrivateOrReservedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true;
  if (n === 0) return true;
  if ((n >>> 24) === 127) return true;
  if ((n >>> 24) === 10) return true;
  if ((n >>> 16) === 0xc0a8) return true;
  const second = (n >>> 16) & 0xff;
  if ((n >>> 24) === 172 && second >= 16 && second <= 31) return true;
  if ((n >>> 16) === 0xa9fe) return true;
  if ((n >>> 24) === 100 && second >= 64 && second <= 127) return true;
  if ((n >>> 24) === 192 && second === 0) return true;
  if ((n >>> 24) === 198 && (second === 18 || second === 19)) return true;
  if ((n >>> 24) === 198 && second === 51) return true;
  if ((n >>> 24) === 203 && second === 0) return true;
  if ((n >>> 24) === 224) return true;
  if ((n >>> 24) >= 240) return true;
  return false;
}

export function isPrivateOrReservedIPv6(ip: string): boolean {
  let s = ip.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80:")) return true;
  if (s.startsWith("fc") || s.startsWith("fd")) return true;
  if (s.startsWith("::ffff:")) {
    const v4 = s.slice("::ffff:".length);
    return isPrivateOrReservedIPv4(v4);
  }
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(h)) return true;
  if (h.endsWith(".local")) return true;
  if (h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal")) return true;
  return false;
}

/** DNS JSON `type` values (RFC 1035 / common public DNS). */
const DNS_TYPE_A = 1;
const DNS_TYPE_AAAA = 28;

async function dnsJsonLookup(name: string, type: "A" | "AAAA"): Promise<string[]> {
  const url = new URL("https://cloudflare-dns.com/dns-query");
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  const res = await fetch(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    Answer?: Array<{ data: string; type?: number }>;
  };
  const wantType = type === "A" ? DNS_TYPE_A : DNS_TYPE_AAAA;
  return (data.Answer ?? [])
    .filter((a) => Number(a.type) === wantType)
    .map((a) => a.data.trim())
    .filter(Boolean);
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  if (isBlockedHostname(hostname)) {
    throw new Error("Host is not allowed");
  }
  const [aRecords, aaaaRecords] = await Promise.all([
    dnsJsonLookup(hostname, "A"),
    dnsJsonLookup(hostname, "AAAA"),
  ]);
  const ips = [...aRecords, ...aaaaRecords];
  if (ips.length === 0) {
    throw new Error("Could not resolve hostname");
  }
  for (const ip of ips) {
    if (ip.includes(":")) {
      if (isPrivateOrReservedIPv6(ip)) throw new Error("Resolved address is not public");
    } else {
      if (isPrivateOrReservedIPv4(ip)) throw new Error("Resolved address is not public");
    }
  }
}

export type SafeUrl = { href: string; hostname: string };

export async function normalizeAndAssertSafeUrl(raw: string): Promise<SafeUrl> {
  let parsed: URL;
  try {
    const trimmed = raw.trim();
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    parsed = new URL(withScheme);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URL must not contain credentials");
  }
  const hostname = parsed.hostname;
  if (!hostname) throw new Error("Invalid hostname");
  await assertPublicHostname(hostname);
  parsed.hash = "";
  return { href: parsed.toString(), hostname };
}
