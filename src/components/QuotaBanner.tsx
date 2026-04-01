"use client";

import {
  QUOTA_TRIAL_ARIA_LABEL,
  QUOTA_TRIAL_BODY,
  QUOTA_TRIAL_LABEL,
} from "@/lib/quota-copy";

/** Muted trial note — below marketing hero only (see `ScanForm`). */
export function QuotaTrialSubtleNote() {
  return (
    <div
      className="mx-auto max-w-3xl border-t border-outline-variant/10 px-2 pt-6 text-center sm:px-0"
      role="note"
      aria-label={QUOTA_TRIAL_ARIA_LABEL}
    >
      <p className="text-[11px] leading-relaxed text-foreground-muted sm:text-xs">
        <span className="font-medium text-on-surface-variant">{QUOTA_TRIAL_LABEL}</span>
        <span className="mx-1.5 text-outline-variant/80" aria-hidden>
          ·
        </span>
        <span>{QUOTA_TRIAL_BODY}</span>
      </p>
    </div>
  );
}
