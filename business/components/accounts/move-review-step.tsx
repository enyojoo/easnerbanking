"use client"

import { ArrowLeft, Loader2 } from "lucide-react"
import { MoveReviewDetailsRows } from "@/components/accounts/move-review-details-rows"
import { Button } from "@/components/ui/button"
import type { BalanceMoveReviewSnapshot } from "@easner/shared"
import { useQuoteCountdown } from "@/hooks/use-quote-countdown"

type Props = {
  moveReview: BalanceMoveReviewSnapshot
  expiresAt: string
  onBack: () => void
  onConfirm: () => void
  confirming: boolean
  confirmError: string | null
}

export function MoveReviewStep({
  moveReview,
  expiresAt,
  onBack,
  onConfirm,
  confirming,
  confirmError,
}: Props) {
  const quoteCountdown = useQuoteCountdown(expiresAt)
  const confirmDisabled = confirming || quoteCountdown.expired

  return (
    <div className="space-y-6">
      <MoveReviewDetailsRows moveReview={moveReview} mode="confirm" />

      <p className="text-center text-sm text-muted-foreground">
        {quoteCountdown.expired
          ? "This quote expired. Go back and refresh the amount."
          : `Rate locked for ${quoteCountdown.label}`}
      </p>

      {confirmError ? (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{confirmError}</p>
      ) : null}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="h-11" onClick={onBack} disabled={confirming}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button size="lg" className="h-11 flex-1" onClick={onConfirm} disabled={confirmDisabled}>
          {confirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Moving…
            </>
          ) : (
            "Confirm move"
          )}
        </Button>
      </div>
    </div>
  )
}
