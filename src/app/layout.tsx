import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { zhTW } from "@clerk/localizations";
import { dark } from "@clerk/themes";
import { DM_Sans, JetBrains_Mono, Noto_Sans_TC } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { AuthHeader } from "@/components/AuthHeader";
import { CLAWIFY_URL, SITE_URL } from "@/lib/site";
import "./globals.css";

/** Body stack leads with Noto — defer Latin fallback to cut critical font requests on first paint. */
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  // 400/500/600 cover body + Tailwind medium/semibold; skip 700 to save bytes
  weight: ["400", "500", "600"],
  preload: false,
});

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  weight: ["400", "500", "600"],
  preload: true,
});

/** Mono only for `.font-mono` / tabular UI — defer until after primary text (smaller critical path). */
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "CrawlMe — 拎一份專業營銷報告",
  description:
    "SEO、市場同競爭對手分析，加上可落手做嘅技術建議。貼上公開頁面網址拎報告；每次有完整行動清單同優先建議。體驗額度：每 IP 限 1 次、全站每日總名額有限。歡迎幫手留 comment，並追蹤 Threads 同 Instagram（@pls.clawify）支持我哋。",
  openGraph: {
    url: SITE_URL,
    siteName: "CrawlMe",
    images: [
      {
        url: "/logo-header.webp",
        width: 400,
        height: 400,
        alt: "CrawlMe",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/logo-header.webp"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#07080b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body
        className={`${dmSans.variable} ${notoSansTc.variable} ${jetbrains.variable} antialiased`}
      >
        <ClerkProvider
          localization={zhTW}
          appearance={{
            /** Clerk’s stock dark theme — default modal sizing & layout (no custom element overrides). */
            baseTheme: dark,
          }}
        >
          <a href="#main-content" className="skip-link">
            跳至主要內容
          </a>
          <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#07080b]/95">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
              <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <Link
                  href="/"
                  prefetch={false}
                  className="crawlme-focus-ring inline-flex min-h-[44px] items-center gap-2 px-1 py-1.5 transition-opacity hover:opacity-95"
                >
                  <Image
                    src="/logo-header.webp"
                    alt=""
                    width={400}
                    height={400}
                    priority
                    sizes="(max-width: 640px) 40px, 44px"
                    className="h-auto w-auto max-h-10 object-contain sm:max-h-11"
                  />
                  <span className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                    CrawlMe
                  </span>
                </Link>
                <a
                  href={CLAWIFY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="crawlme-focus-ring inline-flex min-h-[44px] items-center text-[10px] font-normal tracking-wide text-foreground-subtle transition hover:text-foreground-muted"
                >
                  Powered by Clawify
                </a>
              </div>
              <AuthHeader />
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
