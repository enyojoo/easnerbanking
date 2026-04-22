import { deriveEasnerInboundRemitterDisplayName, toEasnerTransactionProductCategory } from "@easner/shared"
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
  return firstNonEmptyString([
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

  const easetag =
    typeof meta?.destinationEasetag === "string" && meta.destinationEasetag.trim()
      ? meta.destinationEasetag.trim().replace(/^@+/, "")
      : typeof meta?.sourceEasetag === "string" && meta.sourceEasetag.trim()
        ? meta.sourceEasetag.trim().replace(/^@+/, "")
        : null

  if (easetag) {
    if (direction === "out") {
      return { title: "Money sent", body: `Sent ${amountText} to @${easetag}` }
    }
    return { title: "Money received", body: `Received ${amountText} from @${easetag}` }
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
    return { title: "Stablecoin deposit received", body: `Received ${amountText} via address` }
  }
  if (category === "Stablecoin Transfer") {
    return { title: "Stablecoin sent", body: `Sent ${amountText} to wallet address` }
  }

  if (direction === "in") {
    const from = deriveEasnerInboundRemitterDisplayName({ metadata: meta, payload: input.payload ?? null })
    return {
      title: "Bank deposit received",
      body: from ? `Received ${amountText} from ${from}` : `Received ${amountText}`,
    }
  }

  const to = deriveOutboundCounterpartyName({ metadata: meta, payload: input.payload ?? null })
  return {
    title: "Transfer complete",
    body: to ? `Sent ${amountText} to ${to}` : `Sent ${amountText}`,
  }
}

