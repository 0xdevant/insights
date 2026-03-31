import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEnv, requireEnv } from "@/lib/env";
import { extractSeoFacts } from "@/lib/seo-extract";
import { fetchPageHtml } from "@/lib/seo-fetch";
import { buildPaidScanPrompt } from "@/lib/scan-prompts";
import { normalizeAndAssertSafeUrl } from "@/lib/ssrf";
import { resolveVeniceModel, veniceChatJson } from "@/lib/venice";

const bodySchema = z.object({
  urls: z.array(z.string().min(4)).min(1).max(10),
});

export async function POST(request: NextRequest) {
  const adminSecret = getEnv("CRAWLME_ADMIN_SECRET");
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin benchmarking disabled" }, { status: 403 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = (await request.json()) as unknown;
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const apiKey = requireEnv("VENICE_API_KEY");
  const model = resolveVeniceModel();

  const runs: Array<{
    url: string;
    ok: boolean;
    error?: string;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    cfRay?: string;
  }> = [];

  for (const rawUrl of parsed.data.urls) {
    try {
      const safe = await normalizeAndAssertSafeUrl(rawUrl);
      const page = await fetchPageHtml(safe.href);
      const facts = extractSeoFacts({
        url: safe.href,
        finalUrl: page.finalUrl,
        status: page.status,
        html: page.html,
        headerPairs: page.headerPairs,
      });
      const messages = buildPaidScanPrompt(facts, []);
      const { usage } = await veniceChatJson({
        apiKey,
        model,
        messages,
        veniceParameters: { include_venice_system_prompt: false },
      });
      runs.push({
        url: rawUrl,
        ok: true,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        },
        cfRay: usage.cfRay,
      });
    } catch (e) {
      runs.push({
        url: rawUrl,
        ok: false,
        error: e instanceof Error ? e.message : "error",
      });
    }
  }

  return NextResponse.json({ runs });
}
