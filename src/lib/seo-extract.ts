export type SeoFacts = {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  htmlLang: string | null;
  charset: string | null;
  viewport: string | null;
  ogTitle: string | null;
  /** Brand / site label when present (often cleaner than the page title). */
  ogSiteName: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  h1: string[];
  h2Sample: string[];
  headingCounts: { h1: number; h2: number; h3: number };
  imagesMissingAlt: number;
  imagesTotal: number;
  internalLinksApprox: number;
  externalLinksApprox: number;
  hasJsonLd: boolean;
  jsonLdTypes: string[];
  approximateWordCount: number;
  /** Derived from final URL — snapshot only, not a full TLS audit. */
  isHttps: boolean;
  /** HTTP response header, if present — complements HTML robots meta. */
  xRobotsTag: string | null;
  /** Presence flags from response headers (helpful for technical SEO checklist). */
  securityHeadersPresent: {
    hsts: boolean;
    csp: boolean;
    xFrameOptions: boolean;
  };
  responseHeaders: Record<string, string>;
};

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
}

function extractMetaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["'][^>]*>`,
    "i",
  );
  let m = html.match(re);
  if (!m) m = html.match(re2);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function extractMetaProperty(html: string, prop: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["'][^>]*>`,
    "i",
  );
  let m = html.match(re);
  if (!m) m = html.match(re2);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function extractLinkRel(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["'][^>]*>`,
    "i",
  );
  const re2 = new RegExp(
    `<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${rel}["'][^>]*>`,
    "i",
  );
  let m = html.match(re);
  if (!m) m = html.match(re2);
  return m?.[1]?.trim() ?? null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function extractLang(html: string): string | null {
  const m = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
  return m?.[1]?.trim() ?? null;
}

function extractCharset(html: string): string | null {
  const m = html.match(/<meta[^>]+charset=["']?([^"'>\s]+)/i);
  return m?.[1]?.trim() ?? null;
}

function collectTagTexts(html: string, tag: "h1" | "h2" | "h3"): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (text) out.push(text);
  }
  return out;
}

function countTags(html: string, tag: string): number {
  const re = new RegExp(`<${tag}\\b`, "gi");
  return (html.match(re) ?? []).length;
}

function extractJsonLdTypes(html: string): { hasJsonLd: boolean; types: string[] } {
  const types: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let has = false;
  while ((m = re.exec(html)) !== null) {
    has = true;
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const pushType = (o: Record<string, unknown>) => {
        const t = o["@type"];
        if (typeof t === "string") types.push(t);
        else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.push(x);
      };
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item === "object") pushType(item as Record<string, unknown>);
        }
      } else if (data && typeof data === "object") {
        pushType(data as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }
  }
  return { hasJsonLd: has, types: [...new Set(types)].slice(0, 12) };
}

function countImagesAlt(html: string): { total: number; missingAlt: number } {
  const re = /<img\b[^>]*>/gi;
  let total = 0;
  let missingAlt = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    total++;
    const tag = m[0];
    if (!/\balt=/.test(tag)) missingAlt++;
    else {
      const am = tag.match(/\balt=["']([^"']*)["']/i);
      if (am && am[1].trim() === "") missingAlt++;
    }
  }
  return { total, missingAlt };
}

function approximateLinkCounts(html: string, siteHost: string): { internal: number; external: number } {
  const re = /<a\b[^>]+href=["']([^"']+)["']/gi;
  let internal = 0;
  let external = 0;
  let m: RegExpExecArray | null;
  const hostLower = siteHost.toLowerCase();
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) continue;
    try {
      const u = new URL(href, `https://${hostLower}`);
      if (u.hostname.toLowerCase() === hostLower) internal++;
      else external++;
    } catch {
      /* ignore */
    }
  }
  return { internal, external };
}

export function extractSeoFacts(input: {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
  headerPairs: [string, string][];
}): SeoFacts {
  const { url, finalUrl, status, html, headerPairs } = input;
  const parsed = new URL(finalUrl);
  const siteHost = parsed.hostname;

  const headingCounts = {
    h1: countTags(html, "h1"),
    h2: countTags(html, "h2"),
    h3: countTags(html, "h3"),
  };
  const h1 = collectTagTexts(html, "h1").slice(0, 8);
  const h2All = collectTagTexts(html, "h2");
  const plain = stripScriptsAndStyles(html);
  const words = plain
    .replace(/<[^>]+>/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const { hasJsonLd, types: jsonLdTypes } = extractJsonLdTypes(html);
  const imgs = countImagesAlt(html);
  const links = approximateLinkCounts(html, siteHost);

  const headers: Record<string, string> = {};
  for (const [k, v] of headerPairs) {
    headers[k.toLowerCase()] = v;
  }

  const hsts = headers["strict-transport-security"];
  const isHttps = finalUrl.toLowerCase().startsWith("https:");
  const xRobotsRaw = headers["x-robots-tag"] ?? null;

  return {
    url,
    finalUrl,
    status,
    contentType: headers["content-type"] ?? null,
    title: extractTitle(html),
    metaDescription: extractMetaContent(html, "description"),
    canonical: extractLinkRel(html, "canonical"),
    robotsMeta: extractMetaContent(html, "robots"),
    htmlLang: extractLang(html),
    charset: extractCharset(html),
    viewport: extractMetaContent(html, "viewport"),
    ogTitle: extractMetaProperty(html, "og:title"),
    ogSiteName: extractMetaProperty(html, "og:site_name"),
    ogDescription: extractMetaProperty(html, "og:description"),
    ogImage: extractMetaProperty(html, "og:image"),
    twitterCard: extractMetaContent(html, "twitter:card") ?? extractMetaProperty(html, "twitter:card"),
    h1,
    h2Sample: h2All.slice(0, 12),
    headingCounts,
    imagesMissingAlt: imgs.missingAlt,
    imagesTotal: imgs.total,
    internalLinksApprox: links.internal,
    externalLinksApprox: links.external,
    hasJsonLd,
    jsonLdTypes,
    approximateWordCount: words.length,
    isHttps,
    xRobotsTag: xRobotsRaw,
    securityHeadersPresent: {
      hsts: Boolean(hsts && /max-age=/i.test(hsts)),
      csp: Boolean(headers["content-security-policy"]),
      xFrameOptions: Boolean(headers["x-frame-options"]),
    },
    responseHeaders: headers,
  };
}
