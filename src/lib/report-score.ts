import type { PageSpeedInsightsPayload, PageSpeedScores } from "@/lib/pagespeed-insights";
import { normalizeSeoScanForUi } from "@/lib/seo-scan-normalize";

const AUDIT_DIM_KEYS = ["title", "meta", "headings", "content", "technical"] as const;

/** Mean of `seo_scan.scores` dimensions when `overallScore` is absent (model sometimes omits top-level number). */
export function averageAuditDimensionScores(
  scores: Record<string, number> | null | undefined,
): number | null {
  if (!scores) return null;
  const vals = AUDIT_DIM_KEYS.map((k) => scores[k]).filter(
    (x): x is number => typeof x === "number" && Number.isFinite(x),
  );
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Arithmetic mean of available Lighthouse lab category scores (0–100 each): Performance, A11y, Best Practices, SEO. */
export function averagePsiScores(scores: PageSpeedScores | null): number | null {
  if (!scores) return null;
  const vals = [scores.performance, scores.accessibility, scores.bestPractices, scores.seo].filter(
    (x): x is number => typeof x === "number" && Number.isFinite(x),
  );
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export type UnifiedScoreParts = {
  /** Single number shown to the user (average of Google avg + on-page audit when both exist). */
  composite: number | null;
  psiAvg: number | null;
  aiOverall: number | null;
};

/**
 * Headline "綜合分": (1) If both PageSpeed + AI audit number exist → average of **psiAvg** and **aiOverall**.
 * **aiOverall** = `seo_scan.overallScore` when set; else **mean of `seo_scan.scores` five dimensions** when the model omitted the headline number.
 * (2) If only PageSpeed → **psiAvg** only.
 * (3) If only audit → **aiOverall** only.
 */
export function computeUnifiedScore(
  pagespeedInsights: unknown,
  seoScan: unknown,
): UnifiedScoreParts {
  const psiPayload = pagespeedInsights as PageSpeedInsightsPayload | null | undefined;
  const psiAvg =
    psiPayload?.scores && !psiPayload.error
      ? averagePsiScores(psiPayload.scores)
      : null;

  const norm = normalizeSeoScanForUi(seoScan);
  const aiOverall: number | null = norm
    ? norm.overallScore !== null
      ? Math.round(norm.overallScore)
      : averageAuditDimensionScores(norm.scores)
    : null;

  if (psiAvg !== null && aiOverall !== null) {
    return {
      composite: Math.round((psiAvg + aiOverall) / 2),
      psiAvg,
      aiOverall,
    };
  }
  if (psiAvg !== null) return { composite: psiAvg, psiAvg, aiOverall: null };
  if (aiOverall !== null) return { composite: aiOverall, psiAvg: null, aiOverall };
  return { composite: null, psiAvg: null, aiOverall: null };
}
