"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";

const btnBase =
  "inline-flex min-h-[44px] min-w-[5.75rem] items-center justify-center rounded-xl px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/50";

export function AuthHeader() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <div
        className="h-11 w-[11rem] animate-pulse rounded-xl bg-surface-container-low"
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
            avatarBox: "h-10 w-10 ring-2 ring-outline-variant/20",
            userButtonPopoverCard:
              "border border-outline-variant/20 bg-surface-container-lowest shadow-ambient",
          },
        }}
      />
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl border border-outline-variant/25 bg-surface-container-low/50 p-1"
      role="navigation"
      aria-label="帳戶"
    >
      <SignInButton mode="modal">
        <button
          type="button"
          className={`${btnBase} text-secondary hover:bg-surface-container-high`}
        >
          登入
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button
          type="button"
          className={`${btnBase} bg-gradient-to-b from-primary to-primary-container font-semibold text-on-primary shadow-sm hover:opacity-95`}
        >
          註冊
        </button>
      </SignUpButton>
    </div>
  );
}
