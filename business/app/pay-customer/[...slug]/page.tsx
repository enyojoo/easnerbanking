"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { PaymentLinkPayPanel } from "@/components/pay/payment-link-pay-panel"

export default function PayCustomerSlugPage() {
  const params = useParams()
  const slugParts = useMemo(() => {
    const raw = params.slug
    if (raw == null) return [] as string[]
    return Array.isArray(raw) ? raw : [String(raw)]
  }, [params.slug])

  return <PaymentLinkPayPanel key={slugParts.join("/")} slugParts={slugParts} />
}
