/**
 * Google PageSpeed Insights API v5 (Lighthouse lab scores).
 * https://developers.google.com/speed/docs/insights/v5/get-started
 */

const PSI_BASE = "https://pagespeedonline.googleapis.com/pagespeedonline/v5/runPagespeed";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export type PageSpeedScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

export type PageSpeedInsightsPayload = {
  strategy: "mobile" | "desktop";
  analyzedUrl: string;
  /** PSI response `id` (report URL) when present */
  reportId?: string;
  scores: PageSpeedScores | null;
  error?: string;
};

function categoryScore(lh: Record<string, unknown>, id: string): number | null {
  const cats = lh.categories;
  if (!isRecord(cats)) return null;
  const c = cats[id];
  if (!isRecord(c)) return null;
  const s = c.score;
  if (typeof s !== "number" || !Number.isFinite(s)) return null;
  return Math.max(0, Math.min(100, Math.round(100 * s)));
}

function parsePsiErrorBody(text: string): string {
  try {
    const j = JSON.parse(text) as unknown;
    if (!isRecord(j)) return text.slice(0, 200);
    const err = j.error;
    if (isRecord(err) && typeof err.message === "string") return err.message;
  } catch {
    /* ignore */
  }
  return text.slice(0, 200);
}

/**
 * Lab scores for **mobile** strategy (matches common “PageSpeed” checks).
 */
export async function fetchPageSpeedInsightsMobile(
  pageUrl: string,
  apiKey: string,
): Promise<PageSpeedInsightsPayload> {
  const u = new URL(PSI_BASE);
  u.searchParams.set("url", pageUrl);
  u.searchParams.set("key", apiKey);
  u.searchParams.set("strategy", "mobile");
  for (const c of ["performance", "accessibility", "best-practices", "seo"] as const) {
    u.searchParams.append("category", c);
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(u.toString(), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        strategy: "mobile",
        analyzedUrl: pageUrl,
        scores: null,
        error: parsePsiErrorBody(text) || `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as Record<string, unknown>;
    const lh = data.lighthouseResult;
    if (!isRecord(lh)) {
      return {
        strategy: "mobile",
        analyzedUrl: pageUrl,
        scores: null,
        error: "missing_lighthouse_result",
      };
    }
    const finalUrl = typeof lh.finalUrl === "string" ? lh.finalUrl : pageUrl;
    const scores: PageSpeedScores = {
      performance: categoryScore(lh, "performance"),
      accessibility: categoryScore(lh, "accessibility"),
      bestPractices: categoryScore(lh, "best-practices"),
      seo: categoryScore(lh, "seo"),
    };
    return {
      strategy: "mobile",
      analyzedUrl: finalUrl,
      reportId: typeof data.id === "string" ? data.id : undefined,
      scores,
    };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "自動測試逾時（>90s）"
          : e.message
        : "fetch_failed";
    return { strategy: "mobile", analyzedUrl: pageUrl, scores: null, error: msg };
  } finally {
    clearTimeout(t);
  }
}
