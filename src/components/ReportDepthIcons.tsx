/**
 * Inline SVGs replace Material Symbols font (no extra network request, same visual role).
 * Paths from Heroicons v2 (MIT) — decorative only; all user-facing text stays in ReportDepthSection.
 */
export function IconBolt({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M14.615 1.595a.75.75 0 01.359.852L12.982 9.75h7.268a.75.75 0 01.548 1.262l-10.5 11.25a.75.75 0 01-1.272-.71L11.018 12.5H3.75a.75.75 0 01-.548-1.262l10.5-11.25a.75.75 0 011.413-.393z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconChartBar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.375 2.625a.75.75 0 010 1.5H19.5a.75.75 0 01.75.75v11.25a.75.75 0 01-1.5 0V5.25a.75.75 0 00-.75-.75h-1.125a.75.75 0 010-1.5h3.75zM8.625 12a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0v-5.25a.75.75 0 01.75-.75zm4.5 0a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0v-5.25a.75.75 0 01.75-.75zm1.5-6a.75.75 0 01.75.75v11.25a.75.75 0 01-1.5 0V6.75a.75.75 0 01.75-.75zm-4.5 0a.75.75 0 01.75.75v8.25a.75.75 0 01-1.5 0V6.75a.75.75 0 01.75-.75zm-4.5 0a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V6.75a.75.75 0 01.75-.75z" />
    </svg>
  );
}

export function IconServerStack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.507 4.048A3 3 0 0 1 7.785 3h8.43a3 3 0 0 1 2.278 1.048l1.722 2.008A4.533 4.533 0 0 0 19.5 6h-15c-.243 0-.482.02-.715.056l1.722-2.008Z" />
      <path
        fillRule="evenodd"
        d="M1.5 10.5a3 3 0 0 1 3-3h15a3 3 0 1 1 0 6h-15a3 3 0 0 1-3-3Zm15 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm2.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.5 15a3 3 0 1 0 0 6h15a3 3 0 1 0 0-6h-15Zm11.25 3.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM19.5 18a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconCheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function IconLightbulbWatermark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .75a8.25 8.25 0 018.25 8.25c0 3.385-2.043 6.278-4.965 7.53a.75.75 0 00-.43.75v1.5a.75.75 0 01-.75.75h-4.5a.75.75 0 01-.75-.75v-1.5a.75.75 0 00-.43-.75C6.043 15.278 4 12.385 4 9A8.25 8.25 0 0112 .75zm0 18a.75.75 0 01.75.75v.75a.75.75 0 01-1.5 0v-.75a.75.75 0 01.75-.75z" />
    </svg>
  );
}
