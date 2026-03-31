import { SITE_URL } from "@/lib/site";

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 12_000;

export type FetchPageResult = {
  finalUrl: string;
  status: number;
  html: string;
  headerPairs: [string, string][];
};

function mergeChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Flatten message + optional Error.cause chain for matching low-level network errors. */
function errorFingerprint(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.name, err.message];
  let c: unknown = err.cause;
  let depth = 0;
  while (c instanceof Error && depth++ < 5) {
    parts.push(c.name, c.message);
    c = c.cause;
  }
  return parts.join(" ");
}

/**
 * Maps fetch/timeout/TLS failures to a single Cantonese message for API JSON responses.
 * Keeps scan errors understandable when the crawler cannot reach the target host.
 */
function mapFetchFailureToUserMessage(err: unknown): string {
  if (!(err instanceof Error)) {
    return "擷取頁面時發生錯誤，請稍後再試。";
  }
  const fp = errorFingerprint(err);
  if (err.name === "AbortError" || /aborted|timeout/i.test(fp)) {
    return "擷取頁面逾時，請確認網站可正常開啟或稍後再試。";
  }
  if (
    /fetch failed|Failed to fetch|ECONNREFUSED|ENOTFOUND|getaddrinfo|ECONNRESET|ETIMEDOUT|certificate|SSL|TLS|UNABLE_TO_VERIFY|EPROTO|network|socket|connect/i.test(
      fp,
    )
  ) {
    return "無法連線至目標網站，請檢查網址是否正確、網站是否在線，或稍後再試。";
  }
  return "無法連線至目標網站，請檢查網址是否正確、網站是否在線，或稍後再試。";
}

export async function fetchPageHtml(targetUrl: string): Promise<FetchPageResult> {
  let current = targetUrl;
  let lastStatus = 0;

  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": `CrawlMeBot/1.0 (+${SITE_URL})`,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });
    } catch (e) {
      throw new Error(mapFetchFailureToUserMessage(e));
    } finally {
      clearTimeout(t);
    }

    lastStatus = res.status;

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error("伺服器回傳無效重新導向，請試用其他網址。");
      }
      current = new URL(loc, current).toString();
      continue;
    }

    if (!res.ok) {
      throw new Error(
        `目標網址回傳錯誤（HTTP ${res.status}）。請確認網址可公開瀏覽。`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("無法讀取頁面內容。");

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          reader.cancel().catch(() => {});
          throw new Error("頁面過大，無法擷取（上限約 2MB）。");
        }
        chunks.push(value);
      }
    }

    const merged = mergeChunks(chunks);
    const html = new TextDecoder("utf-8").decode(merged);

    const headerPairs: [string, string][] = [];
    res.headers.forEach((v, k) => headerPairs.push([k, v]));

    return {
      finalUrl: current,
      status: lastStatus,
      html,
      headerPairs,
    };
  }

  throw new Error("重新導向次數過多，請使用更直接嘅網址。");
}
