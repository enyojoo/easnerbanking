"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { OfficeDashboardLayout } from "@/components/layout/office-dashboard-layout"

export default function KycRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/compliance?tab=documents")
  }, [router])

  return (
    <OfficeDashboardLayout>
      <div className="p-6 text-sm text-muted-foreground">Redirecting to KYC & Compliance…</div>
    </OfficeDashboardLayout>
  )
}
