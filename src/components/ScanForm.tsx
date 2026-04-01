"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { PreviewActionImplementationSteps } from "@/components/ScanResultBlocks";
import { computeUnifiedScore } from "@/lib/report-score";
import {
  buildScanReportMarkdown,
  downloadMarkdownReport,
} from "@/lib/export-report-markdown";
import { INSIGHTS_NAVIGATE_HOME_EVENT } from "@/lib/header-events";
import {
  INSTAGRAM_PROFILE_URL,
  THREADS_PROFILE_URL,
  THREADS_UNLOCK_POST_URL,
} from "@/lib/threads-constants";

/** Lazy: only loads after a successful scan (smaller initial / home chunk). */
const SeoScanPanel = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({
      default: m.SeoScanPanel,
    })),
  { loading: () => <PanelChunkSkeleton /> },
);
const CompetitorAnalysisPanel = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({
      default: m.CompetitorAnalysisPanel,
    })),
  { loading: () => <PanelChunkSkeleton /> },
);
const FullActionsPanel = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({
      default: m.FullActionsPanel,
    })),
  { loading: () => <PanelChunkSkeleton /> },
);
const UnifiedScorePanel = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({
      default: m.UnifiedScorePanel,
    })),
  { loading: () => <PanelChunkSkeleton /> },
);
const CompetitorSitesRow = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({
      default: m.CompetitorSitesRow,
    })),
  {
    loading: () => (
      <div
        className="mt-4 h-12 animate-pulse rounded-xl bg-surface-container-high"
        aria-hidden
      />
    ),
  },
);
/** Code-split marketing section (icons + bento) from main ScanForm bundle. */
const ReportDepthSection = dynamic(
  () =>
    import("@/components/ReportDepthSection").then((m) => ({
      default: m.ReportDepthSection,
    })),
  {
    loading: () => (
      <div
        className="min-h-[28rem] w-full animate-pulse rounded-2xl bg-surface-container-low/35"
        aria-hidden
      />
    ),
  },
);

const Turnstile = dynamic(
  () => import("@marsidev/react-turnstile").then((m) => m.Turnstile),
  { ssr: false },
);
const PriorityFindingsPreview = dynamic(
  () =>
    import("@/components/ScanResultBlocks").then((m) => ({
      default: m.PriorityFindingsPreview,
    })),
  { loading: () => <PanelChunkSkeleton /> },
);

function PanelChunkSkeleton() {
  return (
    <div
      className="h-20 animate-pulse rounded-lg bg-surface-container-high"
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
    "insights-focus-ring inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-center font-medium transition box-border";
  const cls = `${base} border-primary/25 bg-surface-container-lowest px-3 py-2 text-xs text-primary hover:bg-surface-container-high`;
  const followInner = `${base} border-primary/20 bg-surface-container-low px-2.5 py-1.5 text-xs text-primary hover:bg-surface-container-high`;

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
      <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-primary/25 bg-surface-container-lowest px-2 py-1.5">
        <span className="shrink-0 pl-0.5 text-[11px] text-primary/80">
          追蹤
        </span>
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

type ScanResponse = {
  error?: string;
  /** Server asks client to reset Turnstile (e.g. timeout-or-duplicate). */
  turnstileRetry?: boolean;
  signInRequired?: boolean;
  upgrade?: boolean;
  ipFreeExhausted?: boolean;
  userFreeExhausted?: boolean;
  deviceFreeExhausted?: boolean;
  globalQuotaExhausted?: boolean;
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

const INSIGHTS_DEVICE_LOCAL_KEY = "insights_device_id";

const SESSION_SCAN_PREFIX = "insights_last_scan:v1";

function sessionScanStorageKey(userId: string): string {
  return `${SESSION_SCAN_PREFIX}:${userId}`;
}

/** Last successful scan in this tab — survives refresh; cleared when tab closes or user starts a new scan. */
function persistLastScanSession(
  userId: string,
  scannedUrl: string,
  data: ScanResponse,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      sessionScanStorageKey(userId),
      JSON.stringify({
        v: 1,
        url: scannedUrl,
        result: data,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Quota, private mode, or payload too large for sessionStorage
  }
}

function loadLastScanSession(
  userId: string,
): { url: string; result: ScanResponse } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(sessionScanStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: number;
      url?: string;
      result?: ScanResponse;
    };
    if (
      parsed.v !== 1 ||
      typeof parsed.url !== "string" ||
      !parsed.result ||
      typeof parsed.result !== "object"
    ) {
      return null;
    }
    if (parsed.result.upgrade || parsed.result.error) return null;
    return { url: parsed.url, result: parsed.result };
  } catch {
    return null;
  }
}

/** Stable per-browser profile id (survives VPN IP changes; cleared if user wipes site data). */
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(INSIGHTS_DEVICE_LOCAL_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(INSIGHTS_DEVICE_LOCAL_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Shown while /api/scan runs — informational only (no fake step-by-step progress). */
const SCAN_LOADING_STEPS = [
  {
    title: "讀取你嘅頁面",
    detail: "下載公開內容；同步會用 Google PageSpeed 拎實驗室分數（手機）。",
  },
  {
    title: "揀競爭對手",
    detail: "搜尋候選網址，再留低真正其他品牌嘅官網做對照。",
  },
  {
    title: "寫報告",
    detail: "整理營銷摘要、優先次序同具體建議。",
  },
] as const;

export function ScanForm() {
  const { userId, isSignedIn, isLoaded } = useAuth();
  const { openSignIn } = useClerk();
  const [url, setUrl] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [quotaBypass, setQuotaBypass] = useState(false);
  const [ipAlreadyUsedFree, setIpAlreadyUsedFree] = useState(false);
  const [userAlreadyUsedFree, setUserAlreadyUsedFree] = useState(false);
  const [deviceAlreadyUsedFree, setDeviceAlreadyUsedFree] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [freeGlobalRemaining, setFreeGlobalRemaining] = useState<number | null>(
    null,
  );
  const [freeGlobalLimit, setFreeGlobalLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  /** True after「分析另一個網址」— show hero form while last report stays below. */
  const [preparingNewScan, setPreparingNewScan] = useState(false);
  /** True after header logo click on `/` — show marketing home without the full report; use「返回報告」to restore. */
  const [homeFocusMode, setHomeFocusMode] = useState(false);
  const unified = useMemo(
    () =>
      result
        ? computeUnifiedScore(result.pagespeed_insights, result.seo_scan)
        : null,
    [result],
  );
  /** Report header URL when input was cleared for a new scan. */
  const analyzedUrlForReport = useMemo(() => {
    if (!result?.facts || typeof result.facts !== "object") return null;
    const f = result.facts as { finalUrl?: string; url?: string };
    const a = typeof f.finalUrl === "string" ? f.finalUrl.trim() : "";
    if (a) return a;
    const b = typeof f.url === "string" ? f.url.trim() : "";
    return b || null;
  }, [result]);
  const [error, setError] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  /** After user clicks submit, run scan once Turnstile returns a token (execute-on-demand). */
  const pendingSubmitAfterTurnstileRef = useRef(false);

  const refreshMe = useCallback(() => {
    const qs =
      deviceId && deviceId.length > 0
        ? `?deviceId=${encodeURIComponent(deviceId)}`
        : "";
    return fetch(`/api/me${qs}`)
      .then((r) => r.json())
      .then(
        (d: {
          quotaBypass?: boolean;
          ipAlreadyUsedFree?: boolean;
          userAlreadyUsedFree?: boolean;
          deviceAlreadyUsedFree?: boolean;
          freeGlobalRemaining?: number;
          freeGlobalLimit?: number;
        }) => {
          setQuotaBypass(!!d.quotaBypass);
          setIpAlreadyUsedFree(!!d.ipAlreadyUsedFree);
          setUserAlreadyUsedFree(!!d.userAlreadyUsedFree);
          setDeviceAlreadyUsedFree(!!d.deviceAlreadyUsedFree);
          setFreeGlobalRemaining(
            typeof d.freeGlobalRemaining === "number"
              ? d.freeGlobalRemaining
              : null,
          );
          setFreeGlobalLimit(
            typeof d.freeGlobalLimit === "number" ? d.freeGlobalLimit : null,
          );
        },
      )
      .catch(() => {
        setQuotaBypass(false);
        setIpAlreadyUsedFree(false);
        setUserAlreadyUsedFree(false);
        setDeviceAlreadyUsedFree(false);
        setFreeGlobalRemaining(null);
        setFreeGlobalLimit(null);
      });
  }, [deviceId]);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  /** Restore last successful report after refresh (same browser tab + signed-in user). */
  useLayoutEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    const restored = loadLastScanSession(userId);
    if (!restored) return;
    setResult(restored.result);
    setUrl(restored.url);
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const onNavigateHome = () => setHomeFocusMode(true);
    window.addEventListener(INSIGHTS_NAVIGATE_HOME_EVENT, onNavigateHome);
    return () =>
      window.removeEventListener(INSIGHTS_NAVIGATE_HOME_EVENT, onNavigateHome);
  }, []);

  const needsTurnstile = Boolean(turnstileSiteKey);
  const isDev = process.env.NODE_ENV === "development";

  const hasGlobalQuota =
    freeGlobalRemaining !== null && freeGlobalLimit !== null;
  /** 全站名額：有數據就顯示（包括未登入）。個人額度狀態：僅登入後。 */
  const showQuotaInfobox =
    hasGlobalQuota ||
    (isSignedIn &&
      !quotaBypass &&
      (userAlreadyUsedFree || deviceAlreadyUsedFree || ipAlreadyUsedFree));

  const experienceBlocked =
    !quotaBypass &&
    (ipAlreadyUsedFree || userAlreadyUsedFree || deviceAlreadyUsedFree);

  const canSubmit = useMemo(() => {
    if (!url.trim()) return false;
    if (!isLoaded) return false;
    if (!isSignedIn) return true;
    if (experienceBlocked) return false;
    return true;
  }, [isLoaded, isSignedIn, experienceBlocked, url]);

  const runScan = useCallback(
    async (opts?: { turnstileTokenOverride?: string | null }) => {
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

      const effectiveTurnstileToken =
        opts?.turnstileTokenOverride ?? turnstileToken;
      if (needsTurnstile && !effectiveTurnstileToken) {
        setError("需要人機驗證。");
        return;
      }

      setLoading(true);
      try {
        const body: {
          url: string;
          turnstileToken?: string;
          deviceId?: string;
        } = {
          url: withHttpsScheme(url),
        };
        if (needsTurnstile && effectiveTurnstileToken)
          body.turnstileToken = effectiveTurnstileToken;
        if (deviceId) body.deviceId = deviceId;

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
            setPreparingNewScan(false);
            setResult(data);
            void refreshMe();
            return;
          }
          if (res.status === 400 && data.turnstileRetry && needsTurnstile) {
            setTurnstileToken(null);
            setTurnstileError(null);
            turnstileRef.current?.reset();
            setError(
              data.error ??
                "人機驗證已過期或已用過，請再撳「開始分析」取得新驗證。",
            );
            return;
          }
          setError(data.error ?? `請求失敗（${res.status}）`);
          return;
        }
        setResult(data);
        setHomeFocusMode(false);
        setPreparingNewScan(false);
        if (userId) {
          persistLastScanSession(userId, withHttpsScheme(url), data);
        }
        if (typeof data.freeGlobalRemaining === "number") {
          setFreeGlobalRemaining(data.freeGlobalRemaining);
        }
        if (typeof data.freeGlobalLimit === "number") {
          setFreeGlobalLimit(data.freeGlobalLimit);
        }
        if (needsTurnstile) {
          setTurnstileToken(null);
          turnstileRef.current?.reset();
        }
        void refreshMe();
      } catch (e) {
        setError(e instanceof Error ? e.message : "網絡錯誤");
      } finally {
        setLoading(false);
      }
    },
    [
      deviceId,
      isLoaded,
      isSignedIn,
      needsTurnstile,
      openSignIn,
      refreshMe,
      turnstileToken,
      url,
      userId,
    ],
  );

  const handleFormSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;
      if (!url.trim()) {
        setError("請先輸入要分析嘅網址。");
        return;
      }
      if (!isLoaded) return;
      if (!isSignedIn) {
        openSignIn({});
        return;
      }
      if (experienceBlocked) return;
      if (needsTurnstile && !turnstileToken) {
        pendingSubmitAfterTurnstileRef.current = true;
        turnstileRef.current?.execute();
        return;
      }
      void runScan();
    },
    [
      loading,
      url,
      isLoaded,
      isSignedIn,
      experienceBlocked,
      needsTurnstile,
      turnstileToken,
      openSignIn,
      runScan,
    ],
  );

  const hasSuccessResult = Boolean(result && !result.error && !result.upgrade);
  /** First visit,「分析另一個網址」, or header logo「home」— show URL form; hide full report when `homeFocusMode`. */
  const showMarketingHero =
    (!loading && !hasSuccessResult) ||
    (preparingNewScan && !loading) ||
    (homeFocusMode && hasSuccessResult && !loading);

  const resetToNewScan = useCallback(() => {
    setHomeFocusMode(false);
    setPreparingNewScan(true);
    setError(null);
    setTurnstileToken(null);
    pendingSubmitAfterTurnstileRef.current = false;
    turnstileRef.current?.reset();
    setUrl("");
    queueMicrotask(() => {
      document
        .getElementById("scan-hero-anchor")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const exportReportAsMarkdown = useCallback(() => {
    if (!result) return;
    const analyzed =
      analyzedUrlForReport ?? (url.trim() ? withHttpsScheme(url) : "");
    if (!analyzed) return;
    const md = buildScanReportMarkdown(result, { analyzedUrl: analyzed });
    downloadMarkdownReport(md, analyzed);
  }, [analyzedUrlForReport, result, url]);

  return (
    <div className="flex min-w-0 flex-col gap-10">
      {showMarketingHero ? (
        <>
          <section
            id="scan-hero-anchor"
            className="rounded-[1.75rem] bg-secondary-container px-5 py-10 shadow-ambient sm:px-10 sm:py-12"
            aria-labelledby="hero-heading"
          >
            <div className="mx-auto max-w-3xl text-center">
              {preparingNewScan && hasSuccessResult && !homeFocusMode ? (
                <header className="space-y-2">
                  <h2
                    id="hero-heading"
                    className="font-headline text-xl font-semibold tracking-tight text-on-surface sm:text-2xl"
                  >
                    新增分析
                  </h2>
                  <p className="mx-auto max-w-lg text-pretty text-xs leading-relaxed text-foreground-muted sm:text-sm">
                    上次報告仍會喺下面；新分析完成後會取代。你可以繼續向下瀏覽。
                  </p>
                </header>
              ) : (
                <header className="space-y-4">
                  <h1
                    id="hero-heading"
                    className="font-headline text-balance text-3xl font-bold tracking-tight text-on-surface sm:text-4xl md:text-5xl"
                  >
                    免費分析你的網站表現
                  </h1>
                  <p className="mx-auto max-w-xl text-pretty text-base leading-relaxed text-foreground-muted sm:text-lg">
                    SEO、市場、競爭對手同 AI 分析，加上可以落手做嘅技術建議。
                  </p>
                </header>
              )}

              {!isLoaded ? (
                <div className="mx-auto mt-8 max-w-2xl">
                  <div
                    className="h-[52px] animate-pulse rounded-full bg-surface-container-high"
                    aria-hidden
                  />
                  <p className="sr-only">載入帳戶狀態…</p>
                </div>
              ) : (
                <>
                  <form
                    className="mx-auto mt-8 flex max-w-2xl flex-col gap-4 text-center"
                    onSubmit={handleFormSubmit}
                  >
                    <label className="sr-only" htmlFor="url">
                      要分析嘅頁面網址
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center">
                      <input
                        id="url"
                        name="url"
                        type="text"
                        inputMode="url"
                        autoComplete="url"
                        spellCheck={false}
                        placeholder="輸入網址，例如 example.com"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="min-h-[52px] w-full min-w-0 flex-1 rounded-full border border-primary/20 bg-surface-container-lowest px-6 py-3.5 text-center text-base text-on-surface shadow-sm outline-none ring-0 placeholder:text-foreground-subtle focus:border-primary/35 focus:ring-2 focus:ring-primary/15 sm:text-left"
                      />
                      <button
                        type="submit"
                        disabled={!canSubmit || loading}
                        className="insights-focus-ring min-h-[52px] shrink-0 rounded-full bg-gradient-to-b from-primary to-primary-container px-8 py-3.5 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        開始分析
                      </button>
                    </div>
                    {needsTurnstile && isSignedIn ? (
                      <div className="space-y-2 pt-2">
                        {turnstileError ? (
                          <p className="text-xs text-red-600/95" role="alert">
                            {turnstileError}
                          </p>
                        ) : null}
                        <div className="mx-auto min-h-0 w-fit max-w-full [&_iframe]:rounded-md">
                          <Turnstile
                            ref={turnstileRef}
                            siteKey={turnstileSiteKey as string}
                            options={{
                              theme: "light",
                              appearance: "execute",
                              execution: "execute",
                            }}
                            onSuccess={(token) => {
                              setTurnstileError(null);
                              setTurnstileToken(token);
                              if (pendingSubmitAfterTurnstileRef.current) {
                                pendingSubmitAfterTurnstileRef.current = false;
                                void runScan({ turnstileTokenOverride: token });
                              }
                            }}
                            onExpire={() => {
                              setTurnstileToken(null);
                              pendingSubmitAfterTurnstileRef.current = false;
                            }}
                            onError={() => {
                              pendingSubmitAfterTurnstileRef.current = false;
                              setTurnstileError(
                                "驗證載入唔到。試重新整理頁面，或者暫停擋廣告／私隱外掛，同埋允許 challenges.cloudflare.com。",
                              );
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                    {showQuotaInfobox ? (
                      <div className="mt-8 space-y-3 rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-3 py-3 text-left text-xs text-foreground-muted shadow-sm">
                        {isSignedIn && !quotaBypass && userAlreadyUsedFree ? (
                          <p className="text-primary">
                            此帳戶已用過體驗額度。聯絡我哋。
                          </p>
                        ) : null}
                        {isSignedIn &&
                        !quotaBypass &&
                        !userAlreadyUsedFree &&
                        deviceAlreadyUsedFree ? (
                          <p className="text-primary">
                            呢部瀏覽器／裝置已用過體驗額度。清除本站資料或換另一個瀏覽器檔案仍可能受其他限制。
                          </p>
                        ) : null}
                        {isSignedIn &&
                        !quotaBypass &&
                        !userAlreadyUsedFree &&
                        !deviceAlreadyUsedFree &&
                        ipAlreadyUsedFree ? (
                          <p className="text-primary">
                            呢個 IP
                            已用過體驗額度。聽日再試、換網絡，或聯絡我哋。
                          </p>
                        ) : null}
                        {hasGlobalQuota ? (
                          <div className="border-l-2 border-primary/35 pl-3">
                            <p className="font-medium text-primary">額度說明</p>
                            <p className="mt-1 text-foreground-subtle">
                              每個帳戶一次體驗；全站今日尚餘{" "}
                              <span className="font-semibold tabular-nums text-primary">
                                {freeGlobalRemaining}
                              </span>
                              ／{freeGlobalLimit} 個名額（先到先得）。
                            </p>
                            {quotaBypass ? (
                              <p className="mt-2 text-[10px] leading-snug text-on-surface-variant">
                                {isDev
                                  ? "開發模式：本機已略過額度限制，仍可照常分析。"
                                  : "你的連線已略過體驗額度限制；以上為全站今日名額參考。"}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </form>
                  {homeFocusMode && hasSuccessResult ? (
                    <div className="mx-auto mt-6 flex max-w-2xl justify-center">
                      <button
                        type="button"
                        className="insights-focus-ring flex min-h-[44px] w-full max-w-sm items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-95 sm:w-auto sm:max-w-none sm:min-w-[7.5rem]"
                        onClick={() => {
                          setHomeFocusMode(false);
                          queueMicrotask(() => {
                            document
                              .getElementById("scan-report-anchor")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                          });
                        }}
                      >
                        返回報告
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
          {!hasSuccessResult || homeFocusMode ? <ReportDepthSection /> : null}
        </>
      ) : null}

      {loading ? (
        <section
          className="rounded-2xl border border-outline-variant/20 bg-surface-container-low p-8 text-center sm:p-10"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-sm font-medium text-on-surface">分析緊…</p>
          <p className="mt-2 text-xs text-foreground-muted">
            唔使關閉呢頁。一般{" "}
            <span className="text-foreground-muted/95">約 30 秒至幾分鐘</span>
            ，視乎頁面大小、有無對手搜尋同網絡。
          </p>
          <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-xs">
            {SCAN_LOADING_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex gap-3 rounded-xl border border-outline-variant/12 bg-surface-container-lowest px-3 py-2.5 text-foreground-muted"
              >
                <span className="shrink-0 pt-0.5 font-mono text-[11px] tabular-nums text-on-surface-variant">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-on-surface">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block leading-relaxed text-foreground-subtle">
                    {step.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div
            className="mx-auto mt-6 h-2 max-w-md overflow-hidden rounded-full bg-surface-container-high"
            aria-hidden
          >
            <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-primary/35 via-primary-container/50 to-primary/40 insights-progress-indeterminate" />
          </div>
        </section>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border border-error/30 bg-error-container/50 px-4 py-3 text-sm text-error"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          {error}
        </div>
      ) : null}

      {result?.upgrade ? (
        <div
          className="rounded-xl border border-primary/25 bg-secondary-container/50 px-4 py-4 text-sm text-on-surface"
          role="status"
          aria-live="polite"
        >
          <p>
            {result.userFreeExhausted
              ? "此帳戶已用過體驗額度。聯絡我哋。"
              : result.deviceFreeExhausted
                ? "呢部瀏覽器／裝置已用過體驗額度。聯絡我哋。"
                : result.ipFreeExhausted
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

      {hasSuccessResult && result && !homeFocusMode ? (
        <section
          id="scan-report-anchor"
          className="flex w-full min-w-0 max-w-full flex-col gap-6 overflow-x-clip scroll-mt-28"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1 space-y-2">
              <h2 className="font-headline text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">
                分析結果
              </h2>
              <p className="text-sm text-foreground-muted">
                {result.site_crawl && result.site_crawl.total_pages > 1
                  ? "已掃描同站數個頁面。"
                  : "已分析你貼嘅頁面。"}
              </p>
              {(analyzedUrlForReport ?? url.trim()) &&
              unified?.composite === null ? (
                <p className="break-all rounded-lg border border-outline-variant/15 bg-surface-container-low px-3 py-2 font-mono text-[11px] leading-snug text-foreground-muted">
                  {analyzedUrlForReport ?? withHttpsScheme(url)}
                </p>
              ) : null}
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={exportReportAsMarkdown}
                className="insights-focus-ring flex min-h-[44px] w-full items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-4 py-2.5 text-sm font-medium text-primary transition hover:bg-surface-container-high sm:w-auto"
              >
                匯出 Markdown（.md）
              </button>
              <button
                type="button"
                onClick={resetToNewScan}
                className="insights-focus-ring flex min-h-[44px] w-full items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-2.5 text-sm font-medium text-on-surface transition hover:bg-surface-container-high sm:w-auto"
              >
                分析另一個網址
              </button>
            </div>
          </div>

          <p
            className="border-t border-outline-variant/10 pt-3 text-[11px] leading-snug text-on-surface-variant sm:text-xs"
            role="note"
          >
            報告只暫存於此瀏覽器；換裝置或清資料可能會無咗。需要長期保留可撳上面「匯出
            Markdown」下載 .md。
          </p>

          <nav
            className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-outline-variant/15 bg-surface-container-low px-2 py-2 text-[11px] text-foreground-muted sm:text-xs"
            aria-label="報告區塊"
          >
            <span className="shrink-0 text-on-surface-variant">跳到：</span>
            {unified?.composite !== null ? (
              <a
                href="#report-scores"
                className="insights-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-primary hover:bg-surface-container-high hover:text-on-surface"
              >
                總分
              </a>
            ) : null}
            <a
              href="#report-audit"
              className="insights-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-primary hover:bg-surface-container-high hover:text-on-surface"
            >
              營銷審計
            </a>
            {(result.competitor_analysis != null ||
              (Array.isArray(result.competitor_facts) &&
                result.competitor_facts.length > 0) ||
              result.competitor_discovery?.mode === "automatic") && (
              <a
                href="#report-competitors"
                className="insights-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-primary hover:bg-surface-container-high hover:text-on-surface"
              >
                競爭對手
              </a>
            )}
            <a
              href="#report-preview"
              className="insights-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-primary hover:bg-surface-container-high hover:text-on-surface"
            >
              建議先睇
            </a>
            <a
              href="#report-full-actions"
              className="insights-focus-ring inline-flex min-h-[44px] items-center rounded-lg px-2 py-1 text-primary hover:bg-surface-container-high hover:text-on-surface"
            >
              完整清單
            </a>
          </nav>

          <div className="grid min-w-0 gap-6 lg:grid-cols-12 lg:items-start">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
              {unified?.composite !== null ? (
                <div
                  id="report-scores"
                  className="scroll-mt-24 rounded-2xl border border-outline-variant/20 border-l-2 border-l-tertiary/50 bg-surface-container-low p-4 sm:p-6"
                >
                  <UnifiedScorePanel
                    pagespeedInsights={result.pagespeed_insights}
                    seoScan={result.seo_scan}
                    primaryFacts={result.facts}
                    analyzedUrlFallback={
                      analyzedUrlForReport ??
                      (url.trim() ? withHttpsScheme(url) : "")
                    }
                  />
                </div>
              ) : null}
              <div
                id="report-audit"
                className="scroll-mt-24 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 sm:p-6"
              >
                <h2 className="text-lg font-semibold tracking-tight text-on-surface">
                  營銷審計
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-foreground-subtle">
                  按今次抓到嘅頁面內容，檢視內容、結構、搜尋可見度同技術表現（只反映呢次快照）。
                </p>
                <div className="mt-4">
                  <SeoScanPanel
                    data={result.seo_scan}
                    hideOverallScore={unified?.composite !== null}
                  />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
              {result.competitor_analysis != null ||
              (Array.isArray(result.competitor_facts) &&
                result.competitor_facts.length > 0) ||
              result.competitor_discovery?.mode === "automatic" ? (
                <div
                  id="report-competitors"
                  className="scroll-mt-24 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-6"
                >
                  <h2 className="text-lg font-semibold tracking-tight text-on-surface">
                    你嘅競爭對手
                  </h2>
                  {result.competitor_discovery?.mode === "user" ? (
                    <p className="mt-2 text-xs text-foreground-subtle">
                      用你提供嘅網址做對照。
                    </p>
                  ) : null}
                  <CompetitorSitesRow facts={result.competitor_facts} />
                  <div className="mt-4">
                    <CompetitorAnalysisPanel
                      data={result.competitor_analysis}
                      competitorFacts={result.competitor_facts}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex min-w-0 flex-col gap-6">
            <div
              id="report-preview"
              className="scroll-mt-24 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 sm:p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight text-on-surface">
                建議先睇
              </h2>
              <PriorityFindingsPreview data={result.seo_scan} />
              {(result.preview_actions ?? []).length === 0 ? (
                <p className="mt-4 text-sm text-foreground-muted">
                  呢度暫時冇獨立預覽項目。請睇上面「營銷審計」，或展開下面「完整行動清單」。
                </p>
              ) : null}
              <ul className="mt-4 grid gap-3 text-sm text-on-surface lg:grid-cols-2 lg:gap-4">
                {(result.preview_actions ?? []).map((a, i) => {
                  const imp =
                    typeof a.impact === "string" ? a.impact.toLowerCase() : "";
                  const impactClass =
                    imp === "high"
                      ? "bg-red-500/15 text-error ring-1 ring-red-400/25"
                      : imp === "medium"
                        ? "bg-secondary-container/80 text-primary ring-1 ring-primary/25"
                        : imp === "low"
                          ? "bg-surface-container-high text-foreground-muted ring-1 ring-outline-variant/25"
                          : "";
                  return (
                    <li
                      key={i}
                      className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest px-4 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-on-surface">
                          {a.title ?? "行動"}
                        </span>
                        {imp ? (
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${impactClass}`}
                          >
                            影響 {a.impact}
                          </span>
                        ) : null}
                      </div>
                      {a.rationale ? (
                        <p className="mt-2 text-foreground-muted leading-relaxed">
                          {a.rationale}
                        </p>
                      ) : null}
                      <PreviewActionImplementationSteps steps={a.steps} />
                    </li>
                  );
                })}
              </ul>
            </div>

            <div
              id="report-full-actions"
              className="scroll-mt-24 rounded-2xl border border-outline-variant/20 bg-surface-container-low"
            >
              <details className="group">
                <summary className="insights-focus-ring flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-6 [&::-webkit-details-marker]:hidden">
                  <h2 className="text-lg font-semibold tracking-tight text-on-surface">
                    完整行動清單
                  </h2>
                  <span className="shrink-0 text-xs text-foreground-muted transition group-open:text-primary">
                    <span className="group-open:hidden">展開</span>
                    <span className="hidden group-open:inline">收埋</span>
                  </span>
                </summary>
                <div className="border-t border-outline-variant/15 px-4 pb-4 pt-2 sm:px-6 sm:pb-6">
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
