import { getEnv } from "@/lib/env";

const VENICE_BASE = "https://api.venice.ai/api/v1";

/** Wall-clock cap for the Venice HTTP request (large JSON can take minutes). Override via env. */
const DEFAULT_VENICE_FETCH_TIMEOUT_MS = 180_000;

/**
 * Default when `VENICE_MODEL` is unset or whitespace-only — Moonshot Kimi K2.5 (`kimi-k2-5` on Venice).
 * Change here to switch the global default; override per deploy with `VENICE_MODEL`.
 */
export const DEFAULT_VENICE_MODEL = "kimi-k2-5";

/** Model id for Venice `/chat/completions`: env `VENICE_MODEL`, else {@link DEFAULT_VENICE_MODEL}. */
export function resolveVeniceModel(): string {
  return getEnv("VENICE_MODEL") ?? DEFAULT_VENICE_MODEL;
}

/**
 * Ceiling for a single completion (`max_tokens`). Venice defaults to 16384, but large
 * `json_object` scans can need more — **only raising VENICE_CONTEXT_WINDOW_TOKENS is not
 * enough** if this ceiling stays at 16384: `Math.min(16384, room)` caps output anyway.
 */
function maxCompletionCeiling(): number {
  const raw = getEnv("VENICE_MAX_COMPLETION_TOKENS");
  if (!raw) return 32768;
  const n = Number.parseInt(raw.trim(), 10);
  if (Number.isFinite(n) && n >= 1024 && n <= 131072) return n;
  return 32768;
}

const CONTEXT_SAFETY_MARGIN = 256;
/**
 * Floor for `max_tokens`. Too low → the model stops mid-JSON and strings look "trimmed"
 * (e.g. strengths ending with「及」). Large structured `json_object` replies need a few k tokens.
 */
const MIN_COMPLETION_TOKENS = 2048;

function estimatePromptTokens(messages: Array<{ content: string }>): number {
  const chars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
  // `chars/1.5` underestimates CJK-heavy prompts (often ~1 token/char) → we think there is
  // more "room" for max_tokens than the real context allows → Venice can return 200 with
  // empty `message.content` (prod: big HTML → big PAGE_FACTS). Use a stricter divisor.
  return Math.ceil(chars / 1.15);
}

function defaultContextWindowTokens(): number {
  const raw = getEnv("VENICE_CONTEXT_WINDOW_TOKENS");
  if (!raw) return 32768;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 8192 ? n : 32768;
}

/** Safe max completion size for the given messages (Venice 32k-style window). */
export function clampVeniceMaxCompletionTokens(
  messages: Array<{ content: string }>,
  contextWindowTokens?: number,
): number {
  const window = contextWindowTokens ?? defaultContextWindowTokens();
  const estIn = estimatePromptTokens(messages);
  const room = window - estIn - CONTEXT_SAFETY_MARGIN;
  const cap = Math.min(
    maxCompletionCeiling(),
    Math.max(MIN_COMPLETION_TOKENS, room),
  );
  return cap;
}

export type VeniceUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cfRay?: string;
  headers: Record<string, string>;
};

function headerSnapshot(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

function parseTimeoutMs(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n >= 10_000 ? n : fallback;
}

type VeniceChoice = {
  finish_reason?: string;
  stop_reason?: string | null;
  message?: {
    content?: string | null | Array<{ type?: string; text?: string }>;
    reasoning_content?: string | null;
    refusal?: string | null;
  };
};

function extractAssistantText(msg: VeniceChoice["message"]): string {
  if (!msg) return "";
  if (typeof msg.refusal === "string" && msg.refusal.trim()) {
    throw new Error(`Venice refused: ${msg.refusal.slice(0, 500)}`);
  }
  const raw = msg.content;
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (Array.isArray(raw)) {
    text = raw
      .map((p) =>
        typeof p === "object" && p && "text" in p ? String((p as { text?: string }).text ?? "") : "",
      )
      .join("");
  }
  if (!text.trim() && typeof msg.reasoning_content === "string" && msg.reasoning_content.trim()) {
    const rc = msg.reasoning_content.trim();
    if (rc.startsWith("{") || rc.startsWith("[")) text = rc;
  }
  return text;
}

export async function veniceChatJson(params: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  veniceParameters?: Record<string, unknown>;
  /** Hard cap on completion tokens; still clamped to fit context window. */
  maxCompletionTokens?: number;
  /** Model context length for cap math (default 32768, or VENICE_CONTEXT_WINDOW_TOKENS). */
  contextWindowTokens?: number;
  /** Override `VENICE_FETCH_TIMEOUT_MS` / default 180s. */
  fetchTimeoutMs?: number;
}): Promise<{ text: string; usage: VeniceUsage }> {
  const ctx = params.contextWindowTokens ?? defaultContextWindowTokens();
  const safeCap = clampVeniceMaxCompletionTokens(params.messages, ctx);
  const maxTokens =
    params.maxCompletionTokens !== undefined
      ? Math.min(params.maxCompletionTokens, safeCap)
      : safeCap;

  const timeoutMs =
    params.fetchTimeoutMs ??
    parseTimeoutMs(
      getEnv("VENICE_FETCH_TIMEOUT_MS"),
      DEFAULT_VENICE_FETCH_TIMEOUT_MS,
    );

  const modelId = params.model?.trim() || DEFAULT_VENICE_MODEL;

  let res: Response;
  try {
    res = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages: params.messages,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        temperature: 0.2,
        ...(params.veniceParameters
          ? { venice_parameters: params.veniceParameters }
          : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(
        `Venice 請求逾時（>${Math.round(timeoutMs / 1000)} 秒）。可調高 VENICE_FETCH_TIMEOUT_MS 或稍後重試。`,
      );
    }
    throw e;
  }

  const headers = headerSnapshot(res.headers);
  const usage: VeniceUsage = {
    headers,
    cfRay: headers["cf-ray"],
  };

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Venice error ${res.status}: ${errText.slice(0, 800)}`);
  }

  const data = (await res.json()) as {
    model?: string;
    choices?: VeniceChoice[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const choice0 = data.choices?.[0];
  const text = extractAssistantText(choice0?.message);

  if (!text.trim()) {
    const fr = choice0?.finish_reason ?? choice0?.stop_reason ?? "?";
    const model = data.model ?? "?";
    const estPromptChars = params.messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
    const rawPreview = JSON.stringify(data).slice(0, 1200);
    // One line so Cloudflare log search always has diagnostics (some dashboards truncate Error.message on console.error(e)).
    console.error(
      `[venice_empty] ${JSON.stringify({
        requestModel: modelId,
        responseModel: model,
        finish_reason: fr,
        maxTokens,
        estPromptChars,
        prompt_tokens: data.usage?.prompt_tokens ?? null,
        completion_tokens: data.usage?.completion_tokens ?? null,
        choicesLen: data.choices?.length ?? 0,
        rawPreview,
      })}`,
    );
    const hint =
      fr === "length"
        ? "（可能觸發輸出長度上限 — 可縮短 prompt、或設 VENICE_CONTEXT_WINDOW_TOKENS 更大若模型支援）"
        : fr === "content_filter" || fr === "safety"
          ? "（內容被過濾）"
          : "";
    throw new Error(
      `Venice returned empty content（model=${model} finish_reason=${fr}${hint}）。如 prod 頁面較大，試用較細 URL 或加大上下文設定。`,
    );
  }

  if (data.usage) {
    usage.promptTokens = data.usage.prompt_tokens;
    usage.completionTokens = data.usage.completion_tokens;
    usage.totalTokens = data.usage.total_tokens;
  }

  return { text, usage };
}
