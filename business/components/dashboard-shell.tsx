"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Link from "next/link"
import { DashboardNav } from "@/components/dashboard-nav"
import { BusinessDropdown } from "@/components/business-dropdown"
import { BusinessOnboardingDialog } from "@/components/business-onboarding-dialog"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { usePersonalProfileAvatar } from "@/lib/use-personal-profile-avatar"
import { cn } from "@/lib/utils"

interface DashboardShellProps {
  children: React.ReactNode
  /** Extra class for main content (e.g. overflow-y-auto) */
  mainClassName?: string
  /** Use max-width constraint like dashboard (max-w-6xl) */
  constrained?: boolean
}

export function DashboardShell({ children, mainClassName = "", constrained = false }: DashboardShellProps) {
  const { user, isLoading, logout } = useAuth()
  const router = useRouter()
  const {
    name: businessName,
    ownerName,
    isLoading: profileLoading,
    tier1Complete,
  } = useBusinessProfile()
  const { avatarUrl: profileImageUrl } = usePersonalProfileAvatar()
  const showTier1Banner = !profileLoading && !tier1Complete

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login")
    }
  }, [user, isLoading, router])

  if (isLoading || !user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <BusinessOnboardingDialog />
      <DashboardNav />
      <div className="ml-64 flex flex-col min-h-screen">
        <header className="fixed top-0 left-64 right-0 z-30 flex h-16 min-h-16 items-center justify-end gap-4 border-b bg-background px-6">
          {profileLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <BusinessDropdown
              businessName={businessName}
              profileImageUrl={profileImageUrl}
              adminName={ownerName || "Admin"}
              adminEmail={user?.email || ""}
              onSignOut={logout}
              variant="header"
            />
          )}
        </header>
        {showTier1Banner ? (
          <div
            className="fixed top-16 left-64 right-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 bg-amber-50/90 px-6 py-2.5 text-sm text-amber-950 backdrop-blur-sm"
            role="status"
          >
            <span>
              Complete business verification to unlock payments and bank accounts for your organization.
            </span>
            <Link href="/settings?tab=business" className="font-semibold text-amber-950 underline underline-offset-2">
              Verify
            </Link>
          </div>
        ) : null}
        <main
          className={cn(
            "flex-1 px-6 pb-8",
            showTier1Banner ? "pt-[6.5rem]" : "pt-20",
            constrained ? "w-full max-w-6xl mx-auto" : "w-full",
            mainClassName,
          )}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
