import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv, requireEnv } from "@/lib/env";
import {
  checkAndConsumeGlobalFreeScanQuota,
  getFreeGlobalDailyLimit,
  getGlobalFreeScanRemaining,
  isIpFreeScanUsed,
  isQuotaBypassIp,
  markIpFreeScanUsed,
  refundGlobalFreeScanQuota,
} from "@/lib/quota";
import { extractSeoFacts, type SeoFacts } from "@/lib/seo-extract";
import { fetchPageHtml } from "@/lib/seo-fetch";
import {
  extractSameOriginLinks,
  getMaxExtraSitePages,
  pickExtraPagesToCrawl,
} from "@/lib/site-pages-crawl";
import { getClientIp } from "@/lib/request-ip";
import { buildPaidScanPrompt } from "@/lib/scan-prompts";
import {
  getSubscriptionForCustomer,
  isActiveSubscription,
} from "@/lib/subscription";
import {
  discoverCompetitorUrlsAuto,
  resolveCompetitorDiscoveryStrategy,
} from "@/lib/competitor-discovery";
import { normalizeAndAssertSafeUrl } from "@/lib/ssrf";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { normalizePreviewActionsForResponse } from "@/lib/preview-actions-normalize";
import {
  fetchPageSpeedInsightsMobile,
  type PageSpeedInsightsPayload,
} from "@/lib/pagespeed-insights";
import { normalizeSeoScanForUi } from "@/lib/seo-scan-normalize";
import { DEFAULT_VENICE_MODEL, veniceChatJson } from "@/lib/venice";

const MAX_COMPETITOR_URLS = 3;

const bodySchema = z.object({
  url: z.string().min(4).max(2048),
  turnstileToken: z.string().min(1).optional(),
  /** Optional public URLs of competitor pages to compare (on-page snapshot only). */
  competitorUrls: z
    .array(z.string().min(4).max(2048))
    .max(MAX_COMPETITOR_URLS)
    .optional(),
});

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice =
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(slice) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Model output was not a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        {
          error: "請先登入或註冊會員，先可以使用營銷分析。",
          signInRequired: true,
        },
        { status: 401 },
      );
    }

    const turnstileSecret = getEnv("TURNSTILE_SECRET_KEY");
    const json = (await request.json()) as unknown;
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "請求內容無效" }, { status: 400 });
    }

    const ip = getClientIp(request);
    if (turnstileSecret) {
      const token = parsed.data.turnstileToken;
      if (!token) {
        return NextResponse.json(
          { error: "請先完成人機驗證" },
          { status: 400 },
        );
      }
      const ok = await verifyTurnstileToken({
        secret: turnstileSecret,
        token,
        remoteip: ip,
      });
      if (!ok) {
        return NextResponse.json(
          { error: "人機驗證失敗，請重試" },
          { status: 400 },
        );
      }
    }

    const cookieStore = await cookies();
    const customerId = cookieStore.get("crawlme_customer")?.value;
    const sub = await getSubscriptionForCustomer(customerId);
    /** Stripe subscription only — not used to gate report richness (honour unlock removed). */
    const isSubscriber = isActiveSubscription(sub);

    const globalLimit = getFreeGlobalDailyLimit();
    const bypass = isQuotaBypassIp(ip);

    let freeGlobalRemaining: number | undefined;
    let consumedGlobal = false;

    if (!isSubscriber && !bypass) {
      if (await isIpFreeScanUsed(ip)) {
        return NextResponse.json(
          {
            error:
              "此 IP 已使用過體驗額度內嘅分析。聽日再試、換網絡，或聯絡我哋。",
            upgrade: true,
            ipFreeExhausted: true,
          },
          { status: 429 },
        );
      }

      const q = await checkAndConsumeGlobalFreeScanQuota({
        dailyGlobalLimit: globalLimit,
      });
      if (!q.allowed) {
        return NextResponse.json(
          {
            error:
              "今日全站體驗名額已滿，聽日再試。",
            remaining: 0,
            upgrade: true,
            globalQuotaExhausted: true,
            freeGlobalLimit: globalLimit,
          },
          { status: 429 },
        );
      }
      freeGlobalRemaining = q.remaining;
      consumedGlobal = true;
    } else if (!isSubscriber && bypass) {
      freeGlobalRemaining = await getGlobalFreeScanRemaining(globalLimit);
    }

    const safe = await normalizeAndAssertSafeUrl(parsed.data.url);
    const page = await fetchPageHtml(safe.href);
    const facts = extractSeoFacts({
      url: safe.href,
      finalUrl: page.finalUrl,
      status: page.status,
      html: page.html,
      headerPairs: page.headerPairs,
    });

    const maxExtra = getMaxExtraSitePages(true);
    const extraUrls = pickExtraPagesToCrawl(
      extractSameOriginLinks(page.html, page.finalUrl),
      page.finalUrl,
      maxExtra,
    );
    const additionalSiteFacts: SeoFacts[] = [];
    const siteCrawlPages: Array<{ url: string; ok: boolean; error?: string }> = [
      { url: page.finalUrl, ok: true },
    ];
    for (const href of extraUrls) {
      try {
        const u = await normalizeAndAssertSafeUrl(href);
        const extraPage = await fetchPageHtml(u.href);
        additionalSiteFacts.push(
          extractSeoFacts({
            url: u.href,
            finalUrl: extraPage.finalUrl,
            status: extraPage.status,
            html: extraPage.html,
            headerPairs: extraPage.headerPairs,
          }),
        );
        siteCrawlPages.push({ url: u.href, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "fetch_failed";
        siteCrawlPages.push({ url: href, ok: false, error: msg });
      }
    }

    const siteCrawl = {
      total_pages: 1 + additionalSiteFacts.length,
      extra_requested: extraUrls.length,
      pages: siteCrawlPages,
    };

    const apiKey = requireEnv("VENICE_API_KEY");
    const model = getEnv("VENICE_MODEL") ?? DEFAULT_VENICE_MODEL;

    let rawCompetitorUrls = parsed.data.competitorUrls ?? [];
    let discoveryUsage: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    } | undefined;

    let competitorDiscovery: {
      mode: "user" | "automatic" | "none";
      strategy?: "model" | "brave" | "tavily" | "none";
      query?: string;
      source?: "brave" | "tavily" | "model" | "none";
      error?: string;
      urls_picked?: string[];
      /** Brave: search → model filter */
      two_step?: boolean;
      search_candidates?: number;
      filter_notes?: string;
    };

    if (rawCompetitorUrls.length > 0) {
      competitorDiscovery = {
        mode: "user",
        strategy: resolveCompetitorDiscoveryStrategy(),
      };
    } else {
      const auto = await discoverCompetitorUrlsAuto({
        primaryHref: safe.href,
        facts,
        limit: MAX_COMPETITOR_URLS,
        apiKey,
        model,
      });
      rawCompetitorUrls = auto.urls;
      discoveryUsage = auto.usage;
      const strat = resolveCompetitorDiscoveryStrategy();
      const disabled = auto.error === "competitor_discovery_disabled";
      competitorDiscovery = {
        mode: disabled ? "none" : "automatic",
        strategy: strat,
        query: auto.query,
        source: auto.source,
        error: auto.error,
        urls_picked: auto.urls,
        two_step: auto.two_step,
        search_candidates: auto.search_candidates,
        filter_notes: auto.filter_notes,
      };
    }

    const seen = new Set<string>([safe.href]);
    const competitorFactsList: SeoFacts[] = [];
    const competitorFetchNotes: Array<{ url: string; ok: boolean; error?: string }> = [];

    for (const raw of rawCompetitorUrls.slice(0, MAX_COMPETITOR_URLS)) {
      const trimmed = raw.trim();
      if (!trimmed) continue;
      try {
        const cSafe = await normalizeAndAssertSafeUrl(trimmed);
        if (seen.has(cSafe.href)) {
          competitorFetchNotes.push({ url: trimmed, ok: false, error: "duplicate_or_same_as_primary" });
          continue;
        }
        seen.add(cSafe.href);
        const cPage = await fetchPageHtml(cSafe.href);
        competitorFactsList.push(
          extractSeoFacts({
            url: cSafe.href,
            finalUrl: cPage.finalUrl,
            status: cPage.status,
            html: cPage.html,
            headerPairs: cPage.headerPairs,
          }),
        );
        competitorFetchNotes.push({ url: cSafe.href, ok: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "fetch_failed";
        competitorFetchNotes.push({ url: trimmed, ok: false, error: msg });
      }
    }

    const messages = buildPaidScanPrompt(facts, competitorFactsList, additionalSiteFacts);

    const psiKey = getEnv("GOOGLE_PAGESPEED_API_KEY");
    const psiPromise = psiKey
      ? fetchPageSpeedInsightsMobile(facts.finalUrl, psiKey)
      : Promise.resolve(null);

    let text: string;
    let usage: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
      cfRay?: string;
    };

    let pagespeedInsights: PageSpeedInsightsPayload | null = null;

    try {
      const [out, psi] = await Promise.all([
        veniceChatJson({
          apiKey,
          model,
          messages,
          veniceParameters: { include_venice_system_prompt: false },
        }),
        psiPromise,
      ]);
      pagespeedInsights = psi;
      text = out.text;
      usage = {
        promptTokens: (discoveryUsage?.promptTokens ?? 0) + (out.usage.promptTokens ?? 0),
        completionTokens:
          (discoveryUsage?.completionTokens ?? 0) + (out.usage.completionTokens ?? 0),
        totalTokens: (discoveryUsage?.totalTokens ?? 0) + (out.usage.totalTokens ?? 0),
        cfRay: out.usage.cfRay,
      };
    } catch (e) {
      if (consumedGlobal) {
        await refundGlobalFreeScanQuota();
      }
      throw e;
    }

    let obj: Record<string, unknown>;
    try {
      obj = parseJsonObject(text);
    } catch (e) {
      if (consumedGlobal) {
        await refundGlobalFreeScanQuota();
      }
      throw e;
    }

    if (!isSubscriber && !bypass) {
      await markIpFreeScanUsed(ip);
    }

    let seoScanPayload =
      normalizeSeoScanForUi(obj.seo_scan) ??
      normalizeSeoScanForUi(obj.seoScan) ??
      normalizeSeoScanForUi(obj);

    const previewActions = normalizePreviewActionsForResponse(obj, {
      max: 3,
      fillFromFullActionsIfPaid: true,
    });

    return NextResponse.json({
      seo_scan: seoScanPayload,
      preview_actions: previewActions,
      competitor_analysis: obj.competitor_analysis ?? null,
      full_actions: obj.full_actions ?? [],
      conversion_notes: obj.conversion_notes ?? null,
      /** `true` only for active Stripe subscription — does not gate report content. */
      paid: isSubscriber,
      usage,
      facts,
      competitor_facts: competitorFactsList,
      competitor_fetch_notes: competitorFetchNotes,
      competitor_discovery: competitorDiscovery,
      pagespeed_insights: pagespeedInsights,
      site_crawl: siteCrawl,
      ...(typeof freeGlobalRemaining === "number"
        ? { freeGlobalRemaining, freeGlobalLimit: globalLimit }
        : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "發生錯誤";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
