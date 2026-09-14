"use client"

import { Suspense } from "react"
import { useParams } from "next/navigation"
import { BusinessCase } from "@/components/case/business-case"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"

function BusinessCaseInner() {
  const { businessId } = useParams<{ businessId: string }>()
  return <BusinessCase businessId={String(businessId || "")} />
}

export default function BusinessCasePage() {
  return (
    <Suspense fallback={<OfficePageSkeleton cards={0} />}>
      <BusinessCaseInner />
    </Suspense>
  )
}
