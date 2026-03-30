"use client"

import { useState, type ReactNode } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { FileText, Loader2 } from "lucide-react"

type Props = {
  trigger: ReactNode
  noahScopeHeader: Record<string, string>
  /** Account whose statement is being exported (e.g. card/menu this was opened from). */
  accountCurrency: string
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function StatementDownloadDialog({ trigger, noahScopeHeader, accountCurrency }: Props) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(() => {
    const x = new Date()
    x.setDate(x.getDate() - 30)
    return toIsoDate(x)
  })
  const [to, setTo] = useState(() => toIsoDate(new Date()))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currency = accountCurrency.toUpperCase()

  const download = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetchWithSession("/api/noah/statements/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...noahScopeHeader,
        },
        body: JSON.stringify({ from, to, currency }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || `Request failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `easner-statement-${currency}-${from}-${to}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setOpen(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Download failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download statement</DialogTitle>
          <DialogDescription>
            Export a PDF of your account statement for the selected period.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            Account: <span className="font-medium text-foreground">{currency}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="stmt-from">From</Label>
              <input
                id="stmt-from"
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stmt-to">To</Label>
              <input
                id="stmt-to"
                type="date"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void download()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating…
              </>
            ) : (
              <>
                <FileText className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
