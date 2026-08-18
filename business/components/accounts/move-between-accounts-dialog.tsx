"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeftRight, ArrowRight, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { MoveAmountStep } from "@/components/accounts/move-amount-step"
import { MoveReviewStep } from "@/components/accounts/move-review-step"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useConfirmWithPin } from "@/components/app-lock/use-confirm-with-pin"
import type { Account } from "@/lib/finance-types"
import { useMoveQuote } from "@/hooks/use-move-quote"
import {
  destCurrencyForDirection,
  sourceCurrencyForDirection,
  type MoveQuoteState,
} from "@/lib/move-quote-state"
import {
  executeBalanceConvertRequest,
  moveReviewFromQuote,
} from "@/lib/convert-quote-client"
import { refetchBusinessMoneyQueries } from "@/lib/query/refresh-after-money-move"
import { useScope } from "@/lib/query/scope"
import { useAuth } from "@/lib/auth-context"
import { hasPin, isLoginPinModuleAvailable } from "@/lib/login-pin"
import { VERIFICATION_SECTION_COPY } from "@/lib/copy/business-ui-copy"

type Step = "amount" | "review"

type Props = {
  account: Account
  accountRows: Account[]
  tier1Complete: boolean
  accountsProvisioning: boolean
  canMoveMoney: boolean
  accountScopeHeaders: Record<string, string>
}

function initialDirection(currency: Account["currency"]): "usd_to_eur" | "eur_to_usd" {
  return currency === "EUR" ? "eur_to_usd" : "usd_to_eur"
}

function parseAmountFromDisplay(display: string): number {
  return Number.parseFloat(display.replace(/,/g, "")) || 0
}

export function MoveBetweenAccountsDialog({
  account,
  accountRows,
  tier1Complete,
  accountsProvisioning,
  canMoveMoney,
  accountScopeHeaders,
}: Props) {
  const { user } = useAuth()
  const { scope } = useScope()
  const queryClient = useQueryClient()
  const confirmWithPin = useConfirmWithPin()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("amount")
  const [direction, setDirection] = useState<"usd_to_eur" | "eur_to_usd">(() =>
    initialDirection(account.currency),
  )
  const [amountStr, setAmountStr] = useState("")
  const [reviewQuote, setReviewQuote] = useState<MoveQuoteState | null>(null)
  const [continueLoading, setContinueLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const sourceCurrency = sourceCurrencyForDirection(direction)
  const destCurrency = destCurrencyForDirection(direction)
  const sourceAccount = accountRows.find((row) => row.currency === sourceCurrency)
  const destAccount = accountRows.find((row) => row.currency === destCurrency)
  const enteredAmount = parseAmountFromDisplay(amountStr)

  const moveBlocked = !tier1Complete || accountsProvisioning || !canMoveMoney
  const missingCounterCurrency = tier1Complete && !destAccount
  const canQuote =
    open &&
    step === "amount" &&
    Boolean(sourceAccount && destAccount) &&
    tier1Complete &&
    canMoveMoney &&
    !accountsProvisioning

  const quoteEnabled = canQuote && enteredAmount > 0

  const { quote, indicativeRate, loading, rateLoading, error, isFresh, ensureFreshQuote, resetQuote } =
    useMoveQuote({
      direction,
      sourceAmount: enteredAmount,
      enabled: quoteEnabled,
      seedOnOpen: canQuote,
      accountScopeHeaders,
    })


  const resetDialog = useCallback(() => {
    setStep("amount")
    setDirection(initialDirection(account.currency))
    setAmountStr("")
    setReviewQuote(null)
    setContinueLoading(false)
    setConfirming(false)
    setConfirmError(null)
    resetQuote()
  }, [account.currency, resetQuote])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) resetDialog()
  }

  useEffect(() => {
    if (!open) return
    setDirection(initialDirection(account.currency))
  }, [account.currency, open])

  useEffect(() => {
    resetQuote()
    setReviewQuote(null)
    setStep("amount")
  }, [direction, resetQuote])

  const continueDisabled = useMemo(() => {
    if (continueLoading || loading) return true
    if (!sourceAccount || enteredAmount <= 0) return true
    if (error === "min_amount_not_met" || error === "relay_not_configured") return true
    const debitAmount = quote?.totalDebited ?? enteredAmount
    if (debitAmount > sourceAccount.availableBalance) return true
    if (!quote || !isFresh) return true
    return false
  }, [continueLoading, loading, sourceAccount, enteredAmount, error, quote, isFresh])

  const handleContinue = async () => {
    setContinueLoading(true)
    try {
      const fresh = await ensureFreshQuote()
      if (!fresh || !sourceAccount) return
      const debitAmount = fresh.totalDebited ?? fresh.sourceAmount
      if (debitAmount > sourceAccount.availableBalance) return
      setReviewQuote(fresh)
      setStep("review")
    } finally {
      setContinueLoading(false)
    }
  }

  const needPinChallenge =
    Boolean(user?.id) && isLoginPinModuleAvailable() && hasPin(user!.id)

  const runExecute = async () => {
    if (!reviewQuote) return
    setConfirming(true)
    setConfirmError(null)
    try {
      const result = await executeBalanceConvertRequest({
        sessionId: reviewQuote.sessionId,
        accountScopeHeaders,
      })
      await refetchBusinessMoneyQueries(queryClient, scope)
      handleOpenChange(false)
      if (result.status === "failed") {
        toast.error("Move could not be completed.")
        return
      }
      toast.success("Move between accounts started.", {
        description:
          result.status === "settled"
            ? "Your balances have been updated."
            : "We will update your balances when the move settles.",
      })
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "execute_failed")
    } finally {
      setConfirming(false)
    }
  }

  const handleConfirm = async () => {
    setConfirmError(null)
    if (needPinChallenge) {
      const ok = await confirmWithPin.requestConfirm()
      if (!ok) return
    } else if (
      typeof window !== "undefined" &&
      isLoginPinModuleAvailable() &&
      user?.id &&
      !hasPin(user.id)
    ) {
      window.alert("Set an app PIN in Settings before moving funds.")
      return
    }
    await runExecute()
  }

  const blockedTitle = !tier1Complete
    ? "Verification required"
    : accountsProvisioning
      ? "Setting up accounts"
      : "Move unavailable"

  const blockedBody = !tier1Complete
    ? VERIFICATION_SECTION_COPY.complianceTiers
    : accountsProvisioning
      ? VERIFICATION_SECTION_COPY.accountsProvisioning
      : "Balance moves are not available on your account yet."

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="flex-1 bg-transparent gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Move
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Move between accounts</DialogTitle>
            <DialogDescription className={moveBlocked ? "sr-only" : undefined}>
              Convert between your USD and EUR balances instantly.
            </DialogDescription>
          </DialogHeader>

          {moveBlocked ? (
            <div className="flex flex-col items-center rounded-lg border border-border bg-muted/40 px-4 py-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <ShieldCheck className="h-8 w-8 text-primary" strokeWidth={2} />
              </div>
              <p className="text-base font-semibold text-foreground">{blockedTitle}</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">{blockedBody}</p>
              {!tier1Complete ? (
                <Button asChild className="mt-6 gap-2">
                  <Link href="/settings?tab=verification">
                    Complete Verification
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : missingCounterCurrency ? (
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
              Open a {destCurrency} account before moving between balances.
            </div>
          ) : step === "amount" && sourceAccount && destAccount ? (
            <MoveAmountStep
              direction={direction}
              onDirectionChange={setDirection}
              sourceAccount={sourceAccount}
              destAccount={destAccount}
              amountStr={amountStr}
              onAmountStrChange={setAmountStr}
              quote={quote}
              indicativeRate={indicativeRate}
              quoteRateLoading={rateLoading}
              quoteLoading={loading}
              quoteError={error}
              onContinue={() => void handleContinue()}
              continueDisabled={continueDisabled}
              continueLoading={continueLoading}
            />
          ) : reviewQuote ? (
            <MoveReviewStep
              moveReview={moveReviewFromQuote(reviewQuote)}
              expiresAt={reviewQuote.expiresAt}
              onBack={() => {
                setStep("amount")
                setConfirmError(null)
              }}
              onConfirm={() => void handleConfirm()}
              confirming={confirming}
              confirmError={confirmError}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {user?.id ? (
        <PinChallengeDialog
          open={confirmWithPin.open}
          onOpenChange={confirmWithPin.onOpenChange}
          userId={user.id}
          onVerified={confirmWithPin.onVerified}
        />
      ) : null}
    </>
  )
}
