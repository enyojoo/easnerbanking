"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"

/** Legacy URL: `/send/status?id=ETID...` — redirect to unified transaction detail. */
function SendStatusRedirect() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const id = searchParams.get("id")?.trim()
    if (id) {
      router.replace(transactionWebDetailPath(id))
    } else {
      router.replace("/transactions")
    }
  }, [searchParams, router])

  return (
    <div className="mx-auto max-w-2xl py-12 text-center text-sm text-muted-foreground">
      Opening transaction…
    </div>
  )
}

export default function TransferStatusPage() {
  return (
    <Suspense fallback={null}>
      <SendStatusRedirect />
    </Suspense>
  )
}
