"use client"

import { Suspense } from "react"
import { useParams } from "next/navigation"
import { UserCase } from "@/components/case/user-case"
import { OfficePageSkeleton } from "@/components/data/office-page-skeleton"

function UserCaseInner() {
  const { userId } = useParams<{ userId: string }>()
  return <UserCase userId={String(userId || "")} />
}

export default function UserCasePage() {
  return (
    <Suspense fallback={<OfficePageSkeleton cards={0} />}>
      <UserCaseInner />
    </Suspense>
  )
}
