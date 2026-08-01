"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAddInvoice } from "@/hooks/mutations/use-invoices"
import { generateInvoiceId, formatInvoiceNumberFromClientId } from "@/lib/invoice-id"
import type { Invoice } from "@/lib/b2b/types"
import { toast } from "sonner"
import { invoiceActionBtnClass } from "@/lib/invoices/invoice-action-button-classes"
import { SectionHeader } from "@/components/copy/section-header"
import { INVOICE_IMPORT_SECTION_COPY } from "@/lib/copy/business-ui-copy"

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const cols = line.split(",")
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim().replace(/^"|"$/g, "")
    })
    return row
  })
}

export default function ImportInvoicesPage() {
  const addInvoice = useAddInvoice()
  const [preview, setPreview] = useState<Invoice[]>([])
  const [importing, setImporting] = useState(false)

  const onFile = async (file: File) => {
    const text = await file.text()
    const rows = parseCsv(text)
    const drafts: Invoice[] = rows.map((row) => {
      const id = generateInvoiceId()
      const now = new Date().toISOString()
      const amount = parseFloat(row.amount || "0") || 0
      return {
        id,
        invoiceNumber: formatInvoiceNumberFromClientId(id),
        customerName: row.customer_name || row.name || "Customer",
        customerEmail: row.customer_email || row.email || "",
        total: amount,
        currency: (row.currency || "USD").toUpperCase(),
        status: "draft",
        dueDate: row.due_date || now.slice(0, 10),
        createdDate: now,
        finalizedDate: null,
        frequency: null,
        lineItems: [
          {
            description: row.description || "Imported line",
            quantity: 1,
            unitPrice: amount,
            amount,
          },
        ],
      }
    })
    setPreview(drafts)
  }

  const importAll = async () => {
    setImporting(true)
    try {
      for (const inv of preview) {
        await addInvoice.mutateAsync(inv)
      }
      toast.success(`Imported ${preview.length} invoice(s)`)
      setPreview([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed")
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Import invoices</h1>
        <Link href="/invoices">
          <Button variant="outline">Back</Button>
        </Link>
      </div>
      <Card>
        <CardHeader>
          <SectionHeader
            title="Upload CSV"
            description={INVOICE_IMPORT_SECTION_COPY.upload}
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Columns: customer_name, customer_email, amount, currency, due_date (optional description)
          </p>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
          />
          {preview.length > 0 ? (
            <>
              <p className="text-sm">{preview.length} invoice(s) ready to import as drafts.</p>
              <Button className={invoiceActionBtnClass.import} onClick={() => void importAll()} disabled={importing}>
                {importing ? "Importing…" : "Import all"}
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
