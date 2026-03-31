"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PreviewActionImplementationSteps } from "@/components/ScanResultBlocks";
import { computeUnifiedScore } from "@/lib/report-score";
import {
  INSTAGRAM_PROFILE_URL,
  THREADS_PROFILE_URL,
  THREADS_UNLOCK_POST_URL,
} from "@/lib/threads-constants";

/** Lazy: only loads after a successful scan (smaller initial / home chunk). */
const SeoScanPanel = dynamic(
  () => import("@/components/ScanResultBlocks").then((m) => ({ default: m.SeoScanPanel })),
  { loading: () => <PanelChunkSkeleton /> },
);
const CompetitorAnalysisPanel = dynamic(
  () => import("@/components/ScanResultBlocks").then((m) => ({ default: m.CompetitorAnalysisPanel })),
  { loading: () => <PanelChunkSkeleton /> },
);
const FullActionsPanel = dynamic(
  () => import("@/components/ScanResultBlocks").then((m) => ({ default: m.FullActionsPanel })),
  { loading: () => <PanelChunkSkeleton /> },
);
const UnifiedScorePanel = dynamic(
  () => import("@/components/ScanResultBlocks").then((m) => ({ default: m.UnifiedScorePanel })),
  { loading: () => <PanelChunkSkeleton /> },
);
const CompetitorSitesRow = dynamic(
  () => import("@/components/ScanResultBlocks").then((m) => ({ default: m.CompetitorSitesRow })),
  { loading: () => <div className="mt-4 h-12 animate-pulse rounded-xl bg-white/[0.06]" aria-hidden /> },
);
const PriorityFindingsPreview = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({ default: m.PriorityFindingsPreview })),
  { loading: () => <PanelChunkSkeleton /> },
);

function PanelChunkSkeleton() {
  return (
    <div
      className="h-20 animate-pulse rounded-lg bg-white/[0.06]"
      aria-hidden
    />
  );
}

/** Aligns with server `normalizeAndAssertSafeUrl`: prepend https when scheme omitted. */
function withHttpsScheme(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** ① 幫手留 comment ② 追蹤 Threads + IG — 額度用盡提示 only（主頁 hero 有主要 CTA）。 */
function SocialSupportStrip() {
  const base =
    "crawlme-focus-ring inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-center font-medium transition box-border";
  const cls = `${base} border-amber-400/30 bg-black/30 px-3 py-2 text-xs text-amber-100 hover:bg-black/40`;
  const followInner = `${base} border-amber-400/25 bg-black/40 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-black/50`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={THREADS_UNLOCK_POST_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        幫手留 comment
      </a>
      <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-amber-400/30 bg-black/25 px-2 py-1.5">
        <span className="shrink-0 pl-0.5 text-[11px] text-amber-200/70">追蹤</span>
        <a
          href={THREADS_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={followInner}
        >
          Threads
        </a>
        <a
          href={INSTAGRAM_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={followInner}
        >
          Instagram
        </a>
      </div>
    </div>
  );
}

const Turnstile = dynamic(
  () => import("@marsidev/react-turnstile").then((m) => m.Turnstile),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex min-h-[65px] w-fit max-w-full items-center rounded-md border border-white/10 bg-black/30 px-3 text-xs text-foreground-muted"
        role="status"
        aria-live="polite"
      >
        載入緊人機驗證…
      </div>
    ),
  },
);

type ScanResponse = {
  error?: string;
  signInRequired?: boolean;
  upgrade?: boolean;
  ipFreeExhausted?: boolean;
  globalQuotaExhausted?: boolean;
  paid?: boolean;
  freeGlobalRemaining?: number;
  freeGlobalLimit?: number;
  seo_scan?: unknown;
  preview_actions?: Array<{
    title?: string;
    rationale?: string;
    impact?: string;
    /** Implementation steps (same shape as Pro `full_actions` steps). */
    steps?: unknown;
  }>;
  /** Free tier only: high-impact preview rows (blurred in Pro block) */
  preview_high_impact?: Array<{
    title?: string;
    rationale?: string;
    impact?: string;
  }>;
  /** Free tier only: blurred Pro upsell rows */
  pro_teaser_actions?: Array<{
    title?: string;
    impact?: string;
    hook?: string;
  }>;
  full_actions?: unknown;
  conversion_notes?: unknown;
  competitor_analysis?: unknown;
  facts?: unknown;
  competitor_facts?: unknown;
  competitor_fetch_notes?: Array<{ url: string; ok: boolean; error?: string }>;
  competitor_discovery?: {
    mode: "user" | "automatic" | "none";
    strategy?: "model" | "brave" | "tavily" | "none";
    query?: string;
    source?: "brave" | "tavily" | "model" | "none";
    error?: string;
    urls_picked?: string[];
    two_step?: boolean;
    search_candidates?: number;
    filter_notes?: string;
  };
  /** Lab performance/quality scores when configured; null if backend env unset */
  pagespeed_insights?: unknown;
  site_crawl?: {
    total_pages: number;
    extra_requested: number;
    pages: Array<{ url: string; ok: boolean; error?: string }>;
  };
};

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** Shown while /api/scan runs — informational only (no fake step-by-step progress). */
const SCAN_LOADING_STEPS = [
  {
    title: "讀取你嘅頁面",
    detail: "下載公開內容；若已設定 Google PageSpeed，會一併拉實驗室分數。",
  },
  {
    title: "揀競爭對手",
    detail: "先搜尋候選網址，再篩選真正其他品牌嘅官網。",
  },
  {
    title: "寫報告",
    detail: "整理營銷向摘要、優先次序同可跟住做嘅建議。",
  },
] as const;

export function ScanForm() {
  const { isSignedIn, isLoaded } = useAuth();
  const { openSignIn } = useClerk();
  const [url, setUrl] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [paid, setPaid] = useState<boolean | null>(null);
  const [quotaBypass, setQuotaBypass] = useState(false);
  const [ipAlreadyUsedFree, setIpAlreadyUsedFree] = useState(false);
  const [freeGlobalRemaining, setFreeGlobalRemaining] = useState<number | null>(null);
  const [freeGlobalLimit, setFreeGlobalLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const unified = useMemo(
    () => (result ? computeUnifiedScore(result.pagespeed_insights, result.seo_scan) : null),
    [result],
  );
  const [error, setError] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);

  const refreshMe = useCallback(() => {
    return fetch("/api/me")
      .then((r) => r.json())
      .then(
        (d: {
          paid?: boolean;
          quotaBypass?: boolean;
          ipAlreadyUsedFree?: boolean;
          freeGlobalRemaining?: number;
          freeGlobalLimit?: number;
        }) => {
          setPaid(!!d.paid);
          if (d.paid) return;
          setQuotaBypass(!!d.quotaBypass);
          setIpAlreadyUsedFree(!!d.ipAlreadyUsedFree);
          setFreeGlobalRemaining(
            typeof d.freeGlobalRemaining === "number" ? d.freeGlobalRemaining : null,
          );
          setFreeGlobalLimit(typeof d.freeGlobalLimit === "number" ? d.freeGlobalLimit : null);
        },
      )
      .catch(() => {
        setPaid(false);
        setQuotaBypass(false);
        setIpAlreadyUsedFree(false);
        setFreeGlobalRemaining(null);
        setFreeGlobalLimit(null);
      });
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const needsTurnstile = Boolean(turnstileSiteKey);

  const canSubmit = useMemo(() => {
    if (!url.trim()) return false;
    if (!isLoaded) return false;
    if (!isSignedIn) return true;
    if (needsTurnstile && !turnstileToken) return false;
    if (paid === false && !quotaBypass && ipAlreadyUsedFree) return false;
    return true;
  }, [isLoaded, isSignedIn, needsTurnstile, paid, quotaBypass, ipAlreadyUsedFree, turnstileToken, url]);

  const runScan = useCallback(async () => {
    setError(null);
    if (!isLoaded) return;
    if (!isSignedIn) {
      if (!url.trim()) {
        setError("請先輸入要分析嘅網址。");
        return;
      }
      openSignIn({});
      return;
    }

    setResult(null);
    setLoading(true);
    try {
      const body: { url: string; turnstileToken?: string } = {
        url: withHttpsScheme(url),
      };
      if (needsTurnstile && turnstileToken) body.turnstileToken = turnstileToken;

      const res = await fetch("/api/scan", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ScanResponse & { upgrade?: boolean };
      if (!res.ok) {
        if (res.status === 401 && data.signInRequired) {
          setError(data.error ?? "請先登入或註冊會員。");
          return;
        }
        if (res.status === 429 && data.upgrade) {
          setError(null);
          setResult({ ...data, paid: false });
          void refreshMe();
          return;
        }
        setError(data.error ?? `請求失敗（${res.status}）`);
        return;
      }
      setResult(data);
      if (typeof data.paid === "boolean") setPaid(data.paid);
      if (data.paid === false && typeof data.freeGlobalRemaining === "number") {
        setFreeGlobalRemaining(data.freeGlobalRemaining);
      }
      if (typeof data.freeGlobalLimit === "number") {
        setFreeGlobalLimit(data.freeGlobalLimit);
      }
      void refreshMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "網絡錯誤");
    } finally {
      setLoading(false);
    }
  }, [isLoaded, isSignedIn, needsTurnstile, openSignIn, refreshMe, turnstileToken, url]);

  const hasSuccessResult = Boolean(result && !result.error && !result.upgrade);
  const showInputForm = !hasSuccessResult && !loading;

  const resetToNewScan = useCallback(() => {
    setResult(null);
    setError(null);
    setTurnstileToken(null);
  }, []);

  return (
    <div className="flex flex-col gap-10">
      {showInputForm && !isLoaded ? (
        <section className="rounded-2xl border border-white/10 bg-[#0b0c10] p-6">
          <div className="h-36 animate-pulse rounded-xl bg-white/[0.06]" aria-hidden />
          <p className="sr-only">載入帳戶狀態…</p>
        </section>
      ) : showInputForm && isLoaded ? (
        <section className="rounded-2xl border border-white/10 bg-[#0b0c10] p-6">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit && !loading) void runScan();
            }}
          >
            <label className="text-sm text-foreground-muted" htmlFor="url">
              要分析嘅頁面網址
            </label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                id="url"
                name="url"
                type="text"
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder="example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-describedby={
                  !isSignedIn
                    ? "auth-before-scan"
                    : needsTurnstile
                      ? "turnstile-hint"
                      : undefined
                }
                className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none ring-amber-400/30 placeholder:text-foreground-subtle focus:border-amber-400/50 focus:ring-2"
              />
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="crawlme-focus-ring shrink-0 rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                開始分析
              </button>
            </div>
            {!isSignedIn ? (
              <p id="auth-before-scan" className="text-xs text-foreground-muted">
                撳「開始分析」會請你先<strong className="text-white/85">登入或註冊</strong>；登入後會用同一個網址繼續。
              </p>
            ) : null}
            {needsTurnstile && isSignedIn ? (
              <div className="space-y-2 pt-2">
                <p id="turnstile-hint" className="text-xs text-foreground-muted">
                  先完成下面驗證，再撳「開始分析」。
                </p>
              {turnstileError ? (
                <p className="text-xs text-red-300/95" role="alert">
                  {turnstileError}
                </p>
              ) : null}
              <div className="min-h-[65px] w-fit max-w-full [&_iframe]:rounded-md">
                <Turnstile
                  siteKey={turnstileSiteKey as string}
                  onSuccess={(token) => {
                    setTurnstileError(null);
                    setTurnstileToken(token);
                  }}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() =>
                    setTurnstileError(
                      "驗證載入唔到。試重新整理頁面，或者暫停擋廣告／私隱外掛，同埋允許 challenges.cloudflare.com。",
                    )
                  }
                />
              </div>
              </div>
            ) : null}
            {isSignedIn &&
            (paid === true ||
              (!quotaBypass && ipAlreadyUsedFree) ||
              (!quotaBypass && freeGlobalRemaining !== null && freeGlobalLimit !== null) ||
              (paid === false && quotaBypass)) ? (
              <div className="space-y-3 rounded-xl border border-white/[0.08] bg-black/25 px-3 py-3 text-xs text-foreground-muted">
                {paid === true ? (
                  <p className="text-foreground-subtle">你嘅帳戶唔受體驗額度限制。</p>
                ) : !quotaBypass && ipAlreadyUsedFree ? (
                  <p className="text-amber-200/90">
                    呢個 IP 已用過體驗額度。聽日再試、換網絡，或聯絡我哋。
                  </p>
                ) : !quotaBypass && freeGlobalRemaining !== null && freeGlobalLimit !== null ? (
                  <div className="border-l-2 border-amber-400/40 pl-3">
                    <p className="font-medium text-amber-200/90">額度說明</p>
                    <p className="mt-1 text-foreground-subtle">
                      每個 IP 限做一次體驗分析。全站今日尚餘{" "}
                      <span className="font-semibold tabular-nums text-amber-200/95">{freeGlobalRemaining}</span>
                      ／{freeGlobalLimit} 個名額（先到先得）。
                    </p>
                  </div>
                ) : paid === false && quotaBypass ? (
                  <p className="text-foreground-subtle">你正使用配額豁免測試。</p>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>
      ) : loading ? (
        <section
          className="rounded-2xl border border-white/10 bg-[#0b0c10] p-8 text-center sm:p-10"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-sm font-medium text-white">分析緊…</p>
          <p className="mt-2 text-xs text-foreground-muted">
            唔使關閉呢頁。多數{" "}
            <span className="text-foreground-muted/95">30–90 秒</span>
            ，視乎頁面大小同網絡。
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-xs">
            {SCAN_LOADING_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5 text-foreground-muted"
              >
                <span className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-white/35">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-white/75">{step.title}</span>
                  <span className="mt-0.5 block leading-relaxed text-foreground-subtle">
                    {step.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div
            className="mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-white/10"
            aria-hidden
          >
            <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-amber-500/40 via-amber-400 to-amber-500/40 crawlme-progress-indeterminate" />
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {error}
        </div>
      ) : null}

      {result?.upgrade ? (
        <div
          className="rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-4 text-sm text-amber-50"
          role="status"
          aria-live="polite"
        >
          <p>
            {result.ipFreeExhausted
              ? "呢個 IP 已用過體驗額度。聽日再試、換網絡，或聯絡我哋。"
              : result.globalQuotaExhausted
                ? "今日全站體驗名額已滿，聽日再試。"
                : "體驗額度用唔到。聽日再試，或聯絡我哋。"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SocialSupportStrip />
          </div>
        </div>
      ) : null}

      {hasSuccessResult && result ? (
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 space-y-2">
              <p className="text-sm text-foreground-muted">
                {result.site_crawl && result.site_crawl.total_pages > 1
                  ? "已掃描同站數個頁面。"
                  : "已分析你貼嘅頁面。"}
              </p>
              {url.trim() ? (
                <p className="break-all rounded-lg border border-white/[0.08] bg-black/35 px-3 py-2 font-mono text-[11px] leading-snug text-foreground-muted">
                  {withHttpsScheme(url)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={resetToNewScan}
              className="crawlme-focus-ring shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
            >
              分析另一個網址
            </button>
          </div>

          <nav
            className="-mx-1 flex flex-wrap items-center gap-1 rounded-xl border border-white/[0.08] bg-black/30 px-2 py-2 text-[11px] text-foreground-muted sm:text-xs"
            aria-label="報告區塊"
          >
            <span className="px-2 text-white/45">跳到：</span>
            {unified?.composite !== null ? (
              <>
                <a
                  href="#report-scores"
                  className="crawlme-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-amber-200/90 hover:bg-white/[0.06] hover:text-amber-50"
                >
                  綜合分
                </a>
                <span className="text-white/20">·</span>
              </>
            ) : null}
            <a
              href="#report-audit"
              className="crawlme-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-amber-200/90 hover:bg-white/[0.06] hover:text-amber-50"
            >
              營銷審計
            </a>
            {(result.competitor_analysis != null ||
              (Array.isArray(result.competitor_facts) && result.competitor_facts.length > 0) ||
              result.competitor_discovery?.mode === "automatic") && (
              <>
                <span className="text-white/20">·</span>
                <a
                  href="#report-competitors"
                  className="crawlme-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-amber-200/90 hover:bg-white/[0.06] hover:text-amber-50"
                >
                  競爭對手
                </a>
              </>
            )}
            <span className="text-white/20">·</span>
            <a
              href="#report-preview"
              className="crawlme-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-amber-200/90 hover:bg-white/[0.06] hover:text-amber-50"
            >
              建議先睇
            </a>
            <span className="text-white/20">·</span>
            <a
              href="#report-full-actions"
              className="crawlme-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-amber-200/90 hover:bg-white/[0.06] hover:text-amber-50"
            >
              完整清單
            </a>
          </nav>

          <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
            <div className="flex flex-col gap-6 lg:col-span-7">
              {unified?.composite !== null ? (
                <div
                  id="report-scores"
                  className="scroll-mt-24 rounded-2xl border border-white/10 border-l-2 border-l-emerald-500/40 bg-[#0b0c10] p-6"
                >
                  <UnifiedScorePanel
                    pagespeedInsights={result.pagespeed_insights}
                    seoScan={result.seo_scan}
                  />
                </div>
              ) : null}
              <div
                id="report-audit"
                className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#0b0c10] p-6"
              >
                <h2 className="text-lg font-semibold tracking-tight text-white">營銷審計</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-foreground-subtle">
                  呢度係按頁面內容、結構、搜尋可見度同技術表現嘅逐項檢視（以今次快照為準）。
                </p>
                <div className="mt-4">
                  <SeoScanPanel
                    data={result.seo_scan}
                    hideOverallScore={unified?.composite !== null}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 lg:col-span-5">
              {result.competitor_analysis != null ||
              (Array.isArray(result.competitor_facts) && result.competitor_facts.length > 0) ||
              result.competitor_discovery?.mode === "automatic" ? (
                <div
                  id="report-competitors"
                  className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#0b0c10] p-6"
                >
                  <h2 className="text-lg font-semibold tracking-tight text-white">
                    你嘅競爭對手
                  </h2>
                  {result.competitor_discovery?.mode === "user" ? (
                    <p className="mt-2 text-xs text-foreground-subtle">用你提供嘅網址做對照。</p>
                  ) : null}
                  <CompetitorSitesRow facts={result.competitor_facts} />
                  <div className="mt-4">
                    <CompetitorAnalysisPanel data={result.competitor_analysis} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-6">
            <div
              id="report-preview"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#0b0c10] p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight text-white">建議先睇</h2>
              <PriorityFindingsPreview data={result.seo_scan} />
              {(result.preview_actions ?? []).length === 0 ? (
                <p className="mt-4 text-sm text-foreground-muted">
                  呢度暫時冇獨立預覽項目。請睇上面「營銷審計」，或展開下面「完整行動清單」。
                </p>
              ) : null}
              <ul className="mt-4 grid gap-3 text-sm text-white/75 lg:grid-cols-2 lg:gap-4">
                {(result.preview_actions ?? []).map((a, i) => {
                  const imp = typeof a.impact === "string" ? a.impact.toLowerCase() : "";
                  const impactClass =
                    imp === "high"
                      ? "bg-red-500/15 text-red-100 ring-1 ring-red-400/25"
                      : imp === "medium"
                        ? "bg-amber-400/12 text-amber-100 ring-1 ring-amber-400/20"
                        : imp === "low"
                          ? "bg-white/[0.06] text-foreground-muted ring-1 ring-white/10"
                          : "";
                  return (
                    <li
                      key={i}
                      className="rounded-xl border border-white/[0.07] bg-black/25 px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white">{a.title ?? "行動"}</span>
                        {imp ? (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${impactClass}`}
                          >
                            影響 {a.impact}
                          </span>
                        ) : null}
                      </div>
                      {a.rationale ? (
                        <p className="mt-2 text-foreground-muted leading-relaxed">{a.rationale}</p>
                      ) : null}
                      <PreviewActionImplementationSteps steps={a.steps} />
                    </li>
                  );
                })}
              </ul>
            </div>

            <div
              id="report-full-actions"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#0b0c10]"
            >
              <details className="group">
                <summary className="crawlme-focus-ring flex cursor-pointer list-none items-center justify-between gap-3 p-6 [&::-webkit-details-marker]:hidden">
                  <h2 className="text-lg font-semibold tracking-tight text-white">完整行動清單</h2>
                  <span className="shrink-0 text-xs text-foreground-muted transition group-open:text-amber-200/90">
                    <span className="group-open:hidden">展開</span>
                    <span className="hidden group-open:inline">收埋</span>
                  </span>
                </summary>
                <div className="border-t border-white/[0.08] px-6 pb-6 pt-2">
                  <FullActionsPanel data={result.full_actions} />
                </div>
              </details>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
