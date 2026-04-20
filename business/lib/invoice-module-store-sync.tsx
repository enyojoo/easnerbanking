"use client"

import { useEffect } from "react"
import { useInvoicesList } from "@/hooks/queries/use-invoices"
import { replaceInvoiceStore } from "@/lib/invoice-store"

/** Keeps the legacy invoice module store aligned with the TanStack Query list cache. */
export function InvoiceModuleStoreSync() {
  const { data } = useInvoicesList()
  useEffect(() => {
    replaceInvoiceStore(data ?? [])
  }, [data])
  return null
}
