import type { SeoFacts } from "@/lib/seo-extract";
import { getEnv } from "@/lib/env";
import { veniceChatJson } from "@/lib/venice";

const BRAVE_SEARCH_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TAVILY_SEARCH_ENDPOINT = "https://api.tavily.com/search";

export type CompetitorDiscoveryResult = {
  urls: string[];
  /** Human-readable: search query, model notes, or placeholder. */
  query: string;
  source: "brave" | "tavily" | "model" | "none";
  error?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Brave path: step 1 = search candidates, step 2 = model picks official competitor sites. */
  two_step?: boolean;
  /** Count of URLs passed to step 2 (after basic noise filtering). */
  search_candidates?: number;
  /** Short note from the filter model (optional). */
  filter_notes?: string;
};

/**
 * How to pick competitor URLs when the user did not provide any.
 * If `CRAWLME_COMPETITOR_DISCOVERY` is unset: **Tavily** if `TAVILY_API_KEY`, else Brave if `BRAVE_SEARCH_API_KEY`, else Venice model.
 */
export function resolveCompetitorDiscoveryStrategy(): "model" | "brave" | "tavily" | "none" {
  const raw = getEnv("CRAWLME_COMPETITOR_DISCOVERY")?.trim().toLowerCase();
  if (raw === "tavily") return "tavily";
  if (raw === "brave" || raw === "search") return "brave";
  if (raw === "model" || raw === "venice") return "model";
  if (raw === "none" || raw === "off") return "none";
  if (getEnv("TAVILY_API_KEY")?.trim()) return "tavily";
  if (getEnv("BRAVE_SEARCH_API_KEY")?.trim()) return "brave";
  return "model";
}

function hostKey(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractBrandLabelForFacts(facts: SeoFacts): string {
  const hk = hostKey(facts.url);
  const rawTitle = facts.title?.trim() ?? "";
  const firstSegment = rawTitle.split(/[|\-–—:：]/)[0]?.trim() ?? "";
  return firstSegment.length >= 2 && firstSegment.length <= 100
    ? firstSegment
    : hk.replace(/\.(com|hk|net|io|ai|co|org)$/, "");
}

/**
 * Leftmost registrable-style label (e.g. greenpan.com.hk → greenpan, shop.greenpan.com → greenpan).
 * Used to drop same-brand regional / multi-TLD URLs that are NOT separate competitors.
 */
function brandLabelFromHostname(hostname: string): string {
  const h = hostname.replace(/^www\./i, "").toLowerCase();
  const parts = h.split(".").filter(Boolean);
  if (parts.length === 0) return h;
  const skip = new Set([
    "www",
    "m",
    "mobile",
    "shop",
    "store",
    "blog",
    "support",
    "help",
    "en",
    "hk",
    "us",
    "uk",
    "de",
    "fr",
    "tw",
    "cn",
    "au",
    "jp",
    "kr",
    "sg",
  ]);
  let i = 0;
  while (i < parts.length - 2 && skip.has(parts[i] ?? "")) {
    i++;
  }
  return parts[i] ?? parts[0] ?? h;
}

/** Same company / brand (different TLD or regional site), not a distinct competitor. */
function isSameBrandHost(primaryHostname: string, candidateHostname: string): boolean {
  if (!primaryHostname || !candidateHostname) return false;
  if (primaryHostname === candidateHostname) return true;
  const pb = brandLabelFromHostname(primaryHostname);
  const cb = brandLabelFromHostname(candidateHostname);
  if (pb.length >= 3 && cb.length >= 3 && pb === cb) return true;
  return false;
}

/**
 * Listicles, roundups, and "X alternatives" articles — not direct product competitors.
 * Prefer homepages / pricing on similar SaaS (e.g. *.io, *.dev) over editorial URLs.
 */
function shouldSkipNonProductCompetitorUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return true;
  }
  const pathRedFlags = [
    "alternative",
    "alternatives",
    "openclaw-alternative",
    "open-alternative",
    "/vs/",
    "-vs-",
    "versus", // e.g. epicurious.com/shopping/caraway-versus-greenpan-…
    "vs-blog",
    "best-",
    "top-10",
    "top_10",
    "roundup",
    "comparison",
    "compare-",
    "listicle",
    "similar-to-", // often editorial
    // B2B "companies like X" / directory pages (e.g. rocketreach.co/...-competitors_...)
    "-competitors",
    "competitors_",
    "/competitors/",
    "/competitor/",
    // Magazine / affiliate “shopping” guides (not brand stores)
    "/shopping/",
    "/gift-guide",
    "buying-guide",
    "product-review",
    "/review/",
    "/reviews/",
    "/story/",
    "/stories/",
    "/magazine/",
    "/feature/",
    "/features/",
    "/guide/",
    "/guides/",
    "/editorial/",
    "/wirecutter",
  ];
  if (pathRedFlags.some((s) => pathname.includes(s))) return true;
  // Year-based article slugs (e.g. /2023/06/…)
  if (/\/20\d{2}\//.test(pathname)) return true;
  // Long-form editorial paths (not product landing pages)
  if (
    pathname.includes("/blog/") ||
    pathname.includes("/content/") ||
    pathname.includes("/articles/") ||
    pathname.includes("/news/") ||
    pathname.includes("/posts/") ||
    pathname.includes("/learn/") ||
    pathname.includes("/resources/")
  ) {
    return true;
  }
  return false;
}

/** News / magazine / review sites — not a competitor’s own store. */
function isEditorialReviewHostname(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  const blocked = [
    "epicurious.com",
    "bonappetit.com",
    "eater.com",
    "seriouseats.com",
    "thekitchn.com",
    "food52.com",
    "foodnetwork.com",
    "allrecipes.com",
    "tasty.co",
    "delish.com",
    "insider.com",
    "businessinsider.com",
    "buzzfeed.com",
    "goodhousekeeping.com",
    "people.com",
    "forbes.com",
    "cnet.com",
    "pcmag.com",
    "wired.com",
    "thewirecutter.com",
    "nymag.com",
    "vox.com",
    "theverge.com",
    "engadget.com",
    "tomsguide.com",
    "rtings.com",
    "consumerreports.org",
    "substack.com",
    "ghost.io",
    "blogspot.com",
    "tumblr.com",
    "wordpress.com",
    "squarespace.com",
    "wix.com",
    "weebly.com",
  ];
  if (blocked.some((b) => h === b || h.endsWith(`.${b}`))) return true;
  if (h.endsWith(".substack.com") || h.endsWith(".medium.com") || h.endsWith(".wordpress.com"))
    return true;
  // Wirecutter / product labs on large publishers
  if (h === "nytimes.com" || h.endsWith(".nytimes.com")) return true;
  if (h === "washingtonpost.com" || h.endsWith(".washingtonpost.com")) return true;
  if (h === "theguardian.com" || h.endsWith(".theguardian.com")) return true;
  return false;
}

/** True if this URL should never be used as a “competitor site” snapshot. */
function isBadCompetitorPageUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return true;
  }
  if (isEditorialReviewHostname(host)) return true;
  return shouldSkipNonProductCompetitorUrl(url) || isLikelyNoiseUrl(url);
}

/** Higher = better candidate (homepage / shallow product paths). */
function competitorUrlPreferenceScore(url: string): number {
  try {
    const u = new URL(url);
    const path = u.pathname;
    const depth = path.split("/").filter(Boolean).length;
    let score = 10 - depth * 2;
    if (path === "/" || path === "") score += 6;
    if (/\/(pricing|plans|product|home|app)\/?$/i.test(path)) score += 3;
    const host = u.hostname.toLowerCase();
    if (/\.(io|dev|app|host|so|ai)$/i.test(host)) score += 1;
    return score;
  } catch {
    return 0;
  }
}

function isLikelyNoiseUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  const blocked = [
    "gstatic.com",
    "bing.com",
    "facebook.com",
    "fb.com",
    "youtube.com",
    "youtu.be",
    "twitter.com",
    "x.com",
    "linkedin.com",
    "instagram.com",
    "reddit.com",
    "pinterest.com",
    "wikipedia.org",
    "wikimedia.org",
    "quora.com",
    "tiktok.com",
    "yahoo.com",
    "amazon.com",
    "microsoft.com",
    "apple.com",
    "g2.com",
    "capterra.com",
    "trustpilot.com",
    "rocketreach.co",
    "rocketreach.com",
    "zoominfo.com",
    "crunchbase.com",
    "owler.com",
    "similarweb.com",
    "datanyze.com",
    "lead411.com",
    "growjo.com",
    "pitchbook.com",
    "craft.co",
    "medium.com",
    "bbc.com",
    "cnn.com",
  ];
  if (host.includes("google.com") || host.includes("google.")) return true;
  if (blocked.some((b) => host === b || host.endsWith(`.${b}`))) {
    return true;
  }
  return false;
}

/** Build an English-heavy web search query (Brave). */
export function buildCompetitorSearchQuery(facts: SeoFacts): string {
  const hk = hostKey(facts.url);
  const rawTitle = facts.title?.trim() ?? "";
  const firstSegment = rawTitle.split(/[|\-–—:：]/)[0]?.trim() ?? "";
  const brand =
    firstSegment.length >= 2 && firstSegment.length <= 100 ? firstSegment : hk.replace(/\.(com|hk|net|io|ai|co|org)$/, "");

  // Avoid "alternatives" as primary intent — SERPs skew to listicles (e.g. composio …/openclaw-alternatives).
  // Exclude B2B directory pages that only *describe* competitors instead of linking to real brand sites.
  // Bias toward product/competitor sites; path + host filtering below drops editorials and aggregators.
  const brandSlug = brandLabelFromHostname(hk);
  const extraNegSite =
    brandSlug.length >= 3 && brandSlug !== hk
      ? ` -site:${brandSlug}.com -site:${brandSlug}.co.uk`
      : "";

  const editorialNeg =
    " -site:epicurious.com -site:bonappetit.com -site:eater.com -site:thewirecutter.com -site:nytimes.com " +
    "-site:foodnetwork.com -site:allrecipes.com -site:seriouseats.com -site:food52.com";

  return (
    `${brand} ${hk} competitors OR "similar brands" OR "similar product" OR pricing ` +
    `-inurl:alternatives -inurl:blog -inurl:versus -inurl:/shopping/ ` +
    `-site:${hk} -site:rocketreach.co -site:rocketreach.com -site:zoominfo.com -site:crunchbase.com -site:owler.com ` +
    `-site:growjo.com -site:pitchbook.com -site:craft.co` +
    editorialNeg +
    extraNegSite
  );
}

/**
 * Shorter natural-language query for Tavily — it is **not** a Google SERP API; long
 * `-site:` / `-inurl:` strings often return poor or empty results. Post-filtering
 * still removes noise and same-brand hosts.
 */
export function buildCompetitorSearchQueryTavily(facts: SeoFacts): string {
  const hk = hostKey(facts.url);
  const rawTitle = facts.title?.trim() ?? "";
  const firstSegment = rawTitle.split(/[|\-–—:：]/)[0]?.trim() ?? "";
  const brand =
    firstSegment.length >= 2 && firstSegment.length <= 100 ? firstSegment : hk.replace(/\.(com|hk|net|io|ai|co|org)$/, "");
  return `${brand} direct competitors similar brands official website same product category`;
}

/** Second Tavily query — bias toward brand roots, not reviews. */
export function buildCompetitorSearchQueryTavilyOfficial(facts: SeoFacts): string {
  const brand = extractBrandLabelForFacts(facts);
  return `${brand} competing brands official website homepage online store`;
}

/** Third Tavily query — category peers as official sites. */
export function buildCompetitorSearchQueryTavilyPeers(facts: SeoFacts): string {
  const brand = extractBrandLabelForFacts(facts);
  return `leading brands same industry as ${brand} official website homepage`;
}

/**
 * Tavily queries biased toward **market category** (from {@link inferCompetitorMarketCategoryEn}),
 * not the brand name — improves recall for peer DTC / retail sites.
 */
export function buildCompetitorSearchQueryTavilyCategoryA(categoryEn: string): string {
  const c = categoryEn.trim();
  return `${c} brands official website homepage online store`;
}

export function buildCompetitorSearchQueryTavilyCategoryB(categoryEn: string): string {
  const c = categoryEn.trim();
  return `top competing brands ${c} shop site`;
}

function compactFactsForCategoryInference(facts: SeoFacts): Record<string, unknown> {
  return {
    url: facts.url,
    finalUrl: facts.finalUrl,
    title: facts.title,
    metaDescription: facts.metaDescription,
    ogSiteName: facts.ogSiteName,
    ogTitle: facts.ogTitle,
    ogDescription: facts.ogDescription,
    h1: facts.h1.slice(0, 6),
    h2Sample: facts.h2Sample.slice(0, 10),
    jsonLdTypes: facts.jsonLdTypes,
  };
}

export type MarketCategoryInference = {
  category_en: string | null;
  usage?: CompetitorDiscoveryResult["usage"];
};

/**
 * One Venice call **before** web search: infer industry / product category in English
 * so Tavily queries target peers (e.g. cookware brands) instead of echoing only the scanned brand.
 */
export async function inferCompetitorMarketCategoryEn(params: {
  facts: SeoFacts;
  apiKey: string;
  model: string;
}): Promise<MarketCategoryInference> {
  const block = JSON.stringify(compactFactsForCategoryInference(params.facts), null, 2);
  const brandHint = extractBrandLabelForFacts(params.facts);
  const messages = [
    {
      role: "system" as const,
      content:
        "You classify the **business / product market** of a website for finding **rival brands** (other companies). " +
        "Output JSON only: { \"category_en\": string }. " +
        "Rules for category_en: " +
        "(1) Short English phrase, max ~120 characters — what they **sell or do** (e.g. \"premium ceramic nonstick cookware DTC retail\", \"B2B payroll SaaS\"). " +
        "(2) Describe **industry + product type**, not the site’s own **brand name** as the whole category (avoid repeating the brand as if it were the market). " +
        "(3) If the page is thin, infer from title and headings. " +
        "(4) Never output empty string; if impossible, output a generic guess from URL host + title.",
    },
    {
      role: "user" as const,
      content:
        `primary_brand_hint (do not treat as the whole market): ${brandHint}\n\nPAGE_FACTS_JSON:\n${block.length > 10_000 ? `${block.slice(0, 10_000)}\n…` : block}`,
    },
  ];

  try {
    const out = await veniceChatJson({
      apiKey: params.apiKey,
      model: params.model,
      messages,
      veniceParameters: { include_venice_system_prompt: false },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(out.text);
    } catch {
      return {
        category_en: null,
        usage: {
          promptTokens: out.usage.promptTokens,
          completionTokens: out.usage.completionTokens,
          totalTokens: out.usage.totalTokens,
        },
      };
    }

    const raw = (parsed as { category_en?: unknown }).category_en;
    const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (s.length < 6) {
      return {
        category_en: null,
        usage: {
          promptTokens: out.usage.promptTokens,
          completionTokens: out.usage.completionTokens,
          totalTokens: out.usage.totalTokens,
        },
      };
    }

    return {
      category_en: s.slice(0, 200),
      usage: {
        promptTokens: out.usage.promptTokens,
        completionTokens: out.usage.completionTokens,
        totalTokens: out.usage.totalTokens,
      },
    };
  } catch {
    return { category_en: null };
  }
}

function mergeDiscoveryUsage(
  a?: CompetitorDiscoveryResult["usage"],
  b?: CompetitorDiscoveryResult["usage"],
): CompetitorDiscoveryResult["usage"] | undefined {
  if (!a && !b) return undefined;
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}

/** Second Brave query — OR homepage / shop / official site. */
export function buildCompetitorSearchQueryBraveOfficial(facts: SeoFacts): string {
  const brand = extractBrandLabelForFacts(facts);
  const hk = hostKey(facts.url);
  const brandSlug = brandLabelFromHostname(hk);
  const extraNegSite =
    brandSlug.length >= 3 && brandSlug !== hk
      ? ` -site:${brandSlug}.com -site:${brandSlug}.co.uk`
      : "";
  const editorialNeg =
    " -site:epicurious.com -site:bonappetit.com -site:eater.com -site:thewirecutter.com -site:nytimes.com " +
    "-site:foodnetwork.com -site:allrecipes.com -site:seriouseats.com -site:food52.com";
  return (
    `${brand} competitors "official site" OR homepage OR shop OR store ` +
    `-inurl:review -inurl:versus -inurl:shopping -inurl:comparison -inurl:blog ` +
    `-site:${hk} -site:rocketreach.co -site:zoominfo.com -site:crunchbase.com` +
    editorialNeg +
    extraNegSite
  );
}

type BraveWebResult = {
  url?: string;
  title?: string;
  description?: string;
};

/** Web search hit (Brave or Tavily) before Venice allow-list filter. */
type WebSearchCandidate = {
  url: string;
  title?: string;
  description?: string;
};

function parseBraveResults(json: unknown): string[] {
  return parseBraveResultsRich(json).map((x) => x.url);
}

/** Brave web results with title/description for step-2 model context. */
function parseBraveResultsRich(json: unknown): WebSearchCandidate[] {
  if (!json || typeof json !== "object") return [];
  const web = (json as { web?: { results?: BraveWebResult[] } }).web;
  const results = web?.results;
  if (!Array.isArray(results)) return [];
  const out: WebSearchCandidate[] = [];
  for (const r of results) {
    if (typeof r?.url === "string" && /^https?:\/\//i.test(r.url)) {
      out.push({
        url: r.url,
        title: typeof r.title === "string" ? r.title : undefined,
        description: typeof r.description === "string" ? r.description : undefined,
      });
    }
  }
  return out;
}

/** Tavily `/search` JSON — `results[].url`, `title`, `content`. */
function parseTavilyResultsRich(json: unknown): WebSearchCandidate[] {
  if (!json || typeof json !== "object") return [];
  const results = (json as { results?: Array<{ url?: string; title?: string; content?: string }> })
    .results;
  if (!Array.isArray(results)) return [];
  const out: WebSearchCandidate[] = [];
  for (const r of results) {
    if (typeof r?.url === "string" && /^https?:\/\//i.test(r.url)) {
      const content = typeof r.content === "string" ? r.content : undefined;
      out.push({
        url: r.url,
        title: typeof r.title === "string" ? r.title : undefined,
        description: content ? content.slice(0, 500) : undefined,
      });
    }
  }
  return out;
}

function normalizeUrlKey(u: string): string {
  try {
    const x = new URL(u.trim());
    x.hash = "";
    const host = x.hostname.toLowerCase();
    let path = x.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${x.protocol}//${host}${path}${x.search}`;
  } catch {
    return u.trim();
  }
}

/**
 * Step 2: from noisy SERP URLs, keep only direct competitor official sites.
 * Model may only return URLs present in the candidate list (exact allow-list).
 */
async function filterSearchCandidatesWithVenice(params: {
  primaryHref: string;
  facts: SeoFacts;
  candidates: WebSearchCandidate[];
  limit: number;
  apiKey: string;
  model: string;
  /** When set (from {@link inferCompetitorMarketCategoryEn}), helps judge same-market rivals. */
  marketCategoryEn?: string;
}): Promise<{
  urls: string[];
  notes?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  error?: string;
}> {
  const primaryHost = hostKey(params.primaryHref);
  const crossBrand = params.candidates.filter((c) => {
    const ch = hostKey(c.url);
    return Boolean(ch && ch !== primaryHost && !isSameBrandHost(primaryHost, ch));
  });

  if (crossBrand.length === 0) {
    return {
      urls: [],
      notes: "搜尋候選入面冇其他品牌嘅網址（可能只有同一品牌唔同網域）。",
      error: "no_cross_brand_candidates",
    };
  }

  const allowed = new Map<string, string>();
  for (const c of crossBrand) {
    const k = normalizeUrlKey(c.url);
    if (!allowed.has(k)) allowed.set(k, c.url);
  }

  const candidatesPayload = crossBrand.map((c) => ({
    url: c.url,
    title: c.title ?? null,
    description: c.description ? c.description.slice(0, 400) : null,
  }));

  const factsJson = JSON.stringify(params.facts, null, 2);
  const factsBlock = factsJson.length > 12_000 ? `${factsJson.slice(0, 12_000)}\n…` : factsJson;

  const messages = [
    {
      role: "system" as const,
      content:
        "You filter web search results for **rival brands / separate companies** in the same market (e.g. other cookware brands), for **on-page marketing / positioning comparison** (same inputs as SEO competitor snapshots). " +
        "If the user message includes `inferred_market_category_en`, treat it as the **expected industry / product space** — pick candidates that sell in that space, not random industries. " +
        "You receive ONLY a JSON array `candidates` (url + optional title/description from the search engine). " +
        "Output JSON only: { \"urls\": string[], \"notes\": string }. " +
        "Rules: " +
        "(1) Every string in `urls` MUST be copied **exactly** from a `candidates[].url` — no new URLs, no invented paths. " +
        "(2) **Competitors must be a different company than the primary site** — NOT another regional site, subdomain, or TLD of the same brand " +
        "(e.g. if primary is greenpan.com.hk, do NOT pick greenpan.com or any GreenPan-only domain; pick Le Creuset, Tefal, Staub, etc.). " +
        "(3) Prefer **official brand store / product homepages** (e.g. carawayhome.com, greenpan.com) — the site that **sells** that brand’s products. " +
        "(4) Exclude: magazines and shopping guides (Epicurious, Bon Appétit, Wirecutter, NYTimes shopping, `/shopping/` comparison URLs), directories (RocketReach, G2), review/news/listicles, wrong industry, social/wiki. " +
        `(5) At most ${params.limit} URLs, ordered by relevance (strongest *distinct* competitor first). ` +
        "(6) `notes`: one short line (中文或英文) explaining why these are *other* brands — **if Chinese: 繁體中文（香港）only; 嚴禁簡體字**. " +
        "(7) If no candidate is a true rival brand, return { \"urls\": [], \"notes\": \"…\" }. " +
        "(8) Every `candidates[].url` is already a **homepage** (/) — choose rival **brand-owned domains** only, not publishers writing *about* those brands.",
    },
    {
      role: "user" as const,
      content:
        `primary_host: ${primaryHost}\n` +
        `primary_url: ${params.primaryHref}\n` +
        `inferred_market_category_en: ${params.marketCategoryEn?.trim() ? params.marketCategoryEn.trim() : "(none)"}\n\n` +
        `PAGE_FACTS_JSON:\n${factsBlock}\n\n` +
        `candidates:\n${JSON.stringify(candidatesPayload, null, 2)}`,
    },
  ];

  try {
    const out = await veniceChatJson({
      apiKey: params.apiKey,
      model: params.model,
      messages,
      veniceParameters: { include_venice_system_prompt: false },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(out.text);
    } catch {
      return { urls: [], error: "filter_model_json_parse_failed", usage: out.usage };
    }

    const obj = parsed as { urls?: unknown; notes?: unknown };
    const rawUrls = Array.isArray(obj.urls) ? obj.urls : [];
    const notes = typeof obj.notes === "string" ? obj.notes.trim() : undefined;

    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const u of rawUrls) {
      if (typeof u !== "string") continue;
      const t = u.trim();
      if (!t) continue;
      let href: string;
      try {
        const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
        href = new URL(withScheme).toString();
      } catch {
        continue;
      }
      const orig = allowed.get(normalizeUrlKey(href));
      if (!orig) continue;
      const h = hostKey(orig);
      if (!h || h === primaryHost) continue;
      if (isSameBrandHost(primaryHost, h)) continue;
      if (seen.has(h)) continue;
      seen.add(h);
      if (isBadCompetitorPageUrl(orig)) continue;
      resolved.push(orig);
      if (resolved.length >= params.limit) break;
    }

    return {
      urls: resolved,
      notes,
      usage: {
        promptTokens: out.usage.promptTokens,
        completionTokens: out.usage.completionTokens,
        totalTokens: out.usage.totalTokens,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "filter_failed";
    return { urls: [], error: msg };
  }
}

function pickDistinctUrls(
  candidates: string[],
  primaryHost: string,
  limit: number,
): string[] {
  const filtered = candidates.filter((u) => !isBadCompetitorPageUrl(u));
  const sorted = [...filtered].sort(
    (a, b) => competitorUrlPreferenceScore(b) - competitorUrlPreferenceScore(a),
  );

  const picked: string[] = [];
  const seenHosts = new Set<string>();
  for (const u of sorted) {
    if (picked.length >= limit) break;
    const h = hostKey(u);
    if (!h || h === primaryHost) continue;
    if (isSameBrandHost(primaryHost, h)) continue;
    if (seenHosts.has(h)) continue;
    seenHosts.add(h);
    picked.push(u);
  }
  return picked;
}

/** Max web results to request (step 1); then model narrows to `limit`. */
const BRAVE_SEARCH_RESULT_COUNT = 25;
const TAVILY_MAX_RESULTS = 25;

/** Always compare competitor **sites** at origin — never article paths on any domain. */
export function toCompetitorHomepageUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return url.trim();
    return `${u.protocol}//${u.hostname}/`;
  } catch {
    return url.trim();
  }
}

function normalizeDiscoveryCandidate(c: WebSearchCandidate): WebSearchCandidate {
  return { ...c, url: toCompetitorHomepageUrl(c.url) };
}

function normalizeDiscoveryUrlList(urls: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of urls) {
    const h = toCompetitorHomepageUrl(u);
    const host = hostKey(h);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    out.push(h);
  }
  return out;
}

/** Dedupe by hostname; `primary` list wins over `secondary` when both have same host. */
function mergeRichByHost(
  primary: WebSearchCandidate[],
  secondary: WebSearchCandidate[],
): WebSearchCandidate[] {
  const seen = new Set<string>();
  const out: WebSearchCandidate[] = [];
  for (const item of [...primary, ...secondary]) {
    if (!item.url) continue;
    let h: string;
    try {
      h = new URL(item.url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(item);
  }
  return out;
}

/** Earlier lists win — use so official-site queries surface before generic SERP noise. */
function mergeRichOrderedPreservingFirst(...lists: WebSearchCandidate[][]): WebSearchCandidate[] {
  const seen = new Set<string>();
  const out: WebSearchCandidate[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item.url) continue;
      let h: string;
      try {
        h = new URL(item.url).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        continue;
      }
      if (!h || seen.has(h)) continue;
      seen.add(h);
      out.push(item);
    }
  }
  return out;
}

async function fetchTavilyRichCandidates(query: string, apiKey: string): Promise<WebSearchCandidate[]> {
  try {
    const res = await fetch(TAVILY_SEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        api_key: apiKey.trim(),
        query,
        max_results: TAVILY_MAX_RESULTS,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    return parseTavilyResultsRich(json);
  } catch {
    return [];
  }
}

async function fetchBraveRichCandidates(query: string, apiKey: string): Promise<WebSearchCandidate[]> {
  try {
    const q = encodeURIComponent(query);
    const searchUrl = `${BRAVE_SEARCH_ENDPOINT}?q=${q}&count=${BRAVE_SEARCH_RESULT_COUNT}`;
    const res = await fetch(searchUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": apiKey.trim(),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const json: unknown = await res.json();
    return parseBraveResultsRich(json);
  } catch {
    return [];
  }
}

function buildCrossBrandCandidates(
  rich: WebSearchCandidate[],
  primaryHost: string,
): WebSearchCandidate[] {
  const candidatesForModel: WebSearchCandidate[] = [];
  const seenHosts = new Set<string>();
  for (const item of rich) {
    if (!item.url || isBadCompetitorPageUrl(item.url)) {
      continue;
    }
    const normalized = normalizeDiscoveryCandidate(item);
    if (isBadCompetitorPageUrl(normalized.url)) {
      continue;
    }
    const h = hostKey(normalized.url);
    if (!h || h === primaryHost) continue;
    if (isSameBrandHost(primaryHost, h)) continue;
    if (seenHosts.has(h)) continue;
    seenHosts.add(h);
    candidatesForModel.push(normalized);
    if (candidatesForModel.length >= 48) break;
  }
  return candidatesForModel;
}

/**
 * Shared: Venice allow-list + heuristic fallback from any web search provider.
 */
async function twoStepDiscoverFromWebCandidates(params: {
  primaryHref: string;
  facts: SeoFacts;
  limit: number;
  apiKey: string;
  model: string;
  query: string;
  rich: WebSearchCandidate[];
  source: "brave" | "tavily";
  marketCategoryEn?: string;
}): Promise<CompetitorDiscoveryResult> {
  const primaryHost = hostKey(params.primaryHref);
  const candidatesForModel = buildCrossBrandCandidates(params.rich, primaryHost);

  if (candidatesForModel.length === 0) {
    return {
      urls: [],
      query: params.query,
      source: params.source,
      error: `no_${params.source}_candidates_after_filter`,
      two_step: true,
      search_candidates: 0,
    };
  }

  const filtered = await filterSearchCandidatesWithVenice({
    primaryHref: params.primaryHref,
    facts: params.facts,
    candidates: candidatesForModel,
    limit: params.limit,
    apiKey: params.apiKey,
    model: params.model,
    marketCategoryEn: params.marketCategoryEn,
  });

  let urls = filtered.urls;
  let usedFallback = false;
  if (urls.length === 0) {
    const fallbackPool = candidatesForModel.map((c) => c.url);
    urls = pickDistinctUrls(fallbackPool, primaryHost, params.limit);
    usedFallback = urls.length > 0;
  }

  const filterNotes =
    filtered.notes ??
    (usedFallback ? "篩選未揀中；已用搜尋結果啟發式後備。" : undefined);

  const urlsHome = normalizeDiscoveryUrlList(urls);

  const queryLabel =
    `${params.query} · 2-step：${candidatesForModel.length} 候選 → ${urlsHome.length} 個 URL` +
    (filterNotes ? `（${filterNotes.slice(0, 200)}）` : "");

  return {
    urls: urlsHome,
    query: queryLabel,
    source: params.source,
    usage: filtered.usage,
    two_step: true,
    search_candidates: candidatesForModel.length,
    filter_notes: filterNotes,
    error:
      urlsHome.length === 0 ? (filtered.error ?? "no_urls_after_two_step") : undefined,
  };
}

/**
 * Brave Search API — needs `BRAVE_SEARCH_API_KEY`.
 * Two-step: (1) fetch web results; (2) Venice filters to official competitor URLs.
 */
export async function discoverCompetitorUrlsViaBrave(params: {
  primaryHref: string;
  facts: SeoFacts;
  limit: number;
  apiKey: string;
  model: string;
}): Promise<CompetitorDiscoveryResult> {
  const braveKey = getEnv("BRAVE_SEARCH_API_KEY");
  const query = buildCompetitorSearchQuery(params.facts);

  if (!braveKey?.trim()) {
    return {
      urls: [],
      query,
      source: "none",
      error: "missing_brave_search_api_key",
    };
  }

  try {
    const q1 = encodeURIComponent(query);
    const q2 = encodeURIComponent(buildCompetitorSearchQueryBraveOfficial(params.facts));
    const searchUrl1 = `${BRAVE_SEARCH_ENDPOINT}?q=${q1}&count=${BRAVE_SEARCH_RESULT_COUNT}`;
    const searchUrl2 = `${BRAVE_SEARCH_ENDPOINT}?q=${q2}&count=${BRAVE_SEARCH_RESULT_COUNT}`;
    const [res1, res2] = await Promise.all([
      fetch(searchUrl1, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": braveKey.trim(),
        },
        signal: AbortSignal.timeout(15_000),
      }),
      fetch(searchUrl2, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": braveKey.trim(),
        },
        signal: AbortSignal.timeout(15_000),
      }),
    ]);

    if (!res1.ok) {
      return {
        urls: [],
        query,
        source: "brave",
        error: `brave_http_${res1.status}`,
      };
    }

    const json1: unknown = await res1.json();
    const rich1 = parseBraveResultsRich(json1);
    const rich2 = res2.ok ? parseBraveResultsRich(await res2.json()) : [];
    const merged = mergeRichOrderedPreservingFirst(rich2, rich1);
    return twoStepDiscoverFromWebCandidates({
      ...params,
      query: `${query} + official-site query`,
      rich: merged,
      source: "brave",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "discovery_failed";
    return {
      urls: [],
      query,
      source: "brave",
      error: msg,
    };
  }
}

/**
 * Tavily Search API — needs `TAVILY_API_KEY`.
 * Uses a **short natural-language query** (not Google operators). If `BRAVE_SEARCH_API_KEY`
 * is also set, runs **Tavily + Brave in parallel** and merges URL candidates before Venice.
 *
 * **Flow:** one Venice call infers `category_en` from page facts, then Tavily×3 uses two
 * category-biased queries + one brand-official query when category inference succeeds — better
 * peer recall than brand-only phrasing alone.
 */
export async function discoverCompetitorUrlsViaTavily(params: {
  primaryHref: string;
  facts: SeoFacts;
  limit: number;
  apiKey: string;
  model: string;
}): Promise<CompetitorDiscoveryResult> {
  const tavilyKey = getEnv("TAVILY_API_KEY");
  const braveKey = getEnv("BRAVE_SEARCH_API_KEY")?.trim();
  const queryTavily = buildCompetitorSearchQueryTavily(params.facts);
  const queryTavilyOfficial = buildCompetitorSearchQueryTavilyOfficial(params.facts);
  const queryTavilyPeers = buildCompetitorSearchQueryTavilyPeers(params.facts);
  const queryBrave = buildCompetitorSearchQuery(params.facts);

  if (!tavilyKey?.trim()) {
    return {
      urls: [],
      query: queryTavily,
      source: "none",
      error: "missing_tavily_api_key",
    };
  }

  try {
    const inferred = await inferCompetitorMarketCategoryEn({
      facts: params.facts,
      apiKey: params.apiKey,
      model: params.model,
    });
    const categoryEn = inferred.category_en;

    const t1q = categoryEn
      ? buildCompetitorSearchQueryTavilyCategoryA(categoryEn)
      : queryTavilyOfficial;
    const t2q = categoryEn
      ? buildCompetitorSearchQueryTavilyCategoryB(categoryEn)
      : queryTavily;
    const t3q = categoryEn ? queryTavilyOfficial : queryTavilyPeers;

    const [t1, t2, t3, bRich] = await Promise.all([
      fetchTavilyRichCandidates(t1q, tavilyKey),
      fetchTavilyRichCandidates(t2q, tavilyKey),
      fetchTavilyRichCandidates(t3q, tavilyKey),
      braveKey ? fetchBraveRichCandidates(queryBrave, braveKey) : Promise.resolve([]),
    ]);

    const rich = mergeRichOrderedPreservingFirst(t1, t2, t3, bRich);

    const categoryPrefix = categoryEn
      ? `類別「${categoryEn.length > 72 ? `${categoryEn.slice(0, 72)}…` : categoryEn}」· `
      : "";

    const rawTotal = t1.length + t2.length + t3.length + bRich.length;
    const tavilyRaw = t1.length + t2.length + t3.length;
    const queryNote =
      braveKey && bRich.length > 0
        ? `${categoryPrefix}Tavily×3 + Brave · raw ${rawTotal} 條`
        : `${categoryPrefix}Tavily×3 · raw ${tavilyRaw} 條`;

    const qPreview = categoryEn ? `${categoryPrefix}${t1q.slice(0, 120)}` : queryTavily;

    if (rich.length === 0) {
      return {
        urls: [],
        query: `${queryNote} · q=${qPreview.slice(0, 200)}${qPreview.length > 200 ? "…" : ""}`,
        source: "tavily",
        error: `no_raw_search_hits`,
        two_step: true,
        search_candidates: 0,
        usage: inferred.usage,
      };
    }

    const step = await twoStepDiscoverFromWebCandidates({
      ...params,
      query: `${queryNote} · ${qPreview.slice(0, 140)}${qPreview.length > 140 ? "…" : ""}`,
      rich,
      source: "tavily",
      marketCategoryEn: categoryEn ?? undefined,
    });

    return {
      ...step,
      usage: mergeDiscoveryUsage(inferred.usage, step.usage),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "discovery_failed";
    return {
      urls: [],
      query: queryTavily,
      source: "tavily",
      error: msg,
    };
  }
}

/**
 * Second Venice call: propose competitor page URLs from page facts only (no live search).
 * URLs are still validated + fetched server-side; hallucinated hosts may fail later.
 */
export async function discoverCompetitorUrlsViaModel(params: {
  primaryHref: string;
  facts: SeoFacts;
  limit: number;
  apiKey: string;
  model: string;
}): Promise<CompetitorDiscoveryResult> {
  const primaryHost = hostKey(params.primaryHref);
  const factsJson = JSON.stringify(params.facts, null, 2);

  const messages = [
    {
      role: "system" as const,
      content:
        "You pick **direct competitor brand / product sites** in the same market (e.g. SaaS, e‑commerce, cookware brands), for on-page comparison. " +
        "Prefer **official homepages** (or main shop / product lines) on the competitor's own domain. " +
        "Output JSON only with keys: urls (array of 0 to " +
        params.limit +
        " strings), notes (optional short string — if Chinese: 繁體中文（香港）only; 嚴禁簡體字). " +
        "**Do NOT** include: listicles ('X alternatives', 'best …'), blog roundups, `/content/…-alternatives`, Medium, G2/Capterra-style directories, " +
        "**RocketReach / ZoomInfo / Crunchbase / Owler / GrowJo / PitchBook / Craft** (or any URL that is only a *list of company names* without being that company's own site), " +
        "magazine shopping guides (Epicurious `/shopping/`, Bon Appétit, Wirecutter, NYTimes product reviews), or any URL whose **primary purpose is comparing brands in an article** instead of selling one brand’s products. " +
        "**List each competitor as its own site URL** (e.g. `https://www.lecreuset.com`) — never return a single directory link that merely describes competitors. " +
        "Exclude the same host as primary_host, and exclude **the same brand / company** on a different domain " +
        "(e.g. if primary is greenpan.com.hk, do NOT return greenpan.com — that is the same brand, not a competitor). " +
        "Avoid social networks, Wikipedia, and search engines. " +
        "If unsure, return fewer URLs or an empty array—do not invent pathnames you cannot justify.",
    },
    {
      role: "user" as const,
      content:
        `primary_host: ${primaryHost}\n` +
        `primary_url: ${params.primaryHref}\n\n` +
        `PAGE_FACTS_JSON:\n${factsJson}`,
    },
  ];

  try {
    const out = await veniceChatJson({
      apiKey: params.apiKey,
      model: params.model,
      messages,
      veniceParameters: { include_venice_system_prompt: false },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(out.text);
    } catch {
      return {
        urls: [],
        query: "(model)",
        source: "model",
        error: "model_json_parse_failed",
        usage: {
          promptTokens: out.usage.promptTokens,
          completionTokens: out.usage.completionTokens,
          totalTokens: out.usage.totalTokens,
        },
      };
    }

    const obj = parsed as { urls?: unknown; notes?: string };
    const rawUrls = Array.isArray(obj.urls) ? obj.urls : [];
    const candidates: string[] = [];
    for (const u of rawUrls) {
      if (typeof u !== "string") continue;
      const t = u.trim();
      if (!t) continue;
      try {
        const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
        const urlObj = new URL(withScheme);
        if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") continue;
        candidates.push(urlObj.toString());
      } catch {
        continue;
      }
    }

    const picked = pickDistinctUrls(candidates, primaryHost, params.limit);
    const notes = typeof obj.notes === "string" ? obj.notes.trim() : "";

    return {
      urls: normalizeDiscoveryUrlList(picked),
      query: notes ? `model:${notes.slice(0, 280)}` : "(venice · model-picked URLs)",
      source: "model",
      usage: {
        promptTokens: out.usage.promptTokens,
        completionTokens: out.usage.completionTokens,
        totalTokens: out.usage.totalTokens,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "model_discovery_failed";
    return {
      urls: [],
      query: "(model)",
      source: "model",
      error: msg,
    };
  }
}

/**
 * Auto competitor URL discovery: `none`, Tavily, Brave, or Venice per {@link resolveCompetitorDiscoveryStrategy}.
 * Missing search API keys fall back to the next provider (Tavily → Brave → model).
 */
export async function discoverCompetitorUrlsAuto(params: {
  primaryHref: string;
  facts: SeoFacts;
  limit: number;
  apiKey: string;
  model: string;
}): Promise<CompetitorDiscoveryResult> {
  const strategy = resolveCompetitorDiscoveryStrategy();
  if (strategy === "none") {
    return {
      urls: [],
      query: "(disabled)",
      source: "none",
      error: "competitor_discovery_disabled",
    };
  }

  if (strategy === "tavily") {
    const t = await discoverCompetitorUrlsViaTavily(params);
    if (t.error === "missing_tavily_api_key") {
      const b = await discoverCompetitorUrlsViaBrave(params);
      if (b.error === "missing_brave_search_api_key") {
        return discoverCompetitorUrlsViaModel(params);
      }
      return b;
    }
    return t;
  }

  if (strategy === "brave") {
    const brave = await discoverCompetitorUrlsViaBrave({
      primaryHref: params.primaryHref,
      facts: params.facts,
      limit: params.limit,
      apiKey: params.apiKey,
      model: params.model,
    });
    if (brave.error === "missing_brave_search_api_key") {
      return discoverCompetitorUrlsViaModel(params);
    }
    return brave;
  }

  return discoverCompetitorUrlsViaModel(params);
}
