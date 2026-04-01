"use client";

/**
 * 「無可比擬嘅分析深度」— matches Stitch-style bento (Unparalleled Depth).
 * Decorative chart bars / LCP display are illustrative only, not live data.
 */
import { memo } from "react";
import {
  IconBolt,
  IconChartBar,
  IconCheckCircle,
  IconLightbulbWatermark,
  IconServerStack,
} from "@/components/ReportDepthIcons";

/** Crowd = shorter greys; standout = full-height primary (fixed Tailwind heights so flex never collapses). */
const LCP_CROWD_BARS: { heightClass: string; standout?: boolean }[] = [
  { heightClass: "h-10" },
  { heightClass: "h-8" },
  { heightClass: "h-11" },
  { heightClass: "h-24", standout: true },
  { heightClass: "h-9" },
  { heightClass: "h-10" },
  { heightClass: "h-8" },
];

function ReportDepthSectionInner() {
  return (
    <section
      id="report-depth"
      className="scroll-mt-8 py-6 md:py-10"
      aria-labelledby="report-depth-heading"
    >
      <div className="mb-8 md:mb-10">
        <h2
          id="report-depth-heading"
          className="mb-4 font-headline text-3xl font-bold text-on-surface"
        >
          無可比擬嘅分析深度
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-secondary">
          唔係堆砌圖表——揀對搜尋同曝光有用嘅技術同營銷訊號，直接寫入你份報告。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        {/* Core Web Vitals / PageSpeed — md:col-span-8 */}
        <div className="group flex flex-col justify-between rounded-2xl bg-surface-container-lowest p-8 transition-shadow duration-300 hover:shadow-lg md:col-span-8 md:p-10">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <IconBolt className="mb-4 h-9 w-9 text-primary" aria-hidden />
              <h3 className="mb-2 font-headline text-2xl font-bold text-on-surface">
                技術表現與可見度
              </h3>
              <p className="max-w-sm text-secondary">
                用 Lighthouse 同 PageSpeed Insights 量度載入表現，同時檢查標題、描述、結構化資料等頁面設定。
              </p>
            </div>
            <div className="shrink-0 text-right sm:pl-4">
              <div className="font-headline text-5xl font-black text-primary">
                LCP
              </div>
              <div className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                載入速度 · 模擬測試
              </div>
            </div>
          </div>
          <figure className="mt-8 md:mt-12">
            <figcaption className="sr-only">
              示意：一眾網站入面，你嘅頁面會突出顯示；唔係實際分數。
            </figcaption>
            <div
              className="flex items-end gap-1 border-b border-outline-variant/20 pb-px sm:gap-1.5"
              role="img"
              aria-hidden
            >
              {LCP_CROWD_BARS.map((bar, i) => (
                <div
                  key={i}
                  className="flex min-w-[4px] flex-1 flex-col gap-1.5"
                >
                  <div className="flex h-24 flex-col justify-end">
                    {bar.standout ? (
                      <div
                        className={`w-full shrink-0 rounded-t-md bg-primary shadow-md ring-2 ring-primary/20 ${bar.heightClass}`}
                      />
                    ) : (
                      <div
                        className={`w-full shrink-0 rounded-t-sm border border-outline-variant/50 bg-surface-container-high ${bar.heightClass}`}
                      />
                    )}
                  </div>
                  <div className="flex min-h-[2.25rem] items-start justify-center px-0.5 text-center">
                    {bar.standout ? (
                      <span className="text-[9px] font-semibold leading-tight text-primary sm:text-[10px]">
                        你的網站
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </figure>
        </div>

        {/* Competitor — md:col-span-4 */}
        <div className="flex flex-col justify-between rounded-2xl bg-primary p-8 text-on-primary md:col-span-4 md:p-10">
          <div>
            <IconChartBar className="mb-4 h-9 w-9" aria-hidden />
            <h3 className="mb-2 font-headline text-2xl font-bold">
              市場與競爭
            </h3>
            <p className="text-on-primary/85">
              由搜尋結果揀可能嘅對手，再核實邊啲係真正官網，然後比較關鍵字同定位。
            </p>
          </div>
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-white/10 p-3">
              <span className="text-sm font-medium">對手 A</span>
              <span className="text-sm font-bold text-rose-300">明顯有短板</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/10 p-3">
              <span className="text-sm font-medium">對手 B</span>
              <span className="text-sm font-bold text-tertiary-fixed">
                值得借鏡
              </span>
            </div>
          </div>
        </div>

        {/* Technical audit — md:col-span-4 */}
        <div className="group rounded-2xl bg-surface-container-lowest p-8 transition-shadow duration-300 hover:shadow-lg md:col-span-4 md:p-10">
          <IconServerStack className="mb-4 h-9 w-9 text-tertiary" aria-hidden />
          <h3 className="mb-2 font-headline text-2xl font-bold text-on-surface">
            技術審核
          </h3>
          <p className="mb-8 text-secondary">
            檢查公開頁面嘅技術同內容結構，涵蓋常見 SEO 同可讀性要點。
          </p>
          <ul className="space-y-3">
            <li className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <IconCheckCircle className="h-[1.125rem] w-[1.125rem] shrink-0 text-tertiary" />
              搜尋引擎能否正常收錄
            </li>
            <li className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <IconCheckCircle className="h-[1.125rem] w-[1.125rem] shrink-0 text-tertiary" />
              結構化資料（JSON-LD）
            </li>
            <li className="flex items-center gap-3 text-sm font-medium text-on-surface">
              <IconCheckCircle className="h-[1.125rem] w-[1.125rem] shrink-0 text-tertiary" />
              圖片替代文字同連結
            </li>
          </ul>
        </div>

        {/* Actionable — md:col-span-8 */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-high p-8 md:col-span-8 md:p-10">
          <div className="relative z-10">
            <h3 className="mb-2 font-headline text-2xl font-bold text-on-surface">
              可執行嘅優先建議
            </h3>
            <p className="max-w-lg text-secondary">
              報告會列出要做嘅事，按影響力同工作量排好先後，交畀團隊逐項跟進。
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest px-5 py-4 shadow-sm">
                <div className="font-bold text-primary">優先 1</div>
                <div className="text-sm text-on-surface">改好標題同搜尋摘要</div>
              </div>
              <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest px-5 py-4 shadow-sm">
                <div className="font-bold text-tertiary">優先 2</div>
                <div className="text-sm text-on-surface">
                  內部連結同內容主題
                </div>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 right-0 opacity-10">
            <IconLightbulbWatermark className="h-[200px] w-[200px] text-on-surface" aria-hidden />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Memo: parent `ScanForm` re-renders often; this block is static. */
export const ReportDepthSection = memo(ReportDepthSectionInner);
