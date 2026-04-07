"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatDate } from "@/lib/utils"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { toast } from "sonner"
import { Plus, ImageIcon, FileText, Pencil, Archive, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { dataCache, CACHE_KEYS } from "@/lib/cache"
import { useAutopayoutCached, type AutopayoutListRow } from "@/hooks/use-autopayout-cached"

export default function QrPayPage() {
  const { user } = useAuth()
  const { data: rows, loading, refetch } = useAutopayoutCached()

  const [editRow, setEditRow] = useState<AutopayoutListRow | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [savingEdit, setSavingEdit] = useState(false)

  const bumpList = useCallback(() => {
    if (user?.id) {
      dataCache.invalidate(CACHE_KEYS.AUTOPAYOUT_LIST(user.id))
    }
    void refetch()
  }, [user?.id, refetch])

  const downloadPlacard = async (id: string, format: "png" | "pdf") => {
    const res = await fetchWithSession(`/api/autopayout/${encodeURIComponent(id)}/placard?format=${format}`)
    const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
    if (!res.ok || !body.url) {
      toast.error(body.error || "Download failed.")
      return
    }
    window.open(body.url, "_blank", "noopener,noreferrer")
  }

  const generatePlacard = async (id: string) => {
    const res = await fetchWithSession(`/api/autopayout/${encodeURIComponent(id)}/placard`, {
      method: "POST",
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; cached?: boolean }
    if (!res.ok) {
      toast.error(body.error || "Could not generate placard.")
      return
    }
    toast.success(body.cached ? "Placard is up to date." : "Placard generated.")
    bumpList()
  }

  const archiveRow = async (id: string) => {
    const res = await fetchWithSession(`/api/autopayout/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      toast.error(body.error || "Archive failed.")
      return
    }
    toast.success("Archived.")
    bumpList()
  }

  const saveEdit = async () => {
    if (!editRow) return
    setSavingEdit(true)
    try {
      const res = await fetchWithSession(`/api/autopayout/${encodeURIComponent(editRow.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim() || null }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not save.")
        return
      }
      toast.success("Saved.")
      setEditRow(null)
      bumpList()
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-4 border-b bg-background pb-4">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">QR Pay</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Accept in-person stablecoin payments using QR code counter placards. Customer deposits settle through
              automated payout to the bank account you select in Setup payout.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="gap-2" asChild>
              <Link href="/qr-pay/create">
                <Plus className="h-4 w-4" />
                Create Placard
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ?
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          : rows.length === 0 ?
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-lg font-semibold">Your counter, one scan away</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Create your first placard to automate stablecoin deposits into your bank account or mobile money.
              </p>
            </div>
          : <div className="min-h-0 overflow-auto">
              <table className="w-full min-w-[960px] table-fixed">
                <thead className="border-b">
                  <tr>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Created</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Recipient</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Asset</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Status</th>
                    <th className="p-4 text-left text-xs font-medium text-muted-foreground">Placard</th>
                    <th className="p-4 text-right text-xs font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="whitespace-nowrap p-4 text-sm text-muted-foreground">{formatDate(r.created_at)}</td>
                      <td className="min-w-0 p-4">
                        <span className="block truncate text-sm font-medium">
                          {r.recipient_summary?.full_name || "—"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {r.label || "No label"}
                        </span>
                      </td>
                      <td className="min-w-0 p-4">
                        <span className="text-sm">{r.crypto_currency}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.network}</span>
                      </td>
                      <td className="p-4 text-sm capitalize">{r.status.replace(/_/g, " ")}</td>
                      <td className="whitespace-nowrap p-4 text-xs text-muted-foreground">
                        {r.placard_generated_at ?
                          formatDate(r.placard_generated_at)
                        : "—"}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            disabled={r.status !== "awaiting_deposit"}
                            onClick={() => void generatePlacard(r.id)}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Placard
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            disabled={!r.placard_generated_at}
                            onClick={() => void downloadPlacard(r.id, "png")}
                          >
                            <ImageIcon className="h-3.5 w-3.5" />
                            PNG
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1"
                            disabled={!r.placard_generated_at}
                            onClick={() => void downloadPlacard(r.id, "pdf")}
                          >
                            <FileText className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1"
                            onClick={() => {
                              setEditRow(r)
                              setEditLabel(r.label || "")
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-destructive"
                            onClick={() => void archiveRow(r.id)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </CardContent>
      </Card>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit label</DialogTitle>
          </DialogHeader>
          <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
