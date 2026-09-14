"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"
import { usePlatformAccess } from "@/hooks/use-platform-access"
import { BusinessLogo } from "@/components/brand/business-logo"

const SIGNUP_PATHS = new Set(["/auth/signup"])

export function PlatformAccessGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const access = usePlatformAccess("business_web")

  if (access.data?.maintenance) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <BusinessLogo size="lg" href="/" priority />
        <h1 className="mt-8 text-xl font-semibold text-gray-900">We’ll be back shortly</h1>
        <p className="mt-2 max-w-md text-center text-sm text-gray-600">{access.data.maintenanceMessage}</p>
      </div>
    )
  }

  if (access.data && !access.data.registration && pathname && SIGNUP_PATHS.has(pathname)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 py-12">
        <BusinessLogo size="lg" href="/" priority />
        <h1 className="mt-8 text-xl font-semibold text-gray-900">Registration closed</h1>
        <p className="mt-2 max-w-md text-center text-sm text-gray-600">{access.data.registrationMessage}</p>
      </div>
    )
  }

  return <>{children}</>
}
