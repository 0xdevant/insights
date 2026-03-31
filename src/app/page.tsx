import { ScanForm } from "@/components/ScanForm";
import { CLAWIFY_URL, CONTACT_EMAIL } from "@/lib/site";
import {
  INSTAGRAM_PROFILE_URL,
  THREADS_PROFILE_URL,
  THREADS_UNLOCK_POST_URL,
} from "@/lib/threads-constants";

export default function Home() {
  const mailto = `mailto:${CONTACT_EMAIL}`;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.1),_transparent_58%)]" />
      <main
        id="main-content"
        className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14"
      >
        <header className="space-y-3">
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            拎一份專業營銷報告
          </h1>
          <ul className="list-none space-y-2 pl-0 text-pretty text-lg leading-relaxed text-foreground-muted">
            <li>
              <span aria-hidden>🔍 </span>
              <strong className="font-medium text-white/90">SEO 分析</strong>
            </li>
            <li>
              <span aria-hidden>📊 </span>
              <strong className="font-medium text-white/90">市場＋競爭對手分析</strong>
            </li>
            <li>
              <span aria-hidden>🛠️ </span>
              仲會直接俾你「<strong className="font-medium text-white/90">可以落手做</strong>」嘅技術建議
            </li>
          </ul>
          <div
            className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs leading-snug text-amber-100/90"
            role="note"
          >
            <span className="shrink-0 font-medium text-amber-200/95">額度</span>
            <span className="text-amber-50/90">
              每次分析都會出<strong className="font-medium text-amber-100/95">完整行動清單</strong>
              同<strong className="font-medium text-amber-100/95">優先建議</strong>
              。<strong className="font-medium text-amber-100/95">體驗額度</strong>
              ：每個 IP 限做 1 次分析；全站每日總名額有限（先到先得）。
            </span>
          </div>
        </header>

        <ScanForm />

        <footer className="border-t border-white/10 pt-10 text-sm text-foreground-muted">
          <div className="mb-10 flex flex-wrap items-baseline gap-x-3 gap-y-2 border-b border-white/[0.06] pb-8 text-xs">
            <span className="shrink-0 text-foreground-subtle">想支持我哋：</span>
            <a
              href={THREADS_UNLOCK_POST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="crawlme-focus-ring rounded-sm font-medium text-amber-200/90 underline decoration-amber-400/30 underline-offset-2 hover:text-amber-100"
            >
              幫手留 comment
            </a>
            <span className="text-white/25">·</span>
            <span className="text-foreground-subtle">追蹤</span>
            <a
              href={THREADS_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="crawlme-focus-ring rounded-sm font-medium text-amber-200/90 underline decoration-amber-400/30 underline-offset-2 hover:text-amber-100"
            >
              Threads
            </a>
            <span className="text-white/25">·</span>
            <a
              href={INSTAGRAM_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="crawlme-focus-ring rounded-sm font-medium text-amber-200/90 underline decoration-amber-400/30 underline-offset-2 hover:text-amber-100"
            >
              Instagram
            </a>
            <span className="text-foreground-subtle">（@pls.clawify）</span>
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/80">
                聯絡我們
              </h2>
              <p className="text-xs leading-relaxed text-foreground-muted">
                有合作、媒體或產品問題，歡迎聯絡。
              </p>
              <div className="flex flex-col gap-1 text-xs">
                <a
                  href={mailto}
                  className="crawlme-focus-ring w-fit rounded-sm text-amber-200/90 underline decoration-amber-400/35 underline-offset-2 hover:text-amber-100"
                >
                  {CONTACT_EMAIL}
                </a>
                <a
                  href={CLAWIFY_URL}
                  className="crawlme-focus-ring w-fit rounded-sm font-mono text-[11px] text-foreground-subtle underline decoration-white/10 underline-offset-2 transition hover:text-foreground-muted"
                >
                  {CLAWIFY_URL}
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/80">
                免責聲明
              </h2>
              <p className="text-xs leading-relaxed text-foreground-subtle">
                CrawlMe 以自動化方式擷取你提供嘅公開網址內容，並整理成建議；
                <strong className="text-foreground-muted">
                  唔構成法律、財務、稅務或專業顧問意見
                </strong>
                ，亦<strong className="text-foreground-muted">不保證</strong>
                搜尋排名、流量、轉化率、銷售或任何商業結果。你應自行判斷同承擔使用建議嘅風險。服務可能會變更或中斷，恕不另行通知。
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
