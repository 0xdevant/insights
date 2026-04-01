import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { zhTW } from "@clerk/localizations";
import { shadcn } from "@clerk/themes";
import { JetBrains_Mono, Manrope, Noto_Sans_TC } from "next/font/google";
import Link from "next/link";
import { AuthHeader } from "@/components/AuthHeader";
import { SiteHeaderLogo } from "@/components/SiteHeaderLogo";
import { QUOTA_TRIAL_BODY } from "@/lib/quota-copy";
import { CLAWIFY_URL, SITE_URL } from "@/lib/site";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  preload: true,
});

const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-tc",
  weight: ["400", "500", "600"],
  preload: true,
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Insights — 免費分析你的網站表現",
  description: `SEO、市場、競爭對手同 AI 分析，加上可落手做嘅技術建議。貼上公開頁面網址拎報告。每次分析包括完整行動清單同優先建議。${QUOTA_TRIAL_BODY}歡迎幫手留 comment，並追蹤 Threads 同 Instagram（@pls.clawify）支持我哋。`,
  openGraph: {
    url: SITE_URL,
    siteName: "Insights",
    images: [
      {
        url: "/logo-header.webp",
        width: 400,
        height: 400,
        alt: "Insights",
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
  themeColor: "#f7f9fb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-HK">
      <body
        className={`${manrope.variable} ${notoSansTc.variable} ${jetbrains.variable} bg-background text-foreground antialiased`}
      >
        <ClerkProvider
          localization={zhTW}
          appearance={{
            baseTheme: shadcn,
          }}
        >
          <a href="#main-content" className="skip-link">
            跳至主要內容
          </a>
          <header className="sticky top-0 z-40 border-b border-outline-variant/20 bg-surface/85 shadow-ambient backdrop-blur-md">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
              <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <SiteHeaderLogo />
                <a
                  href={CLAWIFY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="insights-focus-ring inline-flex min-h-[44px] items-center text-[10px] font-normal tracking-wide text-secondary transition hover:text-on-surface"
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
