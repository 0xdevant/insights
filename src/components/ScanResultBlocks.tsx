"use client";

import Image from "next/image";
import { useCallback, useState, type ReactNode } from "react";
import type { PageSpeedInsightsPayload } from "@/lib/pagespeed-insights";
import type { SeoFacts } from "@/lib/seo-extract";
import { computeUnifiedScore } from "@/lib/report-score";
import { normalizeSeoScanForUi, stripDuplicateExecutiveSummary } from "@/lib/seo-scan-normalize";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const SCORE_DIMS: { key: string; label: string }[] = [
  { key: "title", label: "標題與 SERP" },
  { key: "meta", label: "Meta 與索引指令" },
  { key: "headings", label: "標題結構（H1–Hn）" },
  { key: "content", label: "內容深度與內鏈" },
  { key: "technical", label: "技術、結構化資料與安全" },
];

function priorityBadgeClass(p: string): string {
  const u = p.toUpperCase();
  if (u === "P0") return "bg-red-500/20 text-red-100 ring-1 ring-red-400/35";
  if (u === "P1") return "bg-amber-400/18 text-amber-100 ring-1 ring-amber-400/30";
  return "bg-white/[0.08] text-foreground-muted ring-1 ring-white/10";
}

function PanelFallback({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm leading-relaxed text-foreground-muted">
      {children}
    </p>
  );
}

/** Priority list in `#report-preview` when the model returns `priorityFindings`. */
export function PriorityFindingsPreview({ data }: { data: unknown }) {
  const norm = normalizeSeoScanForUi(data);
  if (!norm || norm.priorityFindings.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="text-xs font-medium tracking-wide text-white/50">優先次序（最緊要先）</p>
      <ul className="mt-3 space-y-3">
        {norm.priorityFindings.map((pf, i) => (
          <li
            key={i}
            className="rounded-lg border border-white/[0.07] bg-black/30 px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${priorityBadgeClass(pf.priority)}`}
              >
                {pf.priority.toUpperCase()}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/90">{pf.finding}</p>
            {pf.evidence ? (
              <p className="mt-1.5 text-xs leading-relaxed text-foreground-subtle">
                <span className="text-white/40">依據：</span>
                {pf.evidence}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Renders `seo_scan` payload (scope, executive summary, scores, checklist). */
export function SeoScanPanel({
  data,
  hideOverallScore,
}: {
  data: unknown;
  /** When true, omit the large ╱100 audit total (shown in {@link UnifiedScorePanel}). */
  hideOverallScore?: boolean;
}) {
  const norm = normalizeSeoScanForUi(data);
  if (!norm) {
    return (
      <PanelFallback>呢部分暫時顯示唔到。請重試分析。</PanelFallback>
    );
  }

  const overall = norm.overallScore;
  const summary = norm.summary;
  const detailAnalysis =
    norm.executiveSummary && summary
      ? stripDuplicateExecutiveSummary(summary, norm.executiveSummary)
      : summary;
  const bullets = norm.bullets;
  const scores = norm.scores;

  return (
    <div className="space-y-6">
      {norm.executiveSummary ? (
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-white/50">重點摘要</p>
          <p className="mt-2 text-base font-medium leading-relaxed text-white/95">{norm.executiveSummary}</p>
        </div>
      ) : null}

      {!norm.executiveSummary && summary ? (
        <div>
          <p className="text-[11px] font-semibold tracking-wide text-white/50">重點摘要</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{summary}</p>
        </div>
      ) : null}

      {!hideOverallScore && overall !== null ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums text-amber-200">{Math.round(overall)}</span>
          <span className="text-sm text-foreground-muted">
            ／100 · 報告總分
          </span>
        </div>
      ) : null}

      {scores ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {SCORE_DIMS.map(({ key, label }) => {
            const v = scores[key];
            if (typeof v !== "number") return null;
            const pct = Math.max(0, Math.min(100, Math.round(v)));
            return (
              <li key={key} className="rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-foreground-muted">{label}</span>
                  <span className="font-mono tabular-nums text-white/85">{pct}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-amber-400/80"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {norm.strengths.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-200/75">已做得唔錯</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-emerald-100/85">
            {norm.strengths.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {norm.executiveSummary && detailAnalysis ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">詳細分析</p>
          <p className="mt-2 text-sm leading-relaxed text-foreground-muted">{detailAnalysis}</p>
        </div>
      ) : null}

      {norm.verificationChecklist.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">驗證／QA 清單</p>
          <ul className="mt-2 space-y-2">
            {norm.verificationChecklist.map((line, i) => (
              <li
                key={i}
                className="flex gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-sm text-foreground-muted"
              >
                <span className="font-mono text-[11px] text-amber-200/70" aria-hidden>
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bullets.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">其他重點</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-white/80">
            {bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function impactClass(impact: string): string {
  if (impact === "high") return "bg-amber-400/20 text-amber-100";
  if (impact === "medium") return "bg-white/10 text-foreground-muted";
  return "bg-white/[0.06] text-foreground-subtle";
}

type ParsedStep = { text: string; detail?: string; snippet?: string };

function parseFullActionStep(raw: unknown): ParsedStep | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    return t ? { text: t } : null;
  }
  if (!isRecord(raw)) return null;
  const text =
    (typeof raw.text === "string" && raw.text.trim()) ||
    (typeof raw.instruction === "string" && raw.instruction.trim()) ||
    (typeof raw.step === "string" && raw.step.trim()) ||
    "";
  if (!text) return null;
  const detail =
    typeof raw.detail === "string" && raw.detail.trim()
      ? raw.detail.trim()
      : typeof raw.note === "string" && raw.note.trim()
        ? raw.note.trim()
        : undefined;
  const snippet =
    typeof raw.snippet === "string" && raw.snippet.trim() ? raw.snippet.trim() : undefined;
  return { text, detail, snippet };
}

function CopyTextButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={onCopy}
      className="crawlme-focus-ring shrink-0 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[11px] font-medium text-amber-200/95 transition hover:bg-white/10"
    >
      {copied ? "已複製 ✓" : label}
    </button>
  );
}

/**
 * Free-tier `preview_actions[].steps` — same step shape as Pro `full_actions`.
 */
export function PreviewActionImplementationSteps({ steps }: { steps: unknown }) {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const parsed = steps
    .map(parseFullActionStep)
    .filter((s): s is ParsedStep => s !== null);
  if (parsed.length === 0) return null;
  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <p className="text-[11px] font-medium text-white/45">實作步驟</p>
      <ol className="mt-2 list-none space-y-2 pl-0">
        {parsed.map((s, j) => (
          <ExpandableActionStep key={j} step={s} index={j + 1} />
        ))}
      </ol>
    </div>
  );
}

/** Pulls leading 「貼上位置：…」 / 「適用位置：…」 for prominent display (model should output per prompt). */
function splitPlacementLine(detail: string): { placement: string | null; body: string } {
  const t = detail.trim();
  if (!t) return { placement: null, body: "" };
  const lines = t.split(/\n/);
  const first = lines[0]?.trim() ?? "";
  if (/^(貼上位置|適用位置|擺放位置|放置位置)[：:]\s*.+/u.test(first)) {
    const body = lines.slice(1).join("\n").trim();
    return { placement: first, body };
  }
  return { placement: null, body: t };
}

/** True when `snippet` repeats the same pasteable block already shown in `detail` (avoid showing twice). */
function isSnippetRedundantWithDetail(detail: string | undefined, snippet: string | undefined): boolean {
  if (!snippet?.trim() || !detail?.trim()) return false;
  const s = snippet.trim();
  const { body } = splitPlacementLine(detail);
  const bodyT = body.trim();
  if (!bodyT) return false;
  const norm = (x: string) => x.replace(/\s+/g, " ").trim();
  if (bodyT === s || norm(bodyT) === norm(s)) return true;
  if (bodyT.includes(s) && s.length >= 24) return true;
  if (detail.includes(s) && s.length >= 24 && bodyT.length >= s.length * 0.85) return true;
  return false;
}

function ExpandableActionStep({ step, index }: { step: ParsedStep; index: number }) {
  const snippetDup = isSnippetRedundantWithDetail(step.detail, step.snippet);
  const snippetToShow = step.snippet && !snippetDup ? step.snippet : undefined;
  const hasExtra = Boolean(step.detail || snippetToShow);

  if (!hasExtra) {
    return (
      <li className="rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2">
        <span className="text-sm text-foreground-muted">
          <span className="mr-2 font-mono tabular-nums text-white/35">{index}.</span>
          {step.text}
        </span>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-white/[0.06] bg-black/30">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 py-2 pl-3 pr-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-left text-sm text-foreground-muted marker:content-none">
            <span className="mr-2 font-mono tabular-nums text-white/35">{index}.</span>
            {step.text}
          </span>
          <span className="shrink-0 text-[10px] text-white/40 transition-transform group-open:-rotate-180">
            ▼
          </span>
        </summary>
        <div className="space-y-3 border-t border-white/[0.06] px-3 pb-3 pt-2">
          {step.detail ? (() => {
            const { placement, body } = splitPlacementLine(step.detail);
            if (placement) {
              return (
                <>
                  <p className="rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-xs font-medium leading-relaxed text-amber-100/95">
                    {placement}
                  </p>
                  {body ? (
                    <p className="text-sm leading-relaxed text-foreground-muted">{body}</p>
                  ) : null}
                </>
              );
            }
            return (
              <p className="text-sm leading-relaxed text-foreground-muted">{step.detail}</p>
            );
          })() : null}
          {snippetToShow ? (
            <div>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-medium tracking-wide text-white/55">程式碼片段</span>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                    只係下面呢段要複製；上面係說明。
                  </p>
                </div>
                <CopyTextButton text={snippetToShow} label="複製" />
              </div>
              <pre className="max-h-[240px] overflow-auto rounded-md border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-emerald-100/95">
                {snippetToShow}
              </pre>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}

/** Renders paid `full_actions` array with structured cards. */
export function FullActionsPanel({ data }: { data: unknown }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <PanelFallback>呢部分暫時未有完整清單。請重試分析。</PanelFallback>
    );
  }

  return (
    <ul className="space-y-4">
      {data.map((item, i) => {
        if (!isRecord(item)) {
          return (
            <li key={i} className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-foreground-muted">
              無法解析此項目
            </li>
          );
        }
        const title = typeof item.title === "string" ? item.title : `行動 ${i + 1}`;
        const impact = typeof item.impact === "string" ? item.impact : "";
        const effort = typeof item.effort === "string" ? item.effort : "";
        const rawSteps = Array.isArray(item.steps) ? item.steps : [];
        const steps = rawSteps
          .map(parseFullActionStep)
          .filter((s): s is ParsedStep => s !== null);

        return (
          <li
            key={i}
            className="rounded-xl border border-white/[0.08] bg-black/25 p-4"
          >
            <p className="font-medium text-white">{title}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              {impact ? (
                <span className={`rounded-md px-2 py-0.5 ${impactClass(impact)}`}>
                  影響：{impact}
                </span>
              ) : null}
              {effort ? (
                <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-foreground-muted">
                  工作量：{effort}
                </span>
              ) : null}
            </div>
            {steps.length > 0 ? (
              <ol className="mt-3 list-none space-y-2 pl-0">
                {steps.map((s, j) => (
                  <ExpandableActionStep key={j} step={s} index={j + 1} />
                ))}
              </ol>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}

function faviconHref(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  } catch {
    return "";
  }
}

function competitorSiteLabel(f: SeoFacts): string {
  const site = f.ogSiteName?.trim();
  if (site) return site.length > 72 ? `${site.slice(0, 69)}…` : site;
  const t = f.title?.trim();
  if (t) return t.length > 72 ? `${t.slice(0, 69)}…` : t;
  return safeHostname(f.finalUrl || f.url);
}

function CompetitorFavicon({ pageUrl }: { pageUrl: string }) {
  const [err, setErr] = useState(false);
  const src = faviconHref(pageUrl);
  const initial = safeHostname(pageUrl).slice(0, 1).toUpperCase() || "?";
  if (err || !src) {
    return (
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/15 text-xs font-semibold uppercase text-amber-100 ring-1 ring-white/10"
        aria-hidden
      >
        {initial}
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt=""
      width={36}
      height={36}
      sizes="36px"
      className="h-9 w-9 shrink-0 rounded-lg bg-white/[0.06] object-contain ring-1 ring-white/10"
      loading="lazy"
      onError={() => setErr(true)}
    />
  );
}

/**
 * Lists crawled competitor pages with favicon, title (or host), and link to the live URL.
 */
export function CompetitorSitesRow({ facts }: { facts: unknown }) {
  if (!Array.isArray(facts) || facts.length === 0) return null;
  const list = facts.filter((x): x is SeoFacts => {
    if (typeof x !== "object" || x === null) return false;
    const o = x as SeoFacts;
    return typeof o.url === "string" && typeof o.finalUrl === "string";
  });
  if (list.length === 0) return null;

  return (
    <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      {list.map((f, i) => {
        const href = f.finalUrl || f.url;
        const host = safeHostname(href);
        const label = competitorSiteLabel(f);
        return (
          <li key={`${href}-${i}`} className="min-w-0 sm:max-w-[min(100%,20rem)] sm:flex-1 sm:basis-[14rem]">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 items-center gap-3 rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 transition hover:border-amber-400/35 hover:bg-black/40"
            >
              <CompetitorFavicon pageUrl={href} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium leading-snug text-white/90">{label}</span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-foreground-subtle">{host}</span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** Renders `competitor_analysis` from the model (free + paid shapes). */
export function CompetitorAnalysisPanel({ data }: { data: unknown }) {
  if (data == null) return null;
  if (!isRecord(data)) {
    return (
      <PanelFallback>呢部分暫時顯示唔到。請重試分析。</PanelFallback>
    );
  }

  const exec =
    typeof data.executive_summary === "string" ? data.executive_summary : null;
  const snap = typeof data.snapshot_summary === "string" ? data.snapshot_summary : null;
  const limitations = typeof data.limitations === "string" ? data.limitations : null;

  const topGaps = Array.isArray(data.top_gaps)
    ? data.top_gaps.filter((x): x is string => typeof x === "string")
    : [];
  const hooks = Array.isArray(data.differentiation_hooks)
    ? data.differentiation_hooks.filter((x): x is string => typeof x === "string")
    : [];
  const diffOpp = Array.isArray(data.differentiation_opportunities)
    ? data.differentiation_opportunities.filter((x): x is string => typeof x === "string")
    : [];

  const positioningMatrix = Array.isArray(data.positioning_matrix) ? data.positioning_matrix : [];
  const contentGaps = Array.isArray(data.content_gaps) ? data.content_gaps : [];
  const topicThemes = isRecord(data.inferred_topic_themes) ? data.inferred_topic_themes : null;

  const hasReadable =
    exec ||
    snap ||
    limitations ||
    topGaps.length ||
    hooks.length ||
    diffOpp.length ||
    positioningMatrix.length ||
    contentGaps.length ||
    topicThemes;

  if (!hasReadable) {
    return (
      <PanelFallback>呢部分暫時顯示唔到。請重試分析。</PanelFallback>
    );
  }

  return (
    <div className="space-y-5">
      {exec ? <p className="text-sm leading-relaxed text-foreground-muted">{exec}</p> : null}
      {snap ? <p className="text-sm leading-relaxed text-foreground-muted">{snap}</p> : null}

      {topicThemes ? (() => {
        const primaryList = (
          Array.isArray(topicThemes.primary_themes) ? topicThemes.primary_themes : []
        ).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        const competitorList = (
          Array.isArray(topicThemes.competitor_themes) ? topicThemes.competitor_themes : []
        ).filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        const hasPrimary = primaryList.length > 0;
        const hasCompetitor = competitorList.length > 0;
        if (!hasPrimary && !hasCompetitor) return null;
        const twoCol = hasPrimary && hasCompetitor;
        return (
          <div
            className={`grid gap-3 ${twoCol ? "sm:grid-cols-2" : ""}`}
          >
            {hasPrimary ? (
              <div className="rounded-lg border border-white/[0.06] bg-black/25 p-3">
                <p className="text-xs font-medium text-white/70">你嘅頁面（主題線索）</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground-muted">
                  {primaryList.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {hasCompetitor ? (
              <div className="rounded-lg border border-white/[0.06] bg-black/25 p-3">
                <p className="text-xs font-medium text-white/70">競爭對手（主題線索）</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-foreground-muted">
                  {competitorList.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : hasPrimary ? (
              <p className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-[11px] leading-relaxed text-foreground-subtle sm:col-span-2">
                對手主題線索：今次未有可顯示嘅要點——多數係對手快照字極少、擷取唔完整，或模型未輸出對手主題。
              </p>
            ) : null}
          </div>
        );
      })() : null}

      {positioningMatrix.length > 0 ? (
        <div>
          <p className="text-xs font-medium leading-snug text-white/75">
            你同對手：各自點樣定位自己
          </p>
          <ul className="mt-2 space-y-3">
            {positioningMatrix.map((row, i) => {
              if (!isRecord(row)) return null;
              return (
                <li
                  key={i}
                  className="rounded-lg border border-white/[0.06] bg-black/20 p-3 text-sm text-foreground-muted"
                >
                  {typeof row.competitor_url === "string" ? (
                    <a
                      href={row.competitor_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-black/30 p-2 transition hover:border-amber-400/30"
                    >
                      <CompetitorFavicon pageUrl={row.competitor_url} />
                      <span className="min-w-0 break-all font-mono text-[11px] leading-relaxed text-foreground-muted">
                        {row.competitor_url}
                      </span>
                    </a>
                  ) : null}
                  {typeof row.their_inferred_positioning === "string" ? (
                    <p className="mt-1">
                      <span className="text-white/50">對方：</span>
                      {row.their_inferred_positioning}
                    </p>
                  ) : null}
                  {typeof row.your_inferred_positioning === "string" ? (
                    <p className="mt-1">
                      <span className="text-white/50">你：</span>
                      {row.your_inferred_positioning}
                    </p>
                  ) : null}
                  {typeof row.strategic_takeaway === "string" ? (
                    <p className="mt-1 text-white/80">{row.strategic_takeaway}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {contentGaps.length > 0 ? (
        <div>
          <p className="text-xs font-medium leading-snug text-white/75">
            內容／頁面上可以補嘅位
          </p>
          <ul className="mt-2 space-y-3">
            {contentGaps.map((row, i) => {
              if (!isRecord(row)) return null;
              return (
                <li key={i} className="rounded-lg border border-amber-400/15 bg-amber-400/[0.06] p-3 text-sm">
                  {typeof row.gap_description === "string" ? (
                    <p className="font-medium text-amber-100/95">{row.gap_description}</p>
                  ) : null}
                  {typeof row.what_competitor_does === "string" ? (
                    <p className="mt-1 text-foreground-muted">{row.what_competitor_does}</p>
                  ) : null}
                  {typeof row.what_you_should_do === "string" ? (
                    <p className="mt-2 text-white/80">{row.what_you_should_do}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {topGaps.length > 0 ? (
        <div>
          <p className="text-xs font-medium leading-snug text-white/75">
            比起對手，你仲可以加強嘅地方
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground-muted">
            {topGaps.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {(hooks.length > 0 || diffOpp.length > 0) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {hooks.length > 0 ? (
            <div className="flex-1">
              <p className="text-xs font-medium leading-snug text-white/75">
                點樣突出自己、同對手唔同
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground-muted">
                {hooks.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {diffOpp.length > 0 ? (
            <div className="flex-1">
              <p className="text-xs font-medium leading-snug text-white/75">可以點樣做得更唔同</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground-muted">
                {diffOpp.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {limitations ? (
        <p className="text-xs text-foreground-subtle">{limitations}</p>
      ) : null}
    </div>
  );
}

const PSI_CATS: {
  key: "performance" | "accessibility" | "bestPractices" | "seo";
  labelEn: string;
  labelZh: string;
}[] = [
  { key: "performance", labelEn: "Performance", labelZh: "效能" },
  { key: "accessibility", labelEn: "Accessibility", labelZh: "無障礙" },
  { key: "bestPractices", labelEn: "Best Practices", labelZh: "最佳實踐" },
  { key: "seo", labelEn: "SEO", labelZh: "搜尋（Lab）" },
];

function psiBarClass(score: number): string {
  if (score >= 90) return "bg-emerald-400/85";
  if (score >= 50) return "bg-amber-400/80";
  return "bg-red-400/75";
}

/**
 * Single headline score: average of Google lab category average and on-page audit overall.
 * PSI breakdown lives in &lt;details&gt;.
 */
export function UnifiedScorePanel({
  pagespeedInsights,
  seoScan,
}: {
  pagespeedInsights: unknown;
  seoScan: unknown;
}) {
  const { composite, psiAvg, aiOverall } = computeUnifiedScore(pagespeedInsights, seoScan);
  if (composite === null) return null;

  const payload = pagespeedInsights as PageSpeedInsightsPayload | null;
  const err = payload?.error;
  const scores = payload?.scores ?? null;
  const analyzed = typeof payload?.analyzedUrl === "string" ? payload.analyzedUrl : "";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-white">綜合分</h2>
        <div className="mt-4 flex flex-wrap items-baseline gap-3">
          <span className="text-4xl font-semibold tabular-nums text-emerald-200">{composite}</span>
          <span className="text-sm text-foreground-muted">／100</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-foreground-subtle">
          {psiAvg !== null && aiOverall !== null ? (
            <>
              上面大數字＝（Google 四項 Lab 平均{" "}
              <span className="tabular-nums text-white/80">{psiAvg}</span>
              {" + AI 報告評分 "}
              <span className="tabular-nums text-white/80">{aiOverall}</span>
              ）÷ 2。AI 一邊優先用報告總分；若模型冇填總分，會用五維（標題／Meta／結構／內容／技術）平均分。
            </>
          ) : psiAvg !== null ? (
            <>
              上面大數字＝ Google PageSpeed 四項（效能、無障礙、最佳實踐、搜尋 Lab）嘅算術平均。AI
              報告冇可用數字（冇總分又冇五維分項），所以未能同 AI 拉平均。
            </>
          ) : (
            <>
              僅 AI 報告總分 <span className="tabular-nums text-white/80">{aiOverall}</span>
              （未有 Google Lab 分項）。
            </>
          )}
        </p>
      </div>

      {payload && (scores || err || analyzed) ? (
        <details className="group rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-medium text-foreground-muted [&::-webkit-details-marker]:hidden">
            <span className="inline group-open:hidden">展開睇 Google PageSpeed 分項</span>
            <span className="hidden group-open:inline">收埋 Google PageSpeed 分項</span>
          </summary>
          <div className="mt-3 space-y-3 border-t border-white/[0.06] pt-3">
            {analyzed ? (
              <p className="break-all font-mono text-[11px] text-foreground-muted">{analyzed}</p>
            ) : null}
            {err ? (
              <p className="rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                Google 測試：{err}
              </p>
            ) : null}
            {scores && !err ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {PSI_CATS.map(({ key, labelEn, labelZh }) => {
                  const v = scores[key];
                  const n = typeof v === "number" ? v : null;
                  const pct = n !== null ? Math.max(0, Math.min(100, n)) : 0;
                  return (
                    <li key={key} className="rounded-lg border border-white/[0.06] bg-black/25 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-foreground-muted">
                          {labelEn}
                          <span className="ml-1.5 text-[10px] text-white/35">{labelZh}</span>
                        </span>
                        <span className="font-mono tabular-nums text-white/90">
                          {n !== null ? n : "—"}
                        </span>
                      </div>
                      {n !== null ? (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${psiBarClass(n)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <p className="text-[11px] leading-relaxed text-foreground-subtle">
              Google 分項係實驗室估算（{payload.strategy === "mobile" ? "手機" : "桌面"}）。
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
