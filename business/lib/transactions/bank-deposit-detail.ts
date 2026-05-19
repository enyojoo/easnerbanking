import { buildBankDepositLifecycle, isBankOnrampDepositFlow } from "@easner/shared"
import { isNoahBankOnrampFiatPayIn } from "@/lib/noah/bank-onramp-tx"

export function isBankOnrampPayInRow(row: Record<string, unknown>): boolean {
  const meta = row.metadata as Record<string, unknown> | null | undefined
  const payload = row.payload as Record<string, unknown> | null | undefined
  if (isBankOnrampDepositFlow(meta)) return true
  if (payload && isNoahBankOnrampFiatPayIn(payload)) return true
  return false
}

export function attachBankDepositDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
): Record<string, unknown> {
  if (!isBankOnrampPayInRow(row)) return transaction

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const st = String(row.status ?? "")
  const lifecycle = buildBankDepositLifecycle({
    status: st,
    metadata: meta,
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : null,
    settledAt: row.settled_at != null ? String(row.settled_at) : null,
    createdAt: row.created_at != null ? String(row.created_at) : null,
  })

  const depositAmount =
    typeof meta.fiat_deposit_amount === "number"
      ? meta.fiat_deposit_amount
      : typeof row.amount === "number"
        ? row.amount
        : Number(row.amount) || undefined
  const feeAmount =
    typeof meta.fee_amount === "number" && Number.isFinite(meta.fee_amount)
      ? meta.fee_amount
      : undefined
  const postedAmount =
    typeof meta.posted_amount === "number"
      ? meta.posted_amount
      : typeof meta.settled_amount === "number"
        ? meta.settled_amount
        : undefined
  const postedCurrency =
    meta.settled_currency != null
      ? String(meta.settled_currency)
      : meta.fiat_deposit_currency != null
        ? String(meta.fiat_deposit_currency)
        : String(row.currency ?? "USD")

  const senderFromMeta =
    typeof meta.sender_name === "string" && meta.sender_name.trim()
      ? meta.sender_name.trim()
      : undefined

  return {
    ...transaction,
    lifecycle,
    ...(senderFromMeta && !transaction.sender_display_name
      ? { sender_display_name: senderFromMeta }
      : {}),
    deposit_amount: depositAmount,
    fee_amount: feeAmount ?? transaction.fee_amount,
    posted_amount: postedAmount,
    posted_currency: postedCurrency,
    settled_amount: postedAmount ?? transaction.settled_amount,
    settled_currency: postedCurrency,
    source_type: transaction.source_type ?? "virtual_account",
  }
}
