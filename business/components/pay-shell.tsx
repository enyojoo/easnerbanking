"use client"

import type React from "react"
import Image from "next/image"
import Link from "next/link"
import { AppLockProvider } from "@/components/app-lock/app-lock-provider"
import { BRAND } from "@/components/brand/brand-constants"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useBusinessProfile } from "@/lib/use-business-profile"

export function PayShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth()
  const { tier1Complete, isLoading: profileLoading } = useBusinessProfile()
  const showTier1Banner = !profileLoading && !tier1Complete

  return (
    <AppLockProvider>
      <div className="flex min-h-[100dvh] min-h-screen flex-col bg-background">
        {showTier1Banner ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-sm text-amber-950 sm:px-6"
            role="status"
          >
            <span>Complete business verification to accept stablecoin payments.</span>
            <Link
              href="/settings?tab=business"
              className="font-semibold text-amber-950 underline underline-offset-2"
            >
              Verify
            </Link>
          </div>
        ) : null}

        <div className="flex flex-1 flex-col">
          <main className="flex flex-1 flex-col px-4 pt-4 sm:px-6 sm:pt-6">
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col sm:max-w-lg">{children}</div>
          </main>

          <footer className="mt-auto border-t border-border/60 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center sm:px-6">
            <div className="flex flex-col items-center gap-3">
              {/* Matches invoice PDF + invoice view link */}
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span>Powered by</span>
                <a
                  href="https://www.easner.com/business"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center"
                >
                  <Image
                    src={BRAND.logoBusiness}
                    alt="Easner Business"
                    width={180}
                    height={32}
                    unoptimized
                    className="h-5 w-auto object-contain sm:h-6"
                  />
                </a>
              </div>
              {user ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-0 px-1 py-0.5 text-[11px] font-normal leading-none text-muted-foreground hover:text-foreground"
                  onClick={() => void logout()}
                >
                  Sign out
                </Button>
              ) : (
                !isLoading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 px-1 py-0.5 text-[11px] font-normal leading-none"
                    asChild
                  >
                    <Link href="/auth/login?next=/pay">Sign in</Link>
                  </Button>
                )
              )}
            </div>
          </footer>
        </div>
      </div>
    </AppLockProvider>
  )
}
