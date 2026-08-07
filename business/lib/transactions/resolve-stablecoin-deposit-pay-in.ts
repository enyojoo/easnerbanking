import {
  buildStablecoinDepositLifecycle,
  buildTransactionTimingRows,
  formatMaskedSenderDisplay,
  formatStablecoinDepositSchemeLabel,
  isRelayTronDepositMetadata,
  resolveTransactionTimingAnchors,
  type StablecoinDepositLifecycleStep,
  type TransactionTimingRow,
} from "@easner/shared"
import { resolveLedgerWhenAtFromRow } from "@/lib/ledger/ledger-occurred-at"

/** True for genuine inbound stablecoin (liquidation address) deposits — not Easetag, bank onramp, or payouts. */
export function isStablecoinDepositPayInRow(row: Record<string, unknown>): boolean {
  const dir = String(row.direction ?? "").toLowerCase()
  if (dir !== "in") return false
  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  if (String(meta.source ?? "").toLowerCase() === "easetag_p2p") return false
  if (String(meta.flow ?? "").toLowerCase() === "bank_onramp") return false
  if (isRelayTronDepositMetadata(meta)) return true
  const sourceType = String(meta.source_type ?? "").toLowerCase()
  if (sourceType === "liquidation_address") return true
  const provider = String(row.provider ?? "").toLowerCase()
  if (provider === "turnkey" && (row.chain != null || row.asset != null)) return true
  return false
}

export type ResolvedStablecoinDepositPayIn = {
  lifecycle: StablecoinDepositLifecycleStep[]
  postedAmount: number
  postedCurrency: string
  feeAmount: number
  senderDisplay: string | null
  schemeLabel: string
  sourcePaymentRail: string
  transactionTiming: TransactionTimingRow[]
  ledgerCreatedAt: string | null
  processingAt: string | null
  completedAt: string | null
}

function pickIso(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

export function resolveStablecoinDepositPayInDetail(
  row: Record<string, unknown>,
): ResolvedStablecoinDepositPayIn | null {
  if (!isStablecoinDepositPayInRow(row)) return null

  const meta = (row.metadata as Record<string, unknown> | null | undefined) ?? {}
  const ledgerStatus = String(row.status ?? "")
  const createdAt = resolveLedgerWhenAtFromRow(row)
  const settledAt = row.settled_at != null ? String(row.settled_at) : null

  const amount =
    typeof row.amount === "number" ? row.amount : Number(row.amount) || 0
  const postedAmount = Math.round(amount * 1_000_000) / 1_000_000
  const postedCurrency = String(row.currency ?? "USD").toUpperCase()

  const senderName =
    typeof meta.sender_name === "string" && meta.sender_name.trim()
      ? meta.sender_name.trim()
      : typeof meta.counterparty_name === "string" && meta.counterparty_name.trim()
        ? meta.counterparty_name.trim()
        : null
  const counterpartyAddress =
    row.counterparty_address != null
      ? String(row.counterparty_address)
      : typeof meta.counterparty_address === "string"
        ? meta.counterparty_address
        : typeof meta.from_address === "string"
          ? meta.from_address
          : typeof meta.sender_tron_address === "string"
            ? meta.sender_tron_address
            : null
  const senderDisplay =
    formatMaskedSenderDisplay({ senderName, counterpartyAddress }) || null

  const lifecycle = buildStablecoinDepositLifecycle({
    status: ledgerStatus,
    metadata: meta,
    createdAt,
    settledAt,
  })

  const processingAt = pickIso(
    meta.processing_at,
    meta.detected_at,
    createdAt,
  )
  const completedAt = pickIso(
    meta.on_chain_settled_at,
    meta.completed_at,
    settledAt,
  )

  const timingAnchors = resolveTransactionTimingAnchors({
    createdAt,
    startAnchor: "processing_at",
    metadata: meta,
    webhookCompletedAt: completedAt,
    lifecycle,
  })
  const transactionTiming = buildTransactionTimingRows({
    status: ledgerStatus,
    startedAt: timingAnchors.startedAt,
    completedAt: timingAnchors.completedAt,
    failedAt: timingAnchors.failedAt,
    showExpectedWhileInFlight: false,
    showStartedWhileInFlight: false,
    showTerminalDuration: false,
  })

  let feeAmount =
    typeof meta.fee_amount === "number" && Number.isFinite(meta.fee_amount)
      ? meta.fee_amount
      : 0
  if (feeAmount <= 0) {
    const gross =
      typeof meta.gross_usdt === "number" && Number.isFinite(meta.gross_usdt) ? meta.gross_usdt : 0
    if (gross > postedAmount && postedAmount > 0) {
      feeAmount = Math.round((gross - postedAmount) * 100) / 100
    }
  }

  return {
    lifecycle,
    postedAmount,
    postedCurrency,
    feeAmount,
    senderDisplay,
    schemeLabel: formatStablecoinDepositSchemeLabel({
      sourceCurrency: meta.source_currency ?? row.asset ?? row.currency,
      paymentRail: meta.source_payment_rail ?? meta.payment_rail ?? row.chain,
      chain: row.chain,
      asset: row.asset,
    }),
    sourcePaymentRail: String(meta.source_payment_rail ?? meta.payment_rail ?? row.chain ?? "solana"),
    transactionTiming,
    ledgerCreatedAt: createdAt,
    processingAt,
    completedAt,
  }
}
