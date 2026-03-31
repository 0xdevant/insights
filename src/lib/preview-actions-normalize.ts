/**
 * Normalizes `preview_actions` from model JSON (mixed casing) and fills gaps from
 * `seo_scan` or `full_actions` so the UI section is rarely empty.
 */

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** One implementation step (aligned with Pro `full_actions` step shape). */
export type NormalizedPreviewStep = {
  text: string;
  detail?: string;
  snippet?: string;
};

export type NormalizedPreviewAction = {
  title: string;
  rationale?: string;
  impact?: string;
  steps?: NormalizedPreviewStep[];
};

function parsePreviewStep(raw: unknown): NormalizedPreviewStep | null {
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

function parseStepsArray(raw: unknown): NormalizedPreviewStep[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: NormalizedPreviewStep[] = [];
  for (const s of raw) {
    const p = parsePreviewStep(s);
    if (p) out.push(p);
  }
  return out.length > 0 ? out : undefined;
}

function parseActionItem(raw: unknown): NormalizedPreviewAction | null {
  if (!isRecord(raw)) return null;
  const title =
    (typeof raw.title === "string" && raw.title.trim()) ||
    (typeof raw.action === "string" && raw.action.trim()) ||
    (typeof raw.name === "string" && raw.name.trim()) ||
    (typeof raw.task === "string" && raw.task.trim()) ||
    "";
  const rationale =
    (typeof raw.rationale === "string" && raw.rationale.trim()) ||
    (typeof raw.reason === "string" && raw.reason.trim()) ||
    (typeof raw.description === "string" && raw.description.trim()) ||
    undefined;
  const impact =
    typeof raw.impact === "string" && raw.impact.trim() ? raw.impact.trim() : undefined;
  if (!title && rationale) {
    const line = rationale.length > 160 ? `${rationale.slice(0, 157)}…` : rationale;
    const steps = parseStepsArray(raw.steps);
    return {
      title: line,
      rationale: rationale.length > 160 ? rationale : undefined,
      steps,
    };
  }
  if (!title && !rationale) return null;
  const steps = parseStepsArray(raw.steps);
  return {
    title: title || "建議",
    rationale,
    impact,
    steps,
  };
}

function parseTopLevelArray(root: Record<string, unknown>): NormalizedPreviewAction[] {
  const raw =
    root.preview_actions ??
    root.previewActions ??
    root.quick_actions ??
    root.quickActions ??
    root.top_actions ??
    root.topActions;
  if (!Array.isArray(raw)) return [];
  const out: NormalizedPreviewAction[] = [];
  for (const item of raw) {
    const a = parseActionItem(item);
    if (a) out.push(a);
  }
  return out;
}

function fromSeoScanFallback(scan: Record<string, unknown>, max: number): NormalizedPreviewAction[] {
  const out: NormalizedPreviewAction[] = [];

  const pf = scan.priority_findings ?? scan.priorityFindings;
  if (Array.isArray(pf)) {
    for (const p of pf) {
      if (!isRecord(p)) continue;
      const finding = typeof p.finding === "string" ? p.finding.trim() : "";
      const evidence = typeof p.evidence === "string" ? p.evidence.trim() : "";
      const pri = typeof p.priority === "string" ? p.priority.trim().toUpperCase() : "";
      if (!finding) continue;
      let impact: string | undefined;
      if (pri === "P0") impact = "high";
      else if (pri === "P1") impact = "medium";
      else if (pri === "P2") impact = "low";
      out.push({
        title: finding.length > 200 ? `${finding.slice(0, 197)}…` : finding,
        rationale: evidence || undefined,
        impact,
      });
      if (out.length >= max) return out;
    }
  }

  const bullets = scan.bullets;
  if (Array.isArray(bullets)) {
    for (const b of bullets) {
      if (typeof b !== "string" || !b.trim()) continue;
      const t = b.trim();
      out.push({
        title: t.length > 200 ? `${t.slice(0, 197)}…` : t,
      });
      if (out.length >= max) return out;
    }
  }

  return out;
}

function firstStepText(steps: unknown): string | undefined {
  if (!Array.isArray(steps) || steps.length === 0) return undefined;
  const first = steps[0];
  if (typeof first === "string" && first.trim()) return first.trim();
  if (isRecord(first)) {
    const t =
      (typeof first.text === "string" && first.text.trim()) ||
      (typeof first.instruction === "string" && first.instruction.trim()) ||
      (typeof first.step === "string" && first.step.trim()) ||
      "";
    return t || undefined;
  }
  return undefined;
}

/** Paid tier: first N full_actions cards as preview rows. */
function fromFullActions(fa: unknown, max: number): NormalizedPreviewAction[] {
  if (!Array.isArray(fa)) return [];
  const out: NormalizedPreviewAction[] = [];
  for (const item of fa.slice(0, max)) {
    if (!isRecord(item)) continue;
    const title =
      (typeof item.title === "string" && item.title.trim()) || "行動項目";
    const rationale = firstStepText(item.steps);
    const impact = typeof item.impact === "string" ? item.impact : undefined;
    out.push({
      title,
      rationale,
      impact,
    });
  }
  return out;
}

/**
 * @param max — typically 3 for the preview strip
 */
function nestedPreviewFromSeoScan(root: Record<string, unknown>, max: number): NormalizedPreviewAction[] {
  const scan = root.seo_scan ?? root.seoScan;
  if (!isRecord(scan)) return [];
  const nested = scan.preview_actions ?? scan.previewActions;
  if (!Array.isArray(nested)) return [];
  const out: NormalizedPreviewAction[] = [];
  for (const item of nested) {
    const a = parseActionItem(item);
    if (a) out.push(a);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizePreviewActionsForResponse(
  root: Record<string, unknown>,
  options: { max: number; fillFromFullActionsIfPaid?: boolean },
): NormalizedPreviewAction[] {
  const { max, fillFromFullActionsIfPaid } = options;
  let list = parseTopLevelArray(root);
  if (list.length > max) list = list.slice(0, max);

  if (list.length === 0) {
    list = nestedPreviewFromSeoScan(root, max);
  }

  if (list.length === 0) {
    const scan = root.seo_scan ?? root.seoScan;
    if (isRecord(scan)) {
      list = fromSeoScanFallback(scan, max);
    }
  }

  if (list.length === 0 && fillFromFullActionsIfPaid) {
    list = fromFullActions(root.full_actions ?? root.fullActions, max);
  }

  return list.slice(0, max);
}

/** Free tier: low/medium impact in `free` (max 3); `high` impact → Pro blur (max 5). */
export function normalizePreviewActionsForFreeSplit(root: Record<string, unknown>): {
  free: NormalizedPreviewAction[];
  highImpactLocked: NormalizedPreviewAction[];
} {
  const all = normalizePreviewActionsForResponse(root, {
    max: 24,
    fillFromFullActionsIfPaid: false,
  });
  const free: NormalizedPreviewAction[] = [];
  const high: NormalizedPreviewAction[] = [];
  for (const a of all) {
    if (a.impact?.toLowerCase() === "high") {
      /** High-impact rows are Pro-teaser territory — keep title/rationale for blur, omit step-by-step. */
      const stripped = { ...a };
      delete stripped.steps;
      high.push(stripped);
    } else free.push(a);
  }
  let freeOut = free.slice(0, 3);

  /** When the model tags every row as high, still show up to 3 non-high lines from scan fallbacks. */
  if (freeOut.length < 3) {
    const scan = root.seo_scan ?? root.seoScan;
    if (isRecord(scan)) {
      const extra = fromSeoScanFallback(scan, 12);
      const seen = new Set(all.map((a) => a.title));
      for (const e of extra) {
        if (freeOut.length >= 3) break;
        if (e.impact?.toLowerCase() === "high") continue;
        if (seen.has(e.title)) continue;
        seen.add(e.title);
        freeOut.push(e);
      }
    }
  }

  return {
    free: freeOut.slice(0, 3),
    highImpactLocked: high.slice(0, 5),
  };
}
