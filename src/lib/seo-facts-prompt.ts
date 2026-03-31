import type { SeoFacts } from "@/lib/seo-extract";

/**
 * Headers that matter for on-page / technical SEO; drops cookies, auth, huge CDN blobs.
 * Full `responseHeaders` can be tens of KB and steal context from the completion budget.
 */
const HEADER_ALLOW = new Set([
  "content-type",
  "cache-control",
  "x-robots-tag",
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "server",
  "via",
  "cf-ray",
  "nel",
  "alt-svc",
  "vary",
]);

const MAX_HEADER_VALUE_LEN = 512;
const MAX_HEADER_KEYS = 36;

function slimResponseHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    const kl = k.toLowerCase();
    if (kl.includes("cookie")) continue;
    if (!HEADER_ALLOW.has(kl) && !kl.startsWith("x-")) continue;
    let s = v;
    if (s.length > MAX_HEADER_VALUE_LEN) s = `${s.slice(0, MAX_HEADER_VALUE_LEN - 3)}...`;
    out[kl] = s;
    if (Object.keys(out).length >= MAX_HEADER_KEYS) break;
  }
  return out;
}

/** Narrow heading samples for token-heavy pages (prompt only; does not affect scoring). */
function slimHeadingSamples(facts: SeoFacts): SeoFacts {
  const h2 = facts.h2Sample.slice(0, 10).map((s) => (s.length > 200 ? `${s.slice(0, 197)}…` : s));
  const h1 = facts.h1.slice(0, 6).map((s) => (s.length > 200 ? `${s.slice(0, 197)}…` : s));
  return { ...facts, h1, h2Sample: h2 };
}

/**
 * Shrink PAGE_FACTS JSON embedded in Venice prompts so more context remains for the
 * large `json_object` report (avoids finish_reason=length with empty/truncated output).
 */
export function slimSeoFactsForVenicePrompt(facts: SeoFacts): SeoFacts {
  const base = slimHeadingSamples(facts);
  return {
    ...base,
    responseHeaders: slimResponseHeaders(base.responseHeaders),
  };
}
