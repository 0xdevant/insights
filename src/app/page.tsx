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
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(12,86,208,0.05),_transparent_60%)]" />
      <main
        id="main-content"
        className="relative mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-14"
      >
        <div className="flex w-full flex-col gap-4">
          <ScanForm />
        </div>

        <footer className="border-t border-outline-variant/20 pt-10 text-sm text-secondary">
          <div className="mb-10 flex flex-wrap items-baseline gap-x-3 gap-y-2 border-b border-outline-variant/15 pb-8 text-xs">
            <span className="shrink-0 text-on-surface-variant">想支持我哋：</span>
            <a
              href={THREADS_UNLOCK_POST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="insights-focus-ring rounded-sm font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:text-primary-container"
            >
              幫手留 comment
            </a>
            <span className="text-outline-variant">·</span>
            <span className="text-on-surface-variant">追蹤</span>
            <a
              href={THREADS_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="insights-focus-ring rounded-sm font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:text-primary-container"
            >
              Threads
            </a>
            <span className="text-outline-variant">·</span>
            <a
              href={INSTAGRAM_PROFILE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="insights-focus-ring rounded-sm font-medium text-primary underline decoration-primary/30 underline-offset-2 hover:text-primary-container"
            >
              Instagram
            </a>
            <span className="text-on-surface-variant">（@pls.clawify）</span>
          </div>
          <div className="grid gap-10 sm:grid-cols-2">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-on-surface">
                聯絡我們
              </h2>
              <p className="text-xs leading-relaxed text-secondary">
                有合作、媒體或產品問題，歡迎聯絡。
              </p>
              <div className="flex flex-col gap-1 text-xs">
                <a
                  href={mailto}
                  className="insights-focus-ring w-fit rounded-sm text-primary underline decoration-primary/35 underline-offset-2 hover:text-primary-container"
                >
                  {CONTACT_EMAIL}
                </a>
                <a
                  href={CLAWIFY_URL}
                  className="insights-focus-ring w-fit rounded-sm font-mono text-[11px] text-on-surface-variant underline decoration-outline-variant/40 underline-offset-2 transition hover:text-secondary"
                >
                  {CLAWIFY_URL}
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-on-surface">
                免責聲明
              </h2>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                Insights 以自動化方式擷取你提供嘅公開網址內容，並整理成建議；
                <strong className="text-secondary">
                  唔構成法律、財務、稅務或專業顧問意見
                </strong>
                ，亦<strong className="text-secondary">不保證</strong>
                搜尋排名、流量、轉化率、銷售或任何商業結果。你應自行判斷同承擔使用建議嘅風險。服務可能會變更或中斷，恕不另行通知。
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
