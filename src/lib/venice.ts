const VENICE_BASE = "https://api.venice.ai/api/v1";

/** Default when `VENICE_MODEL` is unset — GPT-5.4 Mini (Venice). Override if needed. */
export const DEFAULT_VENICE_MODEL = "openai-gpt-54-mini";

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

export async function veniceChatJson(params: {
  apiKey: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  veniceParameters?: Record<string, unknown>;
}): Promise<{ text: string; usage: VeniceUsage }> {
  const res = await fetch(`${VENICE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${params.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      ...(params.veniceParameters
        ? { venice_parameters: params.veniceParameters }
        : {}),
    }),
  });

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
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Venice returned empty content");

  if (data.usage) {
    usage.promptTokens = data.usage.prompt_tokens;
    usage.completionTokens = data.usage.completion_tokens;
    usage.totalTokens = data.usage.total_tokens;
  }

  return { text, usage };
}
