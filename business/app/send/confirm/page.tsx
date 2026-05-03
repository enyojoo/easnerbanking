"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { useBusinessProfile } from "@/lib/use-business-profile"
import { Card, CardContent } from "@/components/ui/card"
import { PinChallengeDialog } from "@/components/app-lock/pin-challenge-dialog"
import { useAuth } from "@/lib/auth-context"
import { hasPin, isLoginPinModuleAvailable } from "@/lib/login-pin"
import { getCurrencySymbol } from "@/lib/utils"
import { useBusinessAccountRows } from "@/hooks/use-business-account-rows"
import type { Beneficiary } from "@/lib/recipient-types"
import { coerceBeneficiaryEasenetDisplay } from "@/lib/recipients-store"
import { EasenetRecipientProfileRowHydrated } from "@/components/easenet-recipient-profile-row-hydrated"
import { generateTransactionId } from "@/lib/transaction-id"
import { fetchWithSession } from "@/lib/fetch-with-session"
import { dataCache, CACHE_KEYS, requestBusinessAccountsRefresh } from "@/lib/cache"
import { isEasetagLedgerP2PEnabled } from "@/lib/ledger/easetag-transfer"
import { transactionWebDetailPath } from "@/lib/easner-transaction-id"
import { refetchBusinessMoneyQueries } from "@/lib/query/refresh-after-money-move"
import { useScope } from "@/lib/query/scope"
import { fetchReserveEasnerTransactionId } from "@/lib/reserve-easner-transaction-id"
import { ArrowLeft, User, Copy, Check, Loader2 } from "lucide-react"

const SEND_FLOW_STATE_KEY = "send_flow_state"

interface SendFlowState {
  recipient: Beneficiary
  amount: number
  receiveCurrency: string
  sendAmount: number
  sendCurrency: string
  sourceAccountId?: string
  paymentMethod?: string
  note: string
  transactionId?: string
  /** Which Noah scope was used for `/api/transactions/reserve-etid` (must match easetag-transfer). */
  ledgerReserveNoahScope?: "business" | "individual"
  pricingQuote?: {
    transferFee?: number
    payoutFee?: number
    exchangeRate?: number
    expiresAt?: string
    repricingReason?: string | null
  }
}

function isEasenetRecipient(recipient: Beneficiary): boolean {
  return Boolean(recipient.payeeEasetag?.trim())
}

function getTransferMethod(recipient: Beneficiary, currency: string): string {
  if (isEasenetRecipient(recipient)) return "Easetag (wallet-to-wallet)"
  if (currency === "USD" && recipient.country === "United States") return "ACH"
  if (currency === "EUR") return "SEPA"
  if (currency === "GBP" && recipient.country === "United Kingdom") return "Faster Payments"
  return "Wire Transfer"
}

function getProcessingTime(method: string): string {
  switch (method) {
    case "Easetag (wallet-to-wallet)":
      return "Usually instant"
    case "ACH":
      return "1-3 business days"
    case "SEPA":
      return "1-2 business days"
    case "Faster Payments":
      return "Within minutes"
    default:
      return "Same day"
  }
}

export default function SendConfirmPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { scope } = useScope()
  const { user } = useAuth()
  const { tier1Complete, isLoading: profileLoading, businessId, hasData } = useBusinessProfile()
  const { accountRows: sourceAccounts } = useBusinessAccountRows()
  const [state, setState] = useState<SendFlowState | null>(null)
  const [showPinDialog, setShowPinDialog] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizeError, setAuthorizeError] = useState<string | null>(null)
  const [ledgerReserveError, setLedgerReserveError] = useState<string | null>(null)

  const needPinChallenge =
    !!user?.id && isLoginPinModuleAvailable() && hasPin(user.id)

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const raw = sessionStorage.getItem(SEND_FLOW_STATE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as SendFlowState
        if (parsed.paymentMethod && parsed.paymentMethod !== "balance") {
          router.replace("/send")
          return
        }
        if (!parsed.sourceAccountId) {
          router.replace("/send")
          return
        }
        setState({
          ...parsed,
          recipient: coerceBeneficiaryEasenetDisplay(parsed.recipient),
        })
      } catch {
        router.replace("/send")
      }
    } else {
      router.replace("/send")
    }
  }, [router])

  /**
   * Easetag ledger P2P: ETID is reserved on `/send` before navigation (mobile parity).
   * This effect only fixes stale session rows or legacy flows missing `ledgerReserveNoahScope`.
   */
  useEffect(() => {
    if (!state) return
    if (!isEasenetRecipient(state.recipient) || !isEasetagLedgerP2PEnabled()) return
    if (profileLoading || !hasData) return

    const tid = state.transactionId?.trim() ?? ""
    const tidLooksReserved = /^ETID\d{8}$/i.test(tid)
    const orgSend = Boolean(businessId)

    if (tidLooksReserved && orgSend && state.ledgerReserveNoahScope !== "business") {
      setLedgerReserveError(null)
      setState((prev) => {
        if (!prev) return prev
        const next: SendFlowState = { ...prev, transactionId: undefined }
        delete next.ledgerReserveNoahScope
        try {
          sessionStorage.setItem(SEND_FLOW_STATE_KEY, JSON.stringify(next))
        } catch {
          // ignore
        }
        return next
      })
      return
    }

    const expectedLedgerReserveScope: "business" | "individual" = businessId ? "business" : "individual"
    if (tidLooksReserved && state.ledgerReserveNoahScope === expectedLedgerReserveScope) return

    let cancelled = false
    setLedgerReserveError(null)
    void (async () => {
      const reserved = await fetchReserveEasnerTransactionId(
        orgSend ? { "X-Easner-Noah-Scope": "business" } : undefined,
      )
      if (cancelled) return
      if (!reserved.ok) {
        setLedgerReserveError(
          reserved.error === "reserve_failed" || reserved.error === "Unauthorized"
            ? "Could not reserve transaction reference. Sign in and try again."
            : `Could not reserve transaction reference: ${reserved.error}`,
        )
        return
      }
      if (cancelled) return
      const etid = reserved.easner_transaction_id.trim().toUpperCase()
      setState((prev) => {
        if (!prev) return prev
        const next: SendFlowState = {
          ...prev,
          transactionId: etid,
          ledgerReserveNoahScope: orgSend ? "business" : "individual",
        }
        sessionStorage.setItem(SEND_FLOW_STATE_KEY, JSON.stringify(next))
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [state?.recipient, state?.transactionId, state?.ledgerReserveNoahScope, businessId, profileLoading, hasData])

  useEffect(() => {
    if (profileLoading) return
    if (state && !tier1Complete) {
      router.replace("/send")
    }
  }, [profileLoading, tier1Complete, state, router])

  const finishSend = async (transactionId: string) => {
    if (!state) return
    sessionStorage.removeItem(SEND_FLOW_STATE_KEY)
    await refetchBusinessMoneyQueries(qc, scope)
    router.push(transactionWebDetailPath(transactionId))
  }

  const handleAuthorizeSuccess = async () => {
    if (!state) return
    setAuthorizeError(null)

    if (isEasenetRecipient(state.recipient)) {
      setIsAuthorizing(true)
      try {
        const tag = state.recipient.payeeEasetag!.trim().replace(/^@+/, "")
        const ledger = isEasetagLedgerP2PEnabled()
        const path = ledger ? "/api/wallets/easetag-transfer" : "/api/noah/transfers/w2w"
        const reserved =
          ledger &&
          typeof state.transactionId === "string" &&
          /^ETID\d{8}$/i.test(state.transactionId.trim())
            ? state.transactionId.trim().toUpperCase()
            : ""
        const body = ledger
          ? {
              destination_easetag: tag,
              amount: state.sendAmount,
              currency: state.sendCurrency.toUpperCase(),
              ...(reserved ? { reserved_debit_etid: reserved } : {}),
            }
          : {
              destinationEasetag: tag,
              amount: state.sendAmount,
              currency: state.sendCurrency.toLowerCase(),
            }
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (businessId) {
          headers["X-Easner-Noah-Scope"] = "business"
        }
        if (ledger) {
          headers["Idempotency-Key"] = `biz-send-${Date.now()}-${Math.random().toString(36).slice(2)}`
        }
        const res = await fetchWithSession(path, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        })
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean
          error?: string
          hint?: string
          transaction?: Record<string, unknown>
          debit_provider_transaction_id?: string
          transfer_group_id?: string
          easner_transaction_id?: string
        }
        if (!res.ok || !data.ok) {
          const err = typeof data.error === "string" ? data.error : "Wallet transfer failed"
          const hint = typeof data.hint === "string" ? data.hint : ""
          setAuthorizeError(hint ? `${err} — ${hint}` : err)
          return
        }
        const tx = data.transaction
        const id = ledger
          ? String(
              data.easner_transaction_id ??
                data.debit_provider_transaction_id ??
                data.transfer_group_id ??
                state.transactionId ??
                generateTransactionId(),
            )
          : String(
              data.easner_transaction_id ??
                tx?.ID ??
                tx?.id ??
                state.transactionId ??
                generateTransactionId(),
            )
        if (user?.id) {
          dataCache.invalidate(CACHE_KEYS.TRANSACTIONS_LIST(user.id))
        }
        requestBusinessAccountsRefresh()
        await finishSend(id)
      } catch (e) {
        setAuthorizeError(e instanceof Error ? e.message : "Transfer failed")
      } finally {
        setIsAuthorizing(false)
      }
      return
    }

    const transactionId = state.transactionId ?? generateTransactionId()
    void finishSend(transactionId)
  }

  const onAuthorizeClick = () => {
    setAuthorizeError(null)
    if (needPinChallenge) {
      setShowPinDialog(true)
      return
    }
    if (typeof window !== "undefined" && isLoginPinModuleAvailable() && user?.id && !hasPin(user.id)) {
      window.alert("Set an app PIN in Settings before authorizing transfers.")
      return
    }
    void handleAuthorizeSuccess()
  }

  if (!state) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
          <div className="h-32 rounded bg-muted" />
        </div>
      </div>
    )
  }

  const sourceAccount = sourceAccounts.find((a) => a.id === state.sourceAccountId!)
  const transferMethod = getTransferMethod(state.recipient, state.receiveCurrency)
  const processingTime = getProcessingTime(transferMethod)
  const easenetSend = isEasenetRecipient(state.recipient)
  const hasFx = !easenetSend && state.receiveCurrency !== state.sendCurrency
  const transferFee = easenetSend
    ? 0
    : state.pricingQuote?.transferFee ?? (transferMethod === "Wire Transfer" ? 25 : 0)
  const payoutFee = easenetSend ? 0 : (state.pricingQuote?.payoutFee ?? 0)
  const exchangeRate = easenetSend
    ? 1
    : state.pricingQuote?.exchangeRate ?? (hasFx && state.amount > 0 ? state.sendAmount / state.amount : 1)

  const needsLedgerEtReserve = easenetSend && isEasetagLedgerP2PEnabled()
  const expectedLedgerReserveScope: "business" | "individual" = businessId ? "business" : "individual"
  /** Server-reserved ETID only — ignore client `generateTransactionId()` shape so the row does not swap IDs. */
  const easetagLedgerEtReady =
    !needsLedgerEtReserve ||
    (/^ETID\d{8}$/i.test(state.transactionId?.trim() ?? "") &&
      state.ledgerReserveNoahScope === expectedLedgerReserveScope)
  const authorizeDisabled =
    isAuthorizing || (needsLedgerEtReserve && (Boolean(ledgerReserveError) || !easetagLedgerEtReady))

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Review transfer</h1>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-2 border-b pb-4">
            <span className="text-sm text-muted-foreground">Transaction ID</span>
            <button
              type="button"
              disabled={needsLedgerEtReserve && !easetagLedgerEtReady}
              className="flex items-center gap-2 font-mono text-sm font-medium transition-colors hover:text-primary disabled:pointer-events-none disabled:opacity-60"
              onClick={() => {
                const id = state.transactionId?.trim()
                if (!id || (needsLedgerEtReserve && !easetagLedgerEtReady)) return
                void handleCopy(id, "transactionId")
              }}
              aria-label={
                needsLedgerEtReserve && !easetagLedgerEtReady
                  ? "Transaction reference loading"
                  : "Copy transaction id"
              }
            >
              {needsLedgerEtReserve && !easetagLedgerEtReady ? (
                <span className="invisible select-none" aria-hidden>
                  ETID00000000
                </span>
              ) : (
                (state.transactionId ?? generateTransactionId()).trim()
              )}
              {copiedKey === "transactionId" ? (
                <Check className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Copy className="h-4 w-4 shrink-0" />
              )}
            </button>
          </div>
          {needsLedgerEtReserve && ledgerReserveError ? (
            <p className="text-sm text-red-600" role="alert">
              {ledgerReserveError}
            </p>
          ) : null}
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Amount</span>
            <span className="text-xl font-semibold">
              {getCurrencySymbol(state.receiveCurrency)}
              {state.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          {hasFx && (
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm text-muted-foreground">You send</span>
              <span className="font-medium">
                {getCurrencySymbol(state.sendCurrency)}
                {state.sendAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <span className="text-sm text-muted-foreground">Recipient</span>
            <div className="flex min-w-0 flex-1 justify-end">
              {isEasenetRecipient(state.recipient) && state.recipient.payeeEasetag ? (
                <EasenetRecipientProfileRowHydrated
                  className="max-w-full"
                  fullName={state.recipient.name}
                  easetag={state.recipient.payeeEasetag}
                  accountKind={state.recipient.payeeAccountKind}
                  avatarUrl={state.recipient.avatarUrl}
                  subtitleClassName="text-sm text-muted-foreground"
                />
              ) : (
                <div className="flex max-w-full items-center gap-2">
                  <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{state.recipient.name}</span>
                </div>
              )}
            </div>
          </div>
          {sourceAccount && (
            <div className="flex items-center justify-between border-b pb-4">
              <span className="text-sm text-muted-foreground">From account</span>
              <span className="font-medium">
                {sourceAccount.accountName} • {sourceAccount.currency}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Transfer method</span>
            <span className="font-medium">{transferMethod}</span>
          </div>
          <div className="flex items-center justify-between border-b pb-4">
            <span className="text-sm text-muted-foreground">Processing time</span>
            <span className="font-medium">{processingTime}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Transfer fee</span>
            <span className="font-semibold">
              {getCurrencySymbol(state.sendCurrency)}
              {transferFee.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Exchange rate</span>
            <span className="font-semibold">{exchangeRate.toFixed(6)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Payout fee</span>
            <span className="font-semibold">
              {getCurrencySymbol(state.receiveCurrency)}
              {payoutFee.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total recipient amount</span>
            <span className="font-semibold">
              {getCurrencySymbol(state.receiveCurrency)}
              {state.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>
          {state.pricingQuote?.expiresAt ? (
            <div className="text-xs text-muted-foreground">
              Quote expires at {new Date(state.pricingQuote.expiresAt).toLocaleTimeString()}
              {state.pricingQuote.repricingReason ? ` • repriced: ${state.pricingQuote.repricingReason}` : ""}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {authorizeError ? (
        <p className="text-sm text-red-600" role="alert">
          {authorizeError}
        </p>
      ) : null}

      {state.note && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-1 text-sm text-muted-foreground">Note</p>
            <p className="text-sm">{state.note}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" size="lg" className="h-11" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button size="lg" className="h-11 flex-1" onClick={onAuthorizeClick} disabled={authorizeDisabled}>
          {isAuthorizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Authorize transfer"
          )}
        </Button>
      </div>

      {user?.id ? (
        <PinChallengeDialog
          open={showPinDialog}
          onOpenChange={setShowPinDialog}
          userId={user.id}
          onVerified={() => {
            void handleAuthorizeSuccess()
          }}
        />
      ) : null}
    </div>
  )
}
