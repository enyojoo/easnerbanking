"use client"

import { usePathname } from "next/navigation"
import { AuthSessionRedirect } from "@/components/auth/auth-session-redirect"
import { BusinessLogo } from "@/components/brand/business-logo"
import { isHostedOnboardingCompletePath } from "@/lib/auth/hosted-onboarding-complete"

export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isHostedOnboardingCompletePath(pathname)) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-background">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex justify-center">
        <BusinessLogo size="lg" href="/" priority />
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <AuthSessionRedirect>{children}</AuthSessionRedirect>
      </div>
    </div>
  )
}
