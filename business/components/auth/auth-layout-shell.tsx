"use client"

import { usePathname } from "next/navigation"
import { BusinessLogo } from "@/components/brand/business-logo"
import { AuthSessionRedirect } from "@/components/auth/auth-session-redirect"

/** Hosted Noah completion – no auth marketing chrome (loaded inside iframe or in-app browser). */
function isNoahCompletePath(pathname: string | null): boolean {
  return pathname === "/auth/noah-complete"
}

export function AuthLayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (isNoahCompletePath(pathname)) {
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
