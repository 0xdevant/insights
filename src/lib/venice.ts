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
  /**
   * Optional completion cap. If omitted, Venice uses the model default (see API:
   * `max_tokens` ≤ 0 is ignored in favor of the model maximum).
   */
  maxCompletionTokens?: number;
  /** Override `VENICE_FETCH_TIMEOUT_MS` / default 180s. */
  fetchTimeoutMs?: number;
}): Promise<{ text: string; usage: VeniceUsage }> {
  const timeoutMs =
    params.fetchTimeoutMs ??
    parseTimeoutMs(
      getEnv("VENICE_FETCH_TIMEOUT_MS"),
      DEFAULT_VENICE_FETCH_TIMEOUT_MS,
    );

  const modelId = params.model?.trim() || DEFAULT_VENICE_MODEL;

  const payload: Record<string, unknown> = {
    model: modelId,
    messages: params.messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
    ...(params.veniceParameters ? { venice_parameters: params.veniceParameters } : {}),
  };
  if (params.maxCompletionTokens !== undefined && params.maxCompletionTokens > 0) {
    payload.max_completion_tokens = params.maxCompletionTokens;
  }

  let res: Response;
  try {
    res = await fetch(`${VENICE_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
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
        maxCompletionTokens: params.maxCompletionTokens ?? null,
        estPromptChars,
        prompt_tokens: data.usage?.prompt_tokens ?? null,
        completion_tokens: data.usage?.completion_tokens ?? null,
        choicesLen: data.choices?.length ?? 0,
        rawPreview,
      })}`,
    );
    const hint =
      fr === "length"
        ? "（可能觸發輸出長度上限 — 可縮短 prompt、或換模型）"
        : fr === "content_filter" || fr === "safety"
          ? "（內容被過濾）"
          : "";
    throw new Error(
      `Venice returned empty content（model=${model} finish_reason=${fr}${hint}）。如 prod 頁面較大，試用較細 URL 或換模型。`,
    );
  }

  if (data.usage) {
    usage.promptTokens = data.usage.prompt_tokens;
    usage.completionTokens = data.usage.completion_tokens;
    usage.totalTokens = data.usage.total_tokens;
  }

  return { text, usage };
}
