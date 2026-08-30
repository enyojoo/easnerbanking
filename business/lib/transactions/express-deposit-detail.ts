import {
  buildExpressDepositsLifecycle,
  expressDepositActivityLabel,
  isExpressDepositsMetadata,
  type ExpressDepositsLifecycleStep,
} from "@easner/shared"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"

export function isExpressDepositsPayInRow(row: Record<string, unknown>): boolean {
  const dir = String(row.direction ?? "").toLowerCase()
  if (dir !== "in") return false
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  return isExpressDepositsMetadata(meta)
}

export type ResolvedExpressDepositPayIn = {
  lifecycle: ExpressDepositsLifecycleStep[]
  displayHeroTitle: string
  ledgerCreatedAt: string | null
}

export function resolveExpressDepositPayInDetail(
  row: Record<string, unknown>,
): ResolvedExpressDepositPayIn | null {
  if (!isExpressDepositsPayInRow(row)) return null
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const ledgerCreatedAt = resolveLedgerWhenAtFromRow(row)
  return {
    lifecycle: buildExpressDepositsLifecycle({
      status: String(row.status ?? ""),
      metadata: meta,
      createdAt: ledgerCreatedAt,
      settledAt: row.settled_at != null ? String(row.settled_at) : null,
    }),
    displayHeroTitle: expressDepositActivityLabel(String(meta.payment_method ?? "")),
    ledgerCreatedAt,
  }
}

export function attachExpressDepositsDetailFields(
  row: Record<string, unknown>,
  transaction: Record<string, unknown>,
  resolved?: ReturnType<typeof resolveExpressDepositPayInDetail> | null,
): Record<string, unknown> {
  const detail = resolved ?? resolveExpressDepositPayInDetail(row)
  if (!detail) return transaction
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const usdCredit = Number(meta.usd_credit ?? row.amount ?? 0)
  return {
    ...transaction,
    lifecycle: detail.lifecycle,
    display_hero_title: detail.displayHeroTitle,
    transaction_product: "Card deposit",
    source_type: "express_deposits",
    ...(detail.ledgerCreatedAt ? { ledger_created_at: detail.ledgerCreatedAt } : {}),
    ...(usdCredit > 0
      ? {
          deposit_amount: usdCredit,
          posted_amount: usdCredit,
          posted_currency: "USD",
          settled_amount: usdCredit,
          settled_currency: "USD",
          final_amount: usdCredit,
        }
      : {}),
  }
}
