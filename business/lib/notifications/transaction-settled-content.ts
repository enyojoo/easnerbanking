import {
  BANK_DEPOSIT_COMPLETED_DESCRIPTION,
  deriveEasnerInboundRemitterDisplayName,
  deriveVerificationBankName,
  formatDisplayPersonName,
  isBankOnrampDepositFlow,
  isVerificationDepositMetadata,
  toEasnerTransactionProductCategory,
} from "@easner/shared"
import { formatCurrency } from "@/lib/utils"

type LedgerDirection = "in" | "out"

export type TransactionSettledContentInput = {
  provider: string
  direction: LedgerDirection | null
  amount: number
  currency: string
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}

function firstNonEmptyString(values: readonly unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string") {
      const t = v.trim()
      if (t) return t
    }
  }
  return undefined
}

function deriveOutboundCounterpartyName(input: {
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
}): string | undefined {
  const meta = input.metadata || {}
  const payload = input.payload || {}
  const raw = firstNonEmptyString([
    meta.recipient_name,
    meta.destination_name,
    meta.counterparty_name,
    meta.beneficiary_name,
    meta.merchant_name,
    payload.recipientName,
    payload.counterpartyName,
    payload.merchantName,
    payload.beneficiaryName,
  ])
  if (!raw) return undefined
  const formatted = formatDisplayPersonName(raw)
  return formatted || undefined
}

export function buildTransactionSettledPushContent(input: TransactionSettledContentInput): {
  title: string
  body: string
} {
  const provider = String(input.provider || "").toLowerCase()
  const direction: LedgerDirection | null = input.direction === "in" || input.direction === "out" ? input.direction : null
  const amountText = formatCurrency(Math.abs(input.amount || 0), input.currency)
  const meta = input.metadata ?? null
  const paymentRail = String(
    (meta as any)?.payment_rail ?? (meta as any)?.source_payment_rail ?? (meta as any)?.destination_payment_rail ?? "",
  )
    .trim()
    .toLowerCase()
  const isCard = paymentRail === "card"

  const outboundEasetag =
    typeof meta?.destinationEasetag === "string" && meta.destinationEasetag.trim()
      ? meta.destinationEasetag.trim().replace(/^@+/, "")
      : typeof meta?.payee_easetag === "string" && meta.payee_easetag.trim()
        ? meta.payee_easetag.trim().replace(/^@+/, "")
        : null

  const inboundEasetag =
    typeof meta?.sourceEasetag === "string" && meta.sourceEasetag.trim()
      ? meta.sourceEasetag.trim().replace(/^@+/, "")
      : typeof meta?.sender_easetag === "string" && meta.sender_easetag.trim()
        ? meta.sender_easetag.trim().replace(/^@+/, "")
        : null

  if (direction === "out" && outboundEasetag) {
    return { title: "Easetag Transfer", body: `Sent ${amountText} to @${outboundEasetag}` }
  }
  if (direction === "in" && inboundEasetag) {
    return { title: "Easetag Deposit", body: `Received ${amountText} from @${inboundEasetag}` }
  }

  if (isCard) {
    if (direction === "in") {
      return { title: "Card top up complete", body: `Added ${amountText} from your card` }
    }
    const merchant = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
    return {
      title: "Card payment successful",
      body: merchant ? `Paid ${amountText} to ${merchant}` : `Paid ${amountText}`,
    }
  }

  const category = toEasnerTransactionProductCategory({
    provider,
    direction: direction ?? "out",
    metadata: meta,
    payload: input.payload ?? null,
  })

  if (category === "Stablecoin Deposit") {
    return { title: "Stablecoin Deposit", body: `Received ${amountText} via address` }
  }
  if (category === "Stablecoin Transfer") {
    return { title: "Stablecoin Transfer", body: `Sent ${amountText} to wallet address` }
  }

  if (category === "Easetag Received") {
    return {
      title: "Easetag Deposit",
      body: inboundEasetag
        ? `Received ${amountText} from @${inboundEasetag}`
        : `Received ${amountText}`,
    }
  }
  if (category === "Easetag Send") {
    return {
      title: "Easetag Transfer",
      body: outboundEasetag
        ? `Sent ${amountText} to @${outboundEasetag}`
        : `Sent ${amountText}`,
    }
  }

  if (direction === "in") {
    if (isVerificationDepositMetadata(meta)) {
      const bank = deriveVerificationBankName({
        metadata: meta,
        payload: input.payload ?? null,
      })
      return {
        title: "Bank verification credit",
        body: `Received ${amountText} from ${bank} — not added to your balance. Confirm in your bank app if required.`,
      }
    }
    if (isBankOnrampDepositFlow(meta)) {
      return {
        title: "Bank Deposit",
        body: BANK_DEPOSIT_COMPLETED_DESCRIPTION,
      }
    }
    const from = deriveEasnerInboundRemitterDisplayName({ metadata: meta, payload: input.payload ?? null })
    return {
      title: "Bank Deposit",
      body: from ? `Received ${amountText} from ${from}` : `Received ${amountText}`,
    }
  }

  const to = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
  return {
    title: "Bank Transfer",
    body: to ? `Sent ${amountText} to ${to}` : `Sent ${amountText}`,
  }
}

