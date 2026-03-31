import type { SeoFacts } from "@/lib/seo-extract";

function factsBlock(facts: SeoFacts): string {
  return JSON.stringify(facts, null, 2);
}

function competitorFactsBlock(competitors: SeoFacts[]): string {
  return JSON.stringify(competitors, null, 2);
}

function additionalSiteFactsBlock(pages: SeoFacts[]): string {
  return JSON.stringify(pages, null, 2);
}

/**
 * Marketing report framing: evidence stays crawl/HTML-only; no invented rankings or ad spend.
 * Bridge to 營銷 by tying search + page UX to acquisition and conversion *without* claiming off-page data.
 */
const MARKETING_REPORT_FOCUS =
  "Primary goal: deliver an **agency-grade 數碼營銷／落地頁營銷報告** (marketing-ready) grounded in **crawled HTML + headers** — the kind a client would pay for: clear scope, evidence-led findings, prioritized fixes, and verification steps. " +
  "Frame value for **marketing decision-makers**: how search visibility, snippet/CTR signals (title & meta), on-page messaging clarity (H1/headings), trust and credibility (HTTPS, security headers, structured data), and page experience blockers affect **discoverability** and **landing page effectiveness**. " +
  "Still cover technical SEO depth: crawl/index signals, title/meta/heading hygiene, internal linking hints, structured data, " +
  "scripts/payload hints visible in HTML, accessibility basics that affect SEO (images, landmarks), " +
  "and HTTPS / canonical / robots / meta-robots / x-robots when present in PAGE_FACTS. " +
  "Every recommendation must cite observable evidence from PAGE_FACTS JSON (field names) or state explicitly what cannot be seen from this snapshot. " +
  "Do **not** claim live Core Web Vitals field data, crawl budget numbers, keyword rankings, backlink counts, paid media results, social reach, or Search Console metrics unless present in PAGE_FACTS. " +
  "Tone: confident, precise, non-hype — like a senior **digital marketing + technical SEO** agency deck + implementation backlog (not generic motivational copy). " +
  "If PAGE_FACTS show solid basics (title+meta present, canonical, robots/lang OK, reasonable headings, schema if relevant), reflect that in **high sub-scores and overallScore** (often 80–95+); frame any remaining bullets as **incremental polish, content depth, or edge cases** visible in HTML—not as 'failing SEO'. " +
  "Do not contradict automated lab SEO checks users may see elsewhere; your output is a **qualitative snapshot audit**, not the same metric as Lighthouse's SEO category. " +
  "For `seo_scan.auditScope`, write **Traditional Chinese (Hong Kong)** — never English legalese boilerplate (e.g. 'This analysis is limited to…').";

/** Every Chinese string in JSON must be HK Traditional; models often slip into 简体 — forbid explicitly. */
const HK_TRADITIONAL_CHINESE_ONLY =
  "**Chinese (mandatory for all Chinese in JSON — `seo_scan`, actions, hooks, `competitor_analysis`, etc.):** **繁體中文（香港）** only. " +
  "**嚴禁簡體字**（Simplified Chinese / mainland character forms). Use HK written norms: e.g. 應該、實際、發現、網絡、聯絡、顯示、頁面、質素、透過、註冊、登入、搜尋、設定、帳戶、刪除、編輯、儲存、載入、資訊、產品、服務、電郵、聯絡我們、點擊、這裡／呢度（視語境）、部份（或「部分」按出版習慣）。 " +
  "**Never output** forms like: 这、应该、为、发现、发、网络、里、质量、显示、点击、页、登录、注册、联系、我们、关于、帮助、设置、账户、用户、邮箱、问题、时候、通过、信息、没有、还会、并、让、对、吗、说、个、时、无、请、后、过 — **wrong**. " +
  "Do **not** mix 繁體 with 简体 in the same sentence. English field labels in JSON keys stay camelCase. ";

/** When facts show weak sectioning, recommend more H2/H3 — evidence-led. */
const HEADING_STRUCTURE_GUIDANCE =
  "**Heading hierarchy:** if `headingCounts` / structure suggests **long blocks of text with too few H2/H3** (or weak topical breaks), recommend **adding more descriptive subheadings (H2/H3)** to improve **readability, scannability, and topical SEO** — cite `headingCounts`, `h1`, `h2` arrays or implied sections from PAGE_FACTS; do not invent quoted heading copy unless it appears in facts. " +
  "Where competitors show richer heading depth in COMPETITOR_PAGE_FACTS, you may contrast **structure** using only those JSON values. ";

const COMPETITOR_MINDSET =
  "When COMPETITOR_PAGE_FACTS is non-empty, add an **on-page competitive layer** (marketing + technical SEO): **positioning** implied by titles/metas/H1s, schema and trust signals, heading depth — **not** live SERP/backlinks/ad spend. " +
  "Compare title/meta patterns, heading depth, schema types, and technical signals vs competitors using only the JSON. " +
  "If competitors array is empty, set `competitor_analysis` to null and analyze only the primary URL.";

/** Avoid empty `competitor_themes: []` while `primary_themes` is full — confusing in UI. */
const INFERRED_TOPIC_THEMES_RULE =
  "**`competitor_analysis.inferred_topic_themes` (paid tier, when COMPETITOR_PAGE_FACTS non-empty):** " +
  "`primary_themes` and `competitor_themes` must each be **2–5 short HK Traditional phrases** inferred from **`title` / `h1` / `metaDescription` / heading lists / `jsonLdTypes`** in PRIMARY vs COMPETITOR JSON — **same style** on both sides (apples-to-apples topic clues). " +
  "**Never** return `competitor_themes: []` while `primary_themes` is non-empty — either infer competitor phrases from their facts, or **omit** the `competitor_themes` key, or use **one** candid HK string in `competitor_themes` like 「對手快照字極少／非目標語言，難以歸納」and mention briefly in `limitations` or `methodology_limits`. " +
  "Empty competitor column with no explanation is **forbidden**.";

/**
 * Stops generic “any website” steps (e.g. `<img src="image-url" alt="…">`) — every fix must tie to THIS crawl.
 */
const SITE_SPECIFIC_IMPLEMENTATION_RULES =
  "**Site-specific implementation (mandatory for `preview_actions`, `full_actions`, and any `steps`):** " +
  "Each action's `title`, `rationale`, and **every** `steps[].text` must reference **concrete evidence** from PRIMARY_PAGE_FACTS (and ADDITIONAL_SAME_SITE_PAGE_FACTS / COMPETITOR_PAGE_FACTS when relevant): e.g. `finalUrl`, `title`, `h1`, `metaDescription`, `canonical`, `robotsMeta`, `viewport`, `jsonLdTypes`, `headingCounts`, `imagesMissingAlt` + `imagesTotal`, `internalLinksApprox`, `hasJsonLd`, security header flags, etc. " +
  "Say **what is wrong on this snapshot** (with counts or quoted short values), then what to change — not a generic tutorial. " +
  "**Forbidden:** placeholder examples (`image-url`, `example.com`, `Your Title Here`, `Descriptive text`, stock `<img>`/meta that could apply unchanged to any site), MDN-style generic steps, or snippets that do not incorporate real values from PAGE_FACTS. " +
  "If you cannot produce a **non-placeholder** `snippet` grounded in this JSON, **omit `snippet`** for that step and use `detail` only, still citing field names and values. " +
  "For images: never suggest a fake `<img>` — instead reference `imagesMissingAlt` / `imagesTotal` and describe the **template or section** implied by this page (e.g. hero/product grid) using evidence from headings or page structure in the facts. " +
  "**`steps[].detail` / `snippet` must earn the expand (mandatory):** " +
  "(1) **`detail` must add real value** beyond the one-line `text` — **forbidden:** paraphrasing `text`, or vague lines like 「目前已有 alt，可再優化」when `imagesMissingAlt` is **0** (no missing alts on this snapshot). If there is nothing concrete to add, **omit `detail` and `snippet`** so the step stays a **single non-expandable line**. " +
  "(2) **When `snippet` is present,** `detail` **must** start with a **placement line** in Traditional Chinese: **「貼上位置：…」** or **「適用位置：…」**. The placement line must be **technical and specific** — name the **artifact** users edit: e.g. file path (`app/layout.tsx`、`next.config.ts`、`middleware.ts`、`public/_headers`)、HTTP **header 名稱**（如 `Content-Security-Policy`）、config **key / 函數**（如 Next `headers()`、Nginx `add_header`、Cloudflare Transform Rules）、或 DOM 位置（如 **`<head>` 最尾**、**`#__next` 前**）. **Forbidden:** vague phrases alone（如「首頁 HTML 內容區塊」「伺服器設定」）without **file name、header 名、或工具路徑**. " +
  "(3) **No duplicate pasteable content between `detail` and `snippet`:** After the placement line, `detail` body should be **prose**（步驟、注意、驗證）— **do not** repeat the **exact same** config line、header line、或 markup block that appears in `snippet`. Put **one copy only** of machine-pasteable text in **`snippet`**; if the only thing to paste is a single header or line, keep explanation in `detail` **without** echoing that line. " +
  "(4) If the only \"optimization\" is subjective alt wording but counts show **no missing alts**, **do not** use an expandable — state briefly in `text` or skip the step.";

/**
 * Keeps scope honest without sounding like a legal disclaimer; model must follow this for `seo_scan.auditScope`.
 */
function auditScopeInstruction(hasAdditionalPages: boolean): string {
  const extra =
    hasAdditionalPages
      ? " If ADDITIONAL_SAME_SITE_PAGE_FACTS is non-empty, add **one short phrase** that a few same-site URLs were sampled via internal links (not a full-site crawl). "
      : "";
  return (
    "AUDIT_SCOPE_RULE — apply to `seo_scan.auditScope` only (string, **Traditional Chinese Hong Kong**, **1–2 short sentences**): " +
    "(1) **Inputs only:** fetched HTML + response headers for the submitted URL" +
    extra +
    "; competitor pages **only if** COMPETITOR_PAGE_FACTS is non-empty (name that comparison briefly). " +
    "(2) **One line on value:** what stakeholders can act on from **this snapshot** (on-page + technical signals). " +
    "**Forbidden in `auditScope`:** the long exclusion list（即時排名、廣告、反向連結、Search Console、PageSpeed 唔等同真實體驗等）— **do not repeat**; site footer / product copy covers limits. " +
    "**Forbidden:** English legalese boilerplate. **Do not** repeat `auditScope` wording in `executiveSummary` or `summary`."
  );
}

/** JSON shape for `seo_scan` — camelCase only in model output. */
const SEO_SCAN_SHAPE_FREE =
  "`seo_scan` object (camelCase keys only) with: " +
  "`executiveSummary` string: 2–3 sentences for a **marketing/growth stakeholder** — lead with **商業／獲客風險**（search + landing clarity），then top opportunity; tie to evidence; no fluff. " +
  "`auditScope` string: **must follow AUDIT_SCOPE_RULE** in the user message (see below). " +
  "`overallScore` number 0–100 = **營銷相關** landing + technical health from this snapshot (search + page quality signals) only — **always output this number** (do not omit); it should align with the five `scores` dimensions. " +
  "`scores` object with keys title, meta, headings, content, technical each 0–100 where: " +
  "title = SERP title quality (length, uniqueness intent, alignment with H1); " +
  "meta = description + indexability signals (robots meta, x-robots if present); " +
  "headings = H1/H2 logic and topical structure; " +
  "content = topical depth proxy + internal link opportunities visible in HTML; " +
  "technical = indexability, canonical duplication hints, performance/script blocking hints, JSON-LD, HTTPS + security header hints from facts, image alt hygiene). " +
  "`summary` string: 4–7 sentences — analyst narrative with specifics (counts, missing pieces, conflicts between tags). **Must not** repeat or paste the same opening as `executiveSummary` — write **only** the deeper layer (evidence, trade-offs, what to verify next); if the same thesis would appear twice, **skip** the duplicated sentences. " +
  "`strengths` string array max 3: what is already solid for **search + landing effectiveness** (evidence-based). " +
  "`priorityFindings` array max 4 of objects `{ priority: \"P0\"|\"P1\"|\"P2\", finding: string, evidence?: string }` — P0 = indexation/canonical/robots blockers; P1 = high-impact on-page; P2 = polish; `evidence` only when useful: quote a non-empty value or name a concrete conflict; **omit `evidence`** if the only cite would be empty arrays like `h1: []` or null fields. " +
  "`verificationChecklist` string array max 4: concrete checks (e.g. URL Inspection concepts, Rich Results Test, robots.txt review) — no fake metrics. " +
  "`bullets` string array max 6: remaining actionable findings not duplicated above.";

const SEO_SCAN_SHAPE_PAID =
  "`seo_scan` object (camelCase) with the **same keys as free tier** but allow: " +
  "`strengths` up to 4 items; `priorityFindings` up to 8 items; `verificationChecklist` up to 8 items; `bullets` up to 10 items; " +
  "`summary` may be 5–10 sentences for a full audit narrative — **still no duplication** of `executiveSummary` opening; continue with new detail only.";

export function buildFreeScanPrompt(
  primary: SeoFacts,
  competitors: SeoFacts[],
  additionalSitePages: SeoFacts[] = [],
): Array<{ role: "system" | "user"; content: string }> {
  const hasComp = competitors.length > 0;
  const hasBreadth = additionalSitePages.length > 0;
  return [
    {
      role: "system",
      content:
        "You are a senior **digital marketing strategist** (deep technical SEO expertise) reviewing crawled HTML snapshot(s) for a **營銷報告**-style deliverable. " +
        (hasBreadth
          ? "When ADDITIONAL_SAME_SITE_PAGE_FACTS is non-empty, add **cross-page** insights: duplicate or conflicting titles/metas, template consistency, internal linking between sampled pages, obvious thin/duplicate content risks — while keeping PRIMARY as the anchor for the audit. "
          : "") +
        MARKETING_REPORT_FOCUS +
        " " +
        COMPETITOR_MINDSET +
        " " +
        SITE_SPECIFIC_IMPLEMENTATION_RULES +
        " " +
        HK_TRADITIONAL_CHINESE_ONLY +
        HEADING_STRUCTURE_GUIDANCE +
        " Respond with JSON only (no markdown). " +
        "The user has NOT paid: output exactly 3 `preview_actions` — each must be a **concrete, evidence-based fix** that matters for **search visibility and/or landing page effectiveness** (still grounded in PAGE_FACTS — typically technical/on-page SEO levers), " +
        "each with `title`, `rationale`, optional `impact`: \"high\"|\"medium\"|\"low\", and **required `steps`**: an array of **3–6** objects. " +
        "Each step object: `text` (one-line summary for the list row), optional `detail` (longer how-to), optional `snippet` (copy-paste HTML, meta tag, JSON-LD, header line, robots/canonical — **plain text only**, no markdown code fences). " +
        "`steps` must be **implementation-ready for THIS URL's snapshot only** (what to change given the JSON evidence, in what order) — same spirit as Pro `full_actions` but scoped to this one fix; **never** generic steps that apply to arbitrary sites. " +
        "Also output exactly 3 `pro_teaser_actions` objects (`title`, `impact`, `hook`) — **other** high-impact backlog items that would appear in Pro `full_actions`, with **different titles** than `preview_actions`. " +
        "`hook` = one compelling sentence only (why it matters); **no** steps, snippets, or full rationale — those stay Pro-only.",
    },
    {
      role: "user",
      content:
        "Perform an **agency-style 營銷導向頁面審計** (search + landing + technical evidence) of the PRIMARY page using the facts below. " +
        (hasBreadth
          ? "Use ADDITIONAL_SAME_SITE_PAGE_FACTS for **same-site breadth** (patterns across pages), not as a substitute for a full crawl. "
          : "") +
        (hasComp
          ? "Use COMPETITOR_PAGE_FACTS for comparative technical notes in `competitor_analysis`. "
          : "") +
        "Return JSON with keys: " +
        SEO_SCAN_SHAPE_FREE +
        "`preview_actions` (exactly 3 objects: title, rationale, optional impact, **steps** array as above — do not omit `steps`; each action must be **auditable against PRIMARY_PAGE_FACTS**), " +
        "`pro_teaser_actions` (exactly 3 objects: title, impact high|medium|low, hook string — one-line teaser only), " +
        (hasComp
          ? "`competitor_analysis` (object: methodology_limits string; snapshot_summary string; " +
            "top_gaps string array max 4 technical/content gaps vs competitors; differentiation_hooks string array max 3 **SEO / 定位 / 訊息** angles visible from snapshots). "
          : "`competitor_analysis` null. ") +
        "\n\nPRIMARY_PAGE_FACTS:\n" +
        factsBlock(primary) +
        "\n\nADDITIONAL_SAME_SITE_PAGE_FACTS (same schema; empty array if none — extra pages on the same host sampled via links from the primary page):\n" +
        additionalSiteFactsBlock(additionalSitePages) +
        "\n\nCOMPETITOR_PAGE_FACTS (same schema per entry; empty array if none):\n" +
        competitorFactsBlock(competitors) +
        "\n\n" +
        auditScopeInstruction(hasBreadth) +
        "\n\n**Required top-level JSON keys:** `seo_scan`, `preview_actions`, `pro_teaser_actions`, " +
        "and `competitor_analysis` (object or null). Do not omit `preview_actions` or `pro_teaser_actions`. " +
        "**Final check:** every `preview_actions` row and every step must be justified by fields in PRIMARY_PAGE_FACTS above — if a fix does not map to those facts, pick a different issue from the JSON. " +
        "**Language:** all Chinese strings must be **香港繁體** — **no 简体字**.",
    },
  ];
}

export function buildPaidScanPrompt(
  primary: SeoFacts,
  competitors: SeoFacts[],
  additionalSitePages: SeoFacts[] = [],
): Array<{ role: "system" | "user"; content: string }> {
  const hasComp = competitors.length > 0;
  const hasBreadth = additionalSitePages.length > 0;
  return [
    {
      role: "system",
      content:
        "You are a senior **digital marketing + technical SEO** consultant; output must be **implementation-ready** and read like a paid **營銷／growth** agency deliverable (evidence-led, not hype). " +
        (hasBreadth
          ? "When ADDITIONAL_SAME_SITE_PAGE_FACTS is non-empty, include **cross-page** backlog items (templates, duplicate titles, internal linking) where evidence supports them. "
          : "") +
        MARKETING_REPORT_FOCUS +
        " " +
        COMPETITOR_MINDSET +
        (hasComp ? " " + INFERRED_TOPIC_THEMES_RULE + " " : "") +
        SITE_SPECIFIC_IMPLEMENTATION_RULES +
        " " +
        HK_TRADITIONAL_CHINESE_ONLY +
        HEADING_STRUCTURE_GUIDANCE +
        " Respond with JSON only (no markdown).",
    },
    {
      role: "user",
      content:
        "**營銷導向** audit of PRIMARY (search + landing + technical) with a prioritized backlog suitable for **marketing, content, and engineering** teams. " +
        (hasBreadth
          ? "Use ADDITIONAL_SAME_SITE_PAGE_FACTS for same-site breadth (sampled pages only). "
          : "") +
        (hasComp
          ? "Layer in competitor snapshots for comparative **on-page marketing + technical** insights. "
          : "") +
        "Return JSON with keys: " +
        SEO_SCAN_SHAPE_PAID +
        "`full_actions` (array of 10–18 objects: title, impact: low|medium|high, effort: low|medium|high, " +
        "steps: array of **step objects** (not plain strings preferred). " +
        "Each step MUST include `text` (short one-line summary for a collapsed list row). " +
        "Optional: `detail` (string, longer how-to / context), `snippet` (string, copy-pasteable code or markup: meta tag, JSON-LD, robots line, nginx/header fragment, Next.js snippet—plain text only, no markdown code fences). " +
        "Snippets must use **real values from PAGE_FACTS** where applicable; if only a generic example is possible, omit `snippet`. " +
        "If a step has no snippet, omit `snippet`. Legacy `steps` as string array is allowed but objects are strongly preferred. " +
        "Order by **search/landing impact** × feasibility; group quick wins before heavier projects when possible; " +
        (hasComp ? "reference competitors only where it sharpens the fix). " : "") +
        "`conversion_notes` (string: multi-paragraph **implementation & QA playbook** — crawl, index, render, schema, internal links, redirects/canonicals, internationalization if lang present, security/HTTPS; include **messaging / value proposition** notes when evidence in PAGE_FACTS supports snippet, title/meta, or structured-data presentation), " +
        "`preview_actions` (exactly 3 objects: title, rationale, optional impact, **steps** array 3–6 objects with `text` / optional `detail` / optional `snippet` — **implementation steps** matching the same fix as in `full_actions` where applicable; do not omit `steps`). " +
        (hasComp
          ? "`competitor_analysis` (object: methodology_limits string; executive_summary string; " +
            "positioning_matrix (array of: competitor_url, their_inferred_positioning, your_inferred_positioning, strategic_takeaway), " +
            "inferred_topic_themes (primary_themes, competitor_themes), " +
            "content_gaps (gap_description, what_competitor_does, what_you_should_do), " +
            "differentiation_opportunities string array, limitations string). "
          : "`competitor_analysis` null. ") +
        "\n\nPRIMARY_PAGE_FACTS:\n" +
        factsBlock(primary) +
        "\n\nADDITIONAL_SAME_SITE_PAGE_FACTS (same schema; empty array if none):\n" +
        additionalSiteFactsBlock(additionalSitePages) +
        "\n\nCOMPETITOR_PAGE_FACTS (same schema per entry; empty array if none):\n" +
        competitorFactsBlock(competitors) +
        "\n\n" +
        auditScopeInstruction(hasBreadth) +
        "\n\n**Final check:** every `full_actions` item and `preview_actions` step must map to evidence in PRIMARY_PAGE_FACTS (or additional/competitor facts when used). Reject generic placeholder snippets. " +
        "**Language:** all Chinese strings must be **香港繁體** — **no 简体字**.",
    },
  ];
}
