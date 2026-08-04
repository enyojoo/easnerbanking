"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { InvoiceCustomerViewPage } from "@/components/invoice/invoice-customer-view-page"

export default function InvoicePublicPage() {
  const params = useParams()
  const slugParts = useMemo(() => {
    const raw = params.slug
    if (raw == null) return [] as string[]
    return Array.isArray(raw) ? raw : [String(raw)]
  }, [params.slug])

  return <InvoiceCustomerViewPage mode="public" slugParts={slugParts} />
}
