"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

/** High-contrast controls for dark header: 登入 = readable ghost, 註冊 = solid amber. */
const btnBase =
  "inline-flex min-h-[44px] min-w-[5.75rem] items-center justify-center rounded-lg px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/80";

export function AuthHeader() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div
        className="h-11 w-[11rem] animate-pulse rounded-xl bg-white/[0.06]"
        aria-busy="true"
        aria-label="載入帳戶狀態"
      />
    );
  }

  if (isSignedIn) {
    return (
      <UserButton
        appearance={{
          elements: {
            avatarBox: "h-10 w-10 ring-2 ring-white/10",
            userButtonPopoverCard: "border border-white/10 bg-[#0c0d12] shadow-xl",
          },
        }}
      />
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-white/15 bg-zinc-950/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_0_rgba(0,0,0,0.4)]"
      role="navigation"
      aria-label="帳戶"
    >
      <SignInButton mode="modal">
        <button
          type="button"
          className={`${btnBase} text-zinc-100 ring-1 ring-white/10 ring-inset hover:bg-white/12 hover:text-white hover:ring-white/20`}
        >
          登入
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button
          type="button"
          className={`${btnBase} bg-amber-400 font-semibold text-zinc-950 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_1px_2px_rgba(0,0,0,0.35)] hover:bg-amber-300 hover:text-zinc-950`}
        >
          註冊
        </button>
      </SignUpButton>
    </div>
  );
}
