import { fetchWithSession } from "@/lib/fetch-with-session"
import { mapWalletQuoteToFlowState } from "@/lib/wallet-send/map-wallet-quote-to-flow"
import type { WalletSendQuoteResult } from "@/lib/wallet-send/wallet-send-quote"
import type { SendFlowState } from "@/lib/send-flow-session"

export type WalletQuoteStashMeta = {
  recipientId: string
  amountEntryMode: "send" | "receive"
  entryAmount: number
  receiveCurrency: string
  sourceBalanceCurrency: string
}

let stashed: WalletSendQuoteResult | null = null
let stashedMeta: WalletQuoteStashMeta | null = null
let lastQuoteError: string | null = null
let inflightQuote: Promise<WalletSendQuoteResult | null> | null = null
let inflightQuoteKey = ""
let inflightConfirm: Promise<WalletSendQuoteResult | null> | null = null
let inflightConfirmKey = ""

function quoteMetaKey(meta: WalletQuoteStashMeta): string {
  return [
    meta.recipientId,
    meta.amountEntryMode,
    meta.entryAmount,
    meta.receiveCurrency,
    meta.sourceBalanceCurrency,
  ].join("|")
}

export function isUsableWalletQuotePreview(
  quote: WalletSendQuoteResult | null | undefined,
): quote is WalletSendQuoteResult {
  return Boolean(quote?.expiresAt && quote.formSessionId && quote.wallet?.cryptoAuthorizedAmount)
}

export function isCompleteWalletSendQuote(
  quote: WalletSendQuoteResult | null | undefined,
): quote is WalletSendQuoteResult {
  if (!isUsableWalletQuotePreview(quote)) return false
  if (new Date(quote.expiresAt).getTime() <= Date.now()) return false
  return quote.quotePhase === "locked" || quote.quotePhase == null
}

export function stashWalletSendQuote(quote: WalletSendQuoteResult, meta: WalletQuoteStashMeta): void {
  if (!isCompleteWalletSendQuote(quote)) return
  stashed = quote
  stashedMeta = meta
  lastQuoteError = null
}

export function peekWalletSendQuote(): WalletSendQuoteResult | null {
  return stashed
}

export function peekLastWalletQuoteError(): string | null {
  return lastQuoteError
}

export function clearWalletSendQuote(): void {
  stashed = null
  stashedMeta = null
  lastQuoteError = null
}

export function isStashedWalletQuoteFresh(meta: WalletQuoteStashMeta): boolean {
  if (!isCompleteWalletSendQuote(stashed) || !stashedMeta) return false
  if (new Date(stashed.expiresAt).getTime() <= Date.now()) return false
  return quoteMetaKey(stashedMeta) === quoteMetaKey(meta)
}

function buildQuoteBody(meta: WalletQuoteStashMeta): Record<string, unknown> {
  return {
    recipientId: meta.recipientId,
    sourceBalanceCurrency: meta.sourceBalanceCurrency,
    amountEntryMode: meta.amountEntryMode,
    ...(meta.amountEntryMode === "receive"
      ? { receiveAmount: meta.entryAmount }
      : { sendAmount: meta.entryAmount }),
  }
}

export async function ensureWalletSendQuoteStashed(
  meta: WalletQuoteStashMeta,
  businessId?: string | null,
): Promise<WalletSendQuoteResult | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (businessId) headers["X-Easner-Noah-Scope"] = "business"

  const key = quoteMetaKey(meta)
  if (inflightQuote && inflightQuoteKey === key) return inflightQuote

  inflightQuoteKey = key
  lastQuoteError = null
  inflightQuote = (async () => {
    try {
      const res = await fetchWithSession("/api/wallets/send/quote", {
        method: "POST",
        headers,
        body: JSON.stringify(buildQuoteBody(meta)),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        quote?: WalletSendQuoteResult
      }
      if (!res.ok || !data.ok || !data.quote) {
        lastQuoteError = data.error || "Could not load wallet send quote"
        return null
      }
      return { ...data.quote, quotePhase: "preview" as const }
    } catch (e) {
      lastQuoteError = e instanceof Error ? e.message : "quote_failed"
      return null
    }
  })().finally(() => {
    inflightQuote = null
    inflightQuoteKey = ""
  })

  return inflightQuote
}

export async function ensureWalletSendOrderConfirmed(
  meta: WalletQuoteStashMeta,
  businessId?: string | null,
): Promise<WalletSendQuoteResult | null> {
  if (isStashedWalletQuoteFresh(meta)) return peekWalletSendQuote()

  const preview = await ensureWalletSendQuoteStashed(meta, businessId)
  if (!preview?.formSessionId) return null

  const key = quoteMetaKey(meta)
  if (inflightConfirm && inflightConfirmKey === key) return inflightConfirm

  inflightConfirmKey = key
  lastQuoteError = null
  inflightConfirm = (async () => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (businessId) headers["X-Easner-Noah-Scope"] = "business"
      const res = await fetchWithSession("/api/wallets/send/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify({ formSessionId: preview.formSessionId }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
        quote?: WalletSendQuoteResult
      }
      if (!res.ok || !data.ok || !data.quote) {
        lastQuoteError = data.error || "Could not lock wallet send order"
        return null
      }
      const locked = { ...data.quote, quotePhase: "locked" as const }
      if (!isCompleteWalletSendQuote(locked)) {
        lastQuoteError = "Incomplete locked wallet send quote"
        return null
      }
      stashWalletSendQuote(locked, meta)
      return locked
    } catch (e) {
      lastQuoteError = e instanceof Error ? e.message : "confirm_failed"
      return null
    }
  })().finally(() => {
    inflightConfirm = null
    inflightConfirmKey = ""
  })

  return inflightConfirm
}

export function walletQuoteToFlowState(
  state: SendFlowState,
  quote: WalletSendQuoteResult,
): SendFlowState {
  return mapWalletQuoteToFlowState(state, quote)
}
