/**
 * Normalizes model `seo_scan` blobs so the UI can render even when the model
 * uses snake_case, string numbers, or slightly different shapes.
 */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : String(x)))
      .filter(Boolean);
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

const SCORE_KEYS = ["title", "meta", "headings", "content", "technical"] as const;

/**
 * `summary` often repeats the full `executiveSummary` then adds detail — UI should show only the additive part under 詳細分析.
 */
export function stripDuplicateExecutiveSummary(
  summary: string | null,
  executive: string | null,
): string | null {
  if (!summary?.trim()) return null;
  const s = summary.trim();
  if (!executive?.trim()) return s;
  const e = executive.trim();
  const norm = (x: string) => x.replace(/\s+/g, " ").trim();
  const ns = norm(s);
  const ne = norm(e);
  if (ns === ne) return null;
  if (ns.startsWith(ne)) {
    const rest = ns.slice(ne.length).trim().replace(/^[\s,.;，。、]+/u, "");
    return rest.length > 0 ? rest : null;
  }
  return s;
}

/** Pick nested `seo_scan` or treat record as the scan object if it looks like one. */
function unwrapSeoScan(input: unknown): Record<string, unknown> | null {
  if (input == null) return null;
  if (typeof input === "string") {
    try {
      const p = JSON.parse(input) as unknown;
      return isRecord(p) ? p : null;
    } catch {
      return null;
    }
  }
  if (!isRecord(input)) return null;

  const nested =
    input.seo_scan ?? input.seoScan ?? input.SEO_SCAN ?? input.audit ?? input.seoAudit;
  if (isRecord(nested)) return nested;

  if (
    "overallScore" in input ||
    "overall_score" in input ||
    "scores" in input ||
    "summary" in input ||
    "bullets" in input ||
    "executiveSummary" in input ||
    "executive_summary" in input
  ) {
    return input;
  }
  return null;
}

function normalizeScores(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, number> = {};
  const lower = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const key of SCORE_KEYS) {
    const n =
      toNumber(raw[key]) ??
      toNumber(lower[key]) ??
      toNumber(raw[key.charAt(0).toUpperCase() + key.slice(1)]);
    if (n !== null) out[key] = Math.max(0, Math.min(100, Math.round(n)));
  }
  return Object.keys(out).length > 0 ? out : null;
}

const PRIORITY_SET = new Set(["P0", "P1", "P2", "p0", "p1", "p2"]);

/** Evidence that only cites empty / null PAGE_FACTS — not useful to show as 「依據」. */
function isTrivialEvidence(s: string): boolean {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return true;
  const segments = t.split(",").map((x) => x.trim()).filter(Boolean);
  if (segments.length === 0) return true;
  return segments.every((seg) => {
    if (/^[\w.]+\s*:\s*\[\s*\]$/.test(seg)) return true;
    if (/^[\w.]+\s*:\s*null$/i.test(seg)) return true;
    if (/^[\w.]+\s*:\s*undefined$/i.test(seg)) return true;
    if (/^[\w.]+\s*:\s*""$/.test(seg)) return true;
    return false;
  });
}

function normalizePriorityFinding(raw: unknown): {
  priority: string;
  finding: string;
  evidence?: string;
} | null {
  if (!isRecord(raw)) return null;
  const pRaw = raw.priority ?? raw.level ?? raw.tier;
  const pStr = typeof pRaw === "string" ? pRaw.trim() : "";
  const priority =
    pStr && PRIORITY_SET.has(pStr)
      ? pStr.toUpperCase()
      : pStr && /^(P0|P1|P2)$/i.test(pStr)
        ? pStr.toUpperCase()
        : "";
  const finding =
    (typeof raw.finding === "string" && raw.finding.trim()) ||
    (typeof raw.issue === "string" && raw.issue.trim()) ||
    (typeof raw.description === "string" && raw.description.trim()) ||
    "";
  if (!finding) return null;
  let evidence: string | undefined =
    typeof raw.evidence === "string" && raw.evidence.trim()
      ? raw.evidence.trim()
      : typeof raw.proof === "string" && raw.proof.trim()
        ? raw.proof.trim()
        : undefined;
  if (evidence !== undefined && isTrivialEvidence(evidence)) {
    evidence = undefined;
  }
  return {
    priority: priority || "P2",
    finding,
    evidence,
  };
}

function normalizePriorityFindings(raw: unknown): Array<{
  priority: string;
  finding: string;
  evidence?: string;
}> {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePriorityFinding).filter((x): x is NonNullable<typeof x> => x !== null);
}

function pickString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export type PriorityFindingRow = { priority: string; finding: string; evidence?: string };

export type NormalizedSeoScan = {
  overallScore: number | null;
  scores: Record<string, number> | null;
  executiveSummary: string | null;
  auditScope: string | null;
  summary: string | null;
  strengths: string[];
  priorityFindings: PriorityFindingRow[];
  verificationChecklist: string[];
  bullets: string[];
};

/**
 * Returns null if nothing usable could be extracted (caller may show fallback).
 */
export function normalizeSeoScanForUi(input: unknown): NormalizedSeoScan | null {
  const data = unwrapSeoScan(input);
  if (!data) return null;

  const overallScore =
    toNumber(data.overallScore) ??
    toNumber(data.overall_score) ??
    toNumber(data.score) ??
    toNumber(data.totalScore);

  const executiveSummary = pickString(data, [
    "executiveSummary",
    "executive_summary",
    "executiveSummaryText",
    "key_takeaway",
  ]);

  const auditScope = pickString(data, ["auditScope", "audit_scope", "scope", "scope_of_work"]);

  let summary: string | null =
    typeof data.summary === "string" && data.summary.trim()
      ? data.summary.trim()
      : typeof data.overview === "string" && data.overview.trim()
        ? data.overview.trim()
        : null;

  let strengths = toStringArray(data.strengths);
  if (strengths.length === 0) {
    strengths = toStringArray(data.whats_working);
  }

  let priorityFindings = normalizePriorityFindings(data.priorityFindings ?? data.priority_findings);
  if (priorityFindings.length === 0) {
    priorityFindings = normalizePriorityFindings(data.priorities);
  }

  let verificationChecklist = toStringArray(data.verificationChecklist ?? data.verification_checklist);
  if (verificationChecklist.length === 0) {
    verificationChecklist = toStringArray(data.qa_checklist ?? data.validation_steps);
  }

  let bullets = toStringArray(data.bullets);
  if (bullets.length === 0) {
    bullets = toStringArray(data.findings);
  }
  if (bullets.length === 0) {
    bullets = toStringArray(data.issues);
  }
  if (bullets.length === 0) {
    bullets = toStringArray(data.recommendations);
  }

  const scores = normalizeScores(data.scores);

  const has =
    overallScore !== null ||
    (summary !== null && summary.length > 0) ||
    bullets.length > 0 ||
    (scores !== null && Object.keys(scores).length > 0) ||
    executiveSummary !== null ||
    auditScope !== null ||
    strengths.length > 0 ||
    priorityFindings.length > 0 ||
    verificationChecklist.length > 0;

  if (!has) return null;

  return {
    overallScore:
      overallScore !== null ? Math.max(0, Math.min(100, Math.round(overallScore))) : null,
    scores,
    executiveSummary,
    auditScope,
    summary,
    strengths,
    priorityFindings,
    verificationChecklist,
    bullets,
  };
}
