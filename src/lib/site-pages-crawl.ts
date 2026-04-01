import { getEnv } from "@/lib/env";

/** Extra same-origin pages to fetch (primary is always fetched first). */
export function getMaxExtraSitePages(paid: boolean): number {
  const raw = getEnv("INSIGHTS_EXTRA_SITE_PAGES")?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 12) return n;
  }
  return paid ? 5 : 2;
}

export function normalizeUrlForCompare(href: string): string {
  try {
    const u = new URL(href);
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path || "/";
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
  } catch {
    return href;
  }
}

function scoreInternalPath(url: string): number {
  let p: string;
  try {
    p = new URL(url).pathname.toLowerCase();
  } catch {
    return -100;
  }
  let s = 12 - Math.min(p.split("/").filter(Boolean).length * 2, 10);
  if (/about|product|pricing|plan|contact|blog|news|story|collection|shop|store|category|services|faq|support/i.test(p)) {
    s += 10;
  }
  if (/\/(en|hk|zh|tw|cn)(\/|$)/i.test(p)) s += 2;
  if (/\/(cart|checkout|basket|login|signin|signup|register|account|admin|wp-admin|wp-login|search)(\/|$)/i.test(p)) {
    s -= 40;
  }
  if (/\.(pdf|zip|jpg|jpeg|png|gif|webp|svg|mp4|mov)(\?|$)/i.test(p)) s -= 50;
  return s;
}

/**
 * Extract same-host http(s) links from raw HTML (lightweight — no full DOM).
 */
export function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const host = base.hostname.replace(/^www\./i, "").toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /<a\s[^>]*\bhref=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    const lower = raw.toLowerCase();
    if (lower.startsWith("#") || lower.startsWith("javascript:") || lower.startsWith("mailto:") || lower.startsWith("tel:")) {
      continue;
    }
    try {
      const u = new URL(raw, baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const h = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (h !== host) continue;
      u.hash = "";
      const href = u.toString();
      const key = normalizeUrlForCompare(href);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(href);
      if (out.length > 200) break;
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Rank and take up to `limit` URLs (excluding primary).
 */
export function pickExtraPagesToCrawl(candidates: string[], primaryUrl: string, limit: number): string[] {
  if (limit <= 0) return [];
  const primaryKey = normalizeUrlForCompare(primaryUrl);
  const ranked = candidates
    .filter((u) => normalizeUrlForCompare(u) !== primaryKey)
    .map((u) => ({ u, score: scoreInternalPath(u) }))
    .sort((a, b) => b.score - a.score);
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const { u } of ranked) {
    const k = normalizeUrlForCompare(u);
    if (seen.has(k)) continue;
    seen.add(k);
    picked.push(u);
    if (picked.length >= limit) break;
  }
  return picked;
}
