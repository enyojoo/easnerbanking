import { formatMoneyDisplay, isVerificationDepositMetadata, toEasnerTransactionPrimaryLabel } from "@easner/shared"
import { resolveGlobalPayoutOffRampDetail } from "@/lib/transactions/resolve-global-payout-off-ramp"

export type TxRow = {
  id: string
  created_at?: string | null
  updated_at?: string | null
  occurred_at?: string | null
  status?: string | null
  currency?: string | null
  amount?: number | null
  direction?: string | null
  provider?: string | null
  user_id?: string | null
  business_id?: string | null
  metadata?: Record<string, unknown> | null
  payload?: Record<string, unknown> | null
  base_currency?: string | null
  base_amount?: number | null
  easner_transaction_id?: string | null
  user?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    full_name?: string | null
  } | null
  business?: {
    id: string
    name: string | null
  } | null
}

export type CurrencyFlow = "pay_in" | "payout"

export type TopCurrencyRow = {
  code: string
  count: number
  totalAmount: number
  /** Local payout fiat — informational; USD/EUR balance volume lives in volume KPIs. */
  dataOnly?: boolean
}

export type BalanceCurrencyCode = "USD" | "EUR"

export type VolumeBalanceSide = {
  moneyIn: number
  moneyOut: number
  total: number
}

export type VolumeBalanceKpi = Record<BalanceCurrencyCode, VolumeBalanceSide>

const BALANCE_CURRENCIES = new Set<BalanceCurrencyCode>(["USD", "EUR"])

export type OfficeTxPresentation = {
  displayAmount: number
  displayCurrency: string
  balanceAmount: number
  balanceCurrency: BalanceCurrencyCode | null
}

function relativeTimeLabel(iso: string | null | undefined): string {
  if (!iso) return "—"
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return "—"
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function normalizeDirection(raw: string | null | undefined): "in" | "out" {
  return String(raw || "").toLowerCase() === "in" ? "in" : "out"
}

function normalizeStatus(raw: string | null | undefined): string {
  return String(raw || "pending").trim().toLowerCase()
}

function roundAmount(n: number): number {
  return Math.round(n * 100) / 100
}

function asBalanceCurrency(raw: string | null | undefined): BalanceCurrencyCode | null {
  const code = String(raw || "").trim().toUpperCase()
  if (code === "USDC") return "USD"
  if (code === "EURC") return "EUR"
  return BALANCE_CURRENCIES.has(code as BalanceCurrencyCode) ? (code as BalanceCurrencyCode) : null
}

function readPayoutReview(meta: Record<string, unknown>) {
  const raw = meta.payout_review
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
}

/**
 * List/display amounts (payout local currency) vs balance legs (USD/EUR debited or credited).
 * Mirrors business `mapRowToBusinessTransaction` / mobile ledger mapping.
 */
export function resolveOfficeTxPresentation(tx: TxRow): OfficeTxPresentation {
  const global = resolveGlobalPayoutOffRampDetail(tx as Record<string, unknown>)
  const meta = tx.metadata || {}
  const direction = normalizeDirection(tx.direction)

  if (global) {
    const meta = tx.metadata || {}
    const balanceCurrency =
      asBalanceCurrency(global.ledgerCurrency) ??
      asBalanceCurrency(String(meta.send_currency ?? "")) ??
      asBalanceCurrency(tx.base_currency) ??
      asBalanceCurrency(tx.currency)
    const balanceAmount = Number(
      meta.total_debited ??
        global.ledgerAmount ??
        meta.crypto_authorized_amount ??
        tx.base_amount ??
        tx.amount ??
        0,
    )
    return {
      displayAmount: global.displayAmount,
      displayCurrency: String(global.displayCurrency || "").toUpperCase(),
      balanceAmount: Number.isFinite(balanceAmount) ? balanceAmount : 0,
      balanceCurrency,
    }
  }

  if (direction === "in") {
    const displayCurrency = String(
      meta.fiat_deposit_currency ?? meta.settled_currency ?? tx.currency ?? "USD",
    ).toUpperCase()
    const displayAmount = Number(
      meta.fiat_deposit_amount ?? meta.settled_amount ?? tx.amount ?? 0,
    )
    const balanceCurrency =
      asBalanceCurrency(displayCurrency) ??
      asBalanceCurrency(tx.base_currency) ??
      asBalanceCurrency(tx.currency)
    const balanceAmount = balanceCurrency
      ? Number(
          balanceCurrency === displayCurrency
            ? displayAmount
            : (tx.base_amount ?? tx.amount ?? displayAmount),
        )
      : 0
    return { displayAmount, displayCurrency, balanceAmount, balanceCurrency }
  }

  const payoutReview = readPayoutReview(meta)
  const receiveCurrency = String(
    meta.receive_currency ?? meta.fiat_currency ?? payoutReview?.receive_currency ?? "",
  )
    .trim()
    .toUpperCase()
  const receiveAmount = Number(meta.receive_amount ?? payoutReview?.receive_amount ?? tx.amount ?? 0)
  const displayCurrency = receiveCurrency || String(tx.currency ?? "USD").toUpperCase()
  const displayAmount = receiveCurrency ? receiveAmount : Number(tx.amount ?? 0)

  const balanceCurrency =
    asBalanceCurrency(meta.send_currency) ??
    asBalanceCurrency(payoutReview?.send_currency) ??
    asBalanceCurrency(tx.base_currency) ??
    asBalanceCurrency(tx.currency)
  const balanceAmount = balanceCurrency
    ? Number(
        meta.total_debited ??
          payoutReview?.total_debited ??
          meta.crypto_authorized_amount ??
          tx.base_amount ??
          tx.amount ??
          0,
      )
    : 0

  return { displayAmount, displayCurrency, balanceAmount, balanceCurrency }
}

export function formatOfficeTxAmount(tx: TxRow): string {
  const { displayAmount, displayCurrency } = resolveOfficeTxPresentation(tx)
  const meta = tx.metadata || {}
  const direction = normalizeDirection(tx.direction)
  let amount = displayAmount
  if (
    direction === "in" &&
    isVerificationDepositMetadata(meta) &&
    (!Number.isFinite(amount) || amount <= 0)
  ) {
    amount = Number(meta.fiat_deposit_amount ?? meta.fiat_amount ?? tx.amount ?? 0)
  }
  if (!Number.isFinite(amount) || amount < 0 || !displayCurrency) return ""
  if (amount === 0) return ""
  return formatMoneyDisplay(amount, displayCurrency)
}

export function formatOfficeTxBalanceAmount(tx: TxRow): string {
  const { balanceAmount, balanceCurrency } = resolveOfficeTxPresentation(tx)
  if (!balanceCurrency || !Number.isFinite(balanceAmount) || balanceAmount <= 0) return ""
  return formatMoneyDisplay(balanceAmount, balanceCurrency)
}

export function officeTxFlowLabel(tx: TxRow): "Pay-in" | "Payout" {
  return normalizeDirection(tx.direction) === "in" ? "Pay-in" : "Payout"
}

export function activityAccountLabel(tx: TxRow): {
  label: string | undefined
  kind: "business" | "individual"
} {
  const businessName = String(tx.business?.name ?? "").trim()
  if (tx.business_id && businessName) {
    return { label: businessName, kind: "business" }
  }

  const u = tx.user
  const fromParts = u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() : ""
  const userLabel = u
    ? fromParts || (typeof u.full_name === "string" ? u.full_name.trim() : "") || u.email || undefined
    : undefined
  return { label: userLabel, kind: "individual" }
}

export function activityPrimaryLabel(tx: TxRow): string {
  const global = resolveGlobalPayoutOffRampDetail(tx as Record<string, unknown>)
  if (global?.displayHeroTitle) return global.displayHeroTitle
  if (global?.displayDescription) return global.displayDescription
  return toEasnerTransactionPrimaryLabel({
    provider: String(tx.provider ?? "noah"),
    direction: normalizeDirection(tx.direction),
    metadata: tx.metadata,
    payload: tx.payload,
  })
}

export function activityStatusSuffix(status: string): string {
  const s = normalizeStatus(status)
  if (s === "settled" || s === "completed" || s === "deposited") return "Completed"
  if (s === "failed") return "Failed"
  if (s === "cancelled" || s === "canceled") return "Cancelled"
  if (s === "processing" || s === "converting" || s === "converted" || s === "confirmed") return "Processing"
  if (s === "pending" || s === "unknown") return "Pending"
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** @deprecated Use volumeBalance KPI — kept for tests migrating off USD-only helper. */
export function volumeUsdContribution(tx: TxRow): number {
  const { balanceAmount, balanceCurrency } = resolveOfficeTxPresentation(tx)
  return balanceCurrency === "USD" && Number.isFinite(balanceAmount) ? balanceAmount : 0
}

type CurrencyBucket = { code: string; flow: CurrencyFlow; amount: number; dataOnly?: boolean }

function pushBucket(
  buckets: CurrencyBucket[],
  code: string,
  flow: CurrencyFlow,
  amount: number,
  dataOnly = false,
) {
  const normalized = String(code || "").trim().toUpperCase()
  if (!normalized || normalized === "—" || !Number.isFinite(amount) || amount <= 0) return
  buckets.push({ code: normalized, flow, amount, dataOnly })
}

/**
 * Top-currency buckets for the dashboard table.
 * Pay-ins use display currency. Cross-currency payouts use local receive fiat only —
 * linked USD/EUR balance legs are excluded here and counted in `volumeBalance` instead.
 */
export function extractCurrencyBuckets(tx: TxRow): CurrencyBucket[] {
  const pres = resolveOfficeTxPresentation(tx)
  const direction = normalizeDirection(tx.direction)
  const buckets: CurrencyBucket[] = []

  if (direction === "in") {
    pushBucket(buckets, pres.displayCurrency, "pay_in", pres.displayAmount)
    return buckets
  }

  const localCode = pres.displayCurrency
  const localAmount = pres.displayAmount
  const isCrossCurrencyPayout =
    Boolean(pres.balanceCurrency) &&
    Boolean(localCode) &&
    localCode !== pres.balanceCurrency

  if (isCrossCurrencyPayout) {
    pushBucket(buckets, localCode, "payout", localAmount, true)
    return buckets
  }

  if (pres.balanceCurrency) {
    pushBucket(buckets, pres.balanceCurrency, "payout", pres.balanceAmount)
  } else if (localCode) {
    pushBucket(buckets, localCode, "payout", localAmount)
  }

  return buckets
}

function emptyVolumeSide(): VolumeBalanceSide {
  return { moneyIn: 0, moneyOut: 0, total: 0 }
}

export function createEmptyVolumeBalance(): VolumeBalanceKpi {
  return { USD: emptyVolumeSide(), EUR: emptyVolumeSide() }
}

export function computeProviderLedgerDashboardExtras(transactions: TxRow[]) {
  const volumeBalance = createEmptyVolumeBalance()
  const byCode = new Map<string, { code: string; count: number; totalAmount: number; dataOnly: boolean }>()

  for (const t of transactions) {
    const pres = resolveOfficeTxPresentation(t)
    const direction = normalizeDirection(t.direction)

    if (pres.balanceCurrency && pres.balanceAmount > 0) {
      const side = volumeBalance[pres.balanceCurrency]
      if (direction === "in") {
        side.moneyIn += pres.balanceAmount
      } else {
        side.moneyOut += pres.balanceAmount
      }
      side.total = side.moneyIn + side.moneyOut
    }

    for (const bucket of extractCurrencyBuckets(t)) {
      const cur = byCode.get(bucket.code) || {
        code: bucket.code,
        count: 0,
        totalAmount: 0,
        dataOnly: true,
      }
      cur.count += 1
      cur.totalAmount += bucket.amount
      if (!bucket.dataOnly) cur.dataOnly = false
      byCode.set(bucket.code, cur)
    }
  }

  for (const code of ["USD", "EUR"] as const) {
    const side = volumeBalance[code]
    side.moneyIn = roundAmount(side.moneyIn)
    side.moneyOut = roundAmount(side.moneyOut)
    side.total = roundAmount(side.total)
  }

  const topCurrencies: TopCurrencyRow[] = Array.from(byCode.values())
    .map((v) => ({
      code: v.code,
      count: v.count,
      totalAmount: roundAmount(v.totalAmount),
      dataOnly: v.dataOnly || undefined,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count)
    .slice(0, 20)

  const bucketDefs = [
    { label: "< 5 min", maxMin: 5 },
    { label: "5–30 min", maxMin: 30 },
    { label: "30 min – 2 h", maxMin: 120 },
    { label: "2 h – 24 h", maxMin: 1440 },
    { label: "24 h+", maxMin: Number.POSITIVE_INFINITY },
  ] as const
  const processingBuckets = bucketDefs.map((b) => ({ label: b.label, count: 0 }))

  for (const t of transactions) {
    const st = normalizeStatus(t.status)
    if (st !== "completed" && st !== "settled" && st !== "deposited") continue
    const start = t.created_at ? new Date(t.created_at).getTime() : NaN
    const end = t.updated_at ? new Date(t.updated_at).getTime() : NaN
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue
    const minutes = (end - start) / 60000
    if (minutes < 5) processingBuckets[0].count += 1
    else if (minutes < 30) processingBuckets[1].count += 1
    else if (minutes < 120) processingBuckets[2].count += 1
    else if (minutes < 1440) processingBuckets[3].count += 1
    else processingBuckets[4].count += 1
  }

  const legacyUsdVolume = volumeBalance.USD.total

  return { volumeBalance, totalVolumeUsd: legacyUsdVolume, topCurrencies, processingBuckets }
}

export function processRecentActivity(transactions: TxRow[], limit = 10) {
  const slice = [...transactions]
    .sort((a, b) => {
      const da = new Date(a.occurred_at || a.created_at || 0).getTime()
      const db = new Date(b.occurred_at || b.created_at || 0).getTime()
      return db - da
    })
    .slice(0, limit)

  return slice.map((tx) => {
    const status = normalizeStatus(tx.status)
    const amount = formatOfficeTxAmount(tx)
    const primary = activityPrimaryLabel(tx)
    const message = primary
    const account = activityAccountLabel(tx)

    const pres = resolveOfficeTxPresentation(tx)

    return {
      id: tx.id,
      type: `transaction_${status}`,
      message,
      productLabel: primary,
      statusLabel: activityStatusSuffix(status),
      user: account.label,
      userKind: account.kind,
      who: account.label,
      amount,
      displayAmount: pres.displayAmount,
      displayCurrency: pres.displayCurrency,
      balanceAmount: pres.balanceAmount,
      balanceCurrency: pres.balanceCurrency,
      time: relativeTimeLabel(tx.occurred_at || tx.created_at || undefined),
    }
  })
}

export function buildRecentTransactionsPreview(transactions: TxRow[], limit = 10) {
  return [...transactions]
    .sort((a, b) => {
      const da = new Date(a.occurred_at || a.created_at || 0).getTime()
      const db = new Date(b.occurred_at || b.created_at || 0).getTime()
      return db - da
    })
    .slice(0, limit)
    .map((tx) => {
      const account = activityAccountLabel(tx)
      const direction = normalizeDirection(tx.direction)
      const pres = resolveOfficeTxPresentation(tx)
      const amountFormatted = formatOfficeTxAmount(tx)
      const balanceFormatted =
        pres.balanceCurrency && pres.balanceAmount > 0
          ? formatMoneyDisplay(pres.balanceAmount, pres.balanceCurrency)
          : null

      return {
        id: tx.id,
        easner_transaction_id: tx.easner_transaction_id ?? null,
        provider: String(tx.provider || "—"),
        direction,
        flowLabel: direction === "in" ? "Pay-in" : "Payout",
        status: normalizeStatus(tx.status),
        statusLabel: activityStatusSuffix(tx.status),
        label: activityPrimaryLabel(tx),
        user: account.label || "—",
        userKind: account.kind,
        who: account.label || "—",
        amount: pres.displayAmount,
        currency: pres.displayCurrency,
        amountFormatted,
        balanceAmount: pres.balanceAmount,
        balanceCurrency: pres.balanceCurrency,
        balanceFormatted,
        occurred_at: tx.occurred_at || tx.created_at || null,
      }
    })
}

export function parseOverviewWindow(searchParams: URLSearchParams): { preset: string; since: Date; until: Date } {
  const untilRaw = searchParams.get("until")
  const sinceRaw = searchParams.get("since")
  const presetParam = (searchParams.get("preset") || "7d").toLowerCase()

  const until = untilRaw ? new Date(untilRaw) : new Date()
  if (!Number.isFinite(until.getTime())) {
    return parseOverviewWindow(new URLSearchParams({ preset: presetParam }))
  }

  let since: Date
  let preset = presetParam

  if (sinceRaw) {
    since = new Date(sinceRaw)
    if (!Number.isFinite(since.getTime())) {
      since = new Date(until.getTime() - 7 * 24 * 60 * 60 * 1000)
      preset = "7d"
    }
  } else {
    const ms =
      preset === "24h" || preset === "1d"
        ? 24 * 60 * 60 * 1000
        : preset === "30d"
          ? 30 * 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000
    if (preset !== "24h" && preset !== "1d" && preset !== "30d") {
      preset = "7d"
    }
    since = new Date(until.getTime() - ms)
  }

  return { preset, since, until }
}
