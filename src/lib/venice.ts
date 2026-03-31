import { getEnv } from "@/lib/env";

const VENICE_BASE = "https://api.venice.ai/api/v1";

/** Wall-clock cap for the Venice HTTP request (large JSON can take minutes). Override via env. */
const DEFAULT_VENICE_FETCH_TIMEOUT_MS = 180_000;

/** Default when `VENICE_MODEL` is unset — GPT-5.4 Mini (Venice). Override if needed. */
export const DEFAULT_VENICE_MODEL = "openai-gpt-54-mini";

/**
 * Venice defaults `max_tokens` to 16384; long prompts + that default exceed 32k context.
 * We cap completion tokens so prompt + max_tokens ≤ context window.
 */
const DEFAULT_CONTEXT_WINDOW_TOKENS = 32768;
const VENICE_DEFAULT_MAX_COMPLETION = 16384;
const CONTEXT_SAFETY_MARGIN = 256;
/**
 * Floor for `max_tokens`. Too low → the model stops mid-JSON and strings look "trimmed"
 * (e.g. strengths ending with「及」). Large structured `json_object` replies need a few k tokens.
 */
const MIN_COMPLETION_TOKENS = 2048;

function estimatePromptTokens(messages: Array<{ content: string }>): number {
  const chars = messages.reduce((s, m) => s + (m.content?.length ?? 0), 0);
  // Upper-bound prompt size: CJK + code can exceed 1 token / 2 chars; stay pessimistic so
  // max_tokens never exceeds context − actual prompt (Venice rejects if sum > window).
  return Math.ceil(chars / 1.5);
}

/** Safe max completion size for the given messages (Venice 32k-style window). */
export function clampVeniceMaxCompletionTokens(
  messages: Array<{ content: string }>,
  contextWindowTokens: number = DEFAULT_CONTEXT_WINDOW_TOKENS,
): number {
  const estIn = estimatePromptTokens(messages);
  const room = contextWindowTokens - estIn - CONTEXT_SAFETY_MARGIN;
  const cap = Math.min(VENICE_DEFAULT_MAX_COMPLETION, Math.max(MIN_COMPLETION_TOKENS, room));
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

export async function veniceChatJson(params: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  veniceParameters?: Record<string, unknown>;
  /** Hard cap on completion tokens; still clamped to fit context window. */
  maxCompletionTokens?: number;
  /** Model context length for cap math (default 32768). */
  contextWindowTokens?: number;
  /** Override `VENICE_FETCH_TIMEOUT_MS` / default 180s. */
  fetchTimeoutMs?: number;
}): Promise<{ text: string; usage: VeniceUsage }> {
  const ctx = params.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const safeCap = clampVeniceMaxCompletionTokens(params.messages, ctx);
  const maxTokens =
    params.maxCompletionTokens !== undefined
      ? Math.min(params.maxCompletionTokens, safeCap)
      : safeCap;

  const timeoutMs =
    params.fetchTimeoutMs ??
    parseTimeoutMs(getEnv("VENICE_FETCH_TIMEOUT_MS"), DEFAULT_VENICE_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: params.model,
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
    choices?: Array<{
      finish_reason?: string;
      stop_reason?: string | null;
      message?: {
        content?: string | null | Array<{ type?: string; text?: string }>;
        reasoning_content?: string | null;
        refusal?: string | null;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const choice0 = data.choices?.[0];
  const msg = choice0?.message;
  if (typeof msg?.refusal === "string" && msg.refusal.trim()) {
    throw new Error(`Venice refused: ${msg.refusal.slice(0, 500)}`);
  }

  let text = "";
  const rawContent = msg?.content;
  if (typeof rawContent === "string") text = rawContent;
  else if (Array.isArray(rawContent)) {
    text = rawContent
      .map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text?: string }).text ?? "") : ""))
      .join("");
  }
  if (!text.trim() && typeof msg?.reasoning_content === "string" && msg.reasoning_content.trim()) {
    const rc = msg.reasoning_content.trim();
    // Some reasoning models emit JSON in reasoning_content when content is empty (provider quirk).
    if (rc.startsWith("{") || rc.startsWith("[")) text = rc;
  }

  if (!text.trim()) {
    const fr = choice0?.finish_reason ?? choice0?.stop_reason ?? "?";
    const model = data.model ?? "?";
    const hint =
      fr === "length"
        ? "（可能觸發輸出長度上限 — 可縮短 prompt 或換模型 / 調高上下文）"
        : fr === "content_filter" || fr === "safety"
          ? "（內容被過濾）"
          : "";
    throw new Error(
      `Venice returned empty content（model=${model} finish_reason=${fr}${hint}）。如用推理模型，可試改 VENICE_MODEL 或關閉相關 venice_parameters。`,
    );
  }

  if (data.usage) {
    usage.promptTokens = data.usage.prompt_tokens;
    usage.completionTokens = data.usage.completion_tokens;
    usage.totalTokens = data.usage.total_tokens;
  }

  return { text, usage };
}
