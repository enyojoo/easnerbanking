"use client"

import type React from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import Link from "next/link"
import { Landmark } from "lucide-react"
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

function DashboardShellLoadingState() {
  return (
    <div className="min-h-screen bg-background">
      <div className="fixed left-0 top-0 h-screen w-64 border-r bg-sidebar">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-2 px-3 py-6">
          <div className="h-11 animate-pulse rounded-md bg-muted/80" />
          <div className="h-11 animate-pulse rounded-md bg-muted/70" />
          <div className="h-11 animate-pulse rounded-md bg-muted/60" />
          <div className="h-11 animate-pulse rounded-md bg-muted/50" />
          <div className="h-11 animate-pulse rounded-md bg-muted/40" />
        </div>
      </div>

      <div className="ml-64 flex min-h-screen flex-col">
        <header className="fixed left-64 right-0 top-0 z-30 flex h-16 min-h-16 items-center justify-between border-b bg-background px-6">
          <div className="space-y-2">
            <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
            <div className="h-6 w-56 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
          </div>
        </header>

        <main className="flex-1 px-6 pb-8 pt-20">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            <div className="max-w-md space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Secure sign-in complete</p>
              <h1 className="text-2xl font-semibold tracking-tight">Getting your account ready</h1>
              <p className="text-sm text-muted-foreground">
                Preparing your accounts, business profile, and permissions.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="space-y-4">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-14 w-64 animate-pulse rounded bg-muted" />
                  <div className="grid grid-cols-3 gap-4 pt-4">
                    <div className="h-20 animate-pulse rounded-xl bg-muted/80" />
                    <div className="h-20 animate-pulse rounded-xl bg-muted/70" />
                    <div className="h-20 animate-pulse rounded-xl bg-muted/60" />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="space-y-3">
                  <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-12 animate-pulse rounded-xl bg-muted/80" />
                  <div className="h-12 animate-pulse rounded-xl bg-muted/70" />
                  <div className="h-12 animate-pulse rounded-xl bg-muted/60" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <div className="space-y-3">
                <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/80" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/70" />
                <div className="h-16 animate-pulse rounded-xl bg-muted/60" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export function DashboardShell({ children, mainClassName = "", constrained = false }: DashboardShellProps) {
  const { user, isLoading, logout } = useAuth()
  const router = useRouter()
  const {
    name: businessName,
    ownerName,
    isLoading: profileLoading,
    hasData: hasBusinessProfileData,
    tier1Complete,
  } = useBusinessProfile()
  const { avatarUrl: profileImageUrl } = usePersonalProfileAvatar()
  const showTier1Banner = !profileLoading && !tier1Complete
  const showWorkspaceLoadingState = !isLoading && !!user && profileLoading && !hasBusinessProfileData

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/auth/login")
    }
  }, [user, isLoading, router])

  if (isLoading || !user) {
    return null
  }

  if (showWorkspaceLoadingState) {
    return <DashboardShellLoadingState />
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
