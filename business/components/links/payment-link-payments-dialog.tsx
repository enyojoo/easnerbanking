"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Receipt } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { fetchWithSession } from "@/lib/fetch-with-session"
import type { PaymentLinkListRow } from "@/hooks/use-payment-links"
import { formatCurrency } from "@/lib/utils"

type LinkPayment = {
  settlementId: string
  paidAt: string
  grossCents: number
  netCents: number
  currency: string
  phase: string
  customerEmail: string | null
}

function phaseBadge(phase: string): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  switch (phase) {
    case "credited":
      return { label: "In your balance", variant: "default" }
    case "payout_sent":
      return { label: "Settling", variant: "secondary" }
    case "failed":
      return { label: "Refunded", variant: "outline" }
    default:
      return { label: "Processing", variant: "secondary" }
  }
}

/** A payment can be refunded until the money lands in the Easner Balance. */
function refundable(phase: string): boolean {
  return phase === "payment_received" || phase === "payout_sent"
}

export function PaymentLinkPaymentsDialog({
  link,
  onOpenChange,
}: {
  link: PaymentLinkListRow | null
  onOpenChange: (open: boolean) => void
}) {
  const [payments, setPayments] = useState<LinkPayment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<LinkPayment | null>(null)
  const [refunding, setRefunding] = useState(false)

  const linkId = link?.id ?? null

  const load = async (id: string) => {
    setError(null)
    try {
      const res = await fetchWithSession(`/api/payment-links/${encodeURIComponent(id)}/payments`)
      const body = (await res.json().catch(() => ({}))) as {
        payments?: LinkPayment[]
        error?: string
      }
      if (!res.ok) {
        setError(body.error || "Couldn’t load payments")
        return
      }
      setPayments(Array.isArray(body.payments) ? body.payments : [])
    } catch {
      setError("Couldn’t load payments")
    }
  }

  useEffect(() => {
    setPayments(null)
    setError(null)
    if (linkId) void load(linkId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId])

  const refund = async (payment: LinkPayment) => {
    setRefunding(true)
    try {
      const res = await fetchWithSession("/api/checkout/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settlement_id: payment.settlementId }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        toast.error(body.error || "Could not refund this payment")
        return
      }
      toast.success("Refund started. The customer gets the full amount back.")
      setConfirming(null)
      if (linkId) await load(linkId)
    } finally {
      setRefunding(false)
    }
  }

  return (
    <>
      <Dialog open={Boolean(link)} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payments</DialogTitle>
            <DialogDescription className="truncate">
              {link?.label} · {link ? formatCurrency(link.amountCents / 100, link.currency) : ""}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => linkId && void load(linkId)}
              >
                Retry
              </Button>
            </div>
          ) : payments === null ? (
            <div className="flex items-center justify-center py-8" aria-busy="true">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading payments" />
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Receipt className="h-6 w-6 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">
                No payments yet. Share the link to start collecting.
              </p>
            </div>
          ) : (
            <ul className="max-h-[50vh] divide-y overflow-y-auto">
              {payments.map((payment) => {
                const badge = phaseBadge(payment.phase)
                return (
                  <li key={payment.settlementId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium tabular-nums">
                        {formatCurrency(payment.grossCents / 100, payment.currency)}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {payment.customerEmail ?? "No email"}
                        {" · "}
                        {new Date(payment.paidAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {refundable(payment.phase) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirming(payment)}
                        >
                          Refund
                        </Button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming
                ? `${formatCurrency(confirming.grossCents / 100, confirming.currency)} goes back to ${
                    confirming.customerEmail ?? "the customer"
                  }. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refunding}>Keep payment</AlertDialogCancel>
            <AlertDialogAction
              disabled={refunding}
              onClick={(event) => {
                event.preventDefault()
                if (confirming) void refund(confirming)
              }}
            >
              {refunding ? "Refunding…" : "Refund"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
