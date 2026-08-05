"use client"

import { useParams } from "next/navigation"
import { InvoiceCustomerViewPage } from "@/components/invoice/invoice-customer-view-page"

export default function InvoicePreviewPage() {
  const params = useParams()
  const invoiceId = typeof params.id === "string" ? params.id : ""

  return (
    <InvoiceCustomerViewPage key={invoiceId} mode="preview" invoiceId={invoiceId} />
  )
}
