export type TxRow = {
  id: string
  created_at?: string | null
  updated_at?: string | null
  status?: string | null
  currency?: string | null
  amount?: number | null
  direction?: string | null
  user_id?: string | null
  user?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    full_name?: string | null
  } | null
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

export function computeProviderLedgerDashboardExtras(transactions: TxRow[]) {
  let usdVolume = 0
  const byCurrency = new Map<string, { count: number; totalAmount: number }>()

  for (const t of transactions) {
    const code = String(t.currency || "").trim().toUpperCase() || "—"
    const amt = Number(t.amount) || 0
    if (code === "USD") {
      usdVolume += amt
    }
    const cur = byCurrency.get(code) || { count: 0, totalAmount: 0 }
    cur.count += 1
    cur.totalAmount += amt
    byCurrency.set(code, cur)
  }

  const topCurrencies = Array.from(byCurrency.entries())
    .map(([code, v]) => ({ code, count: v.count, totalAmount: v.totalAmount }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)

  const bucketDefs = [
    { label: "< 5 min", maxMin: 5 },
    { label: "5–30 min", maxMin: 30 },
    { label: "30 min – 2 h", maxMin: 120 },
    { label: "2 h – 24 h", maxMin: 1440 },
    { label: "24 h+", maxMin: Number.POSITIVE_INFINITY },
  ] as const
  const processingBuckets = bucketDefs.map((b) => ({ label: b.label, count: 0 }))

  for (const t of transactions) {
    if (String(t.status || "").toLowerCase() !== "completed") continue
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

  return { usdVolume, topCurrencies, processingBuckets }
}

export function processRecentActivity(transactions: TxRow[], limit = 10) {
  const slice = [...transactions].sort((a, b) => {
    const da = new Date(a.created_at || 0).getTime()
    const db = new Date(b.created_at || 0).getTime()
    return db - da
  }).slice(0, limit)

  return slice.map((tx) => {
    const direction = String(tx.direction || "").toLowerCase() === "in" ? "in" : "out"
    const status = String(tx.status || "pending").toLowerCase()
    const code = String(tx.currency || "").toUpperCase()
    const amountRaw = Number(tx.amount || 0)
    const amount =
      amountRaw && code
        ? `${amountRaw.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`
        : ""

    const message =
      status === "completed"
        ? direction === "out"
          ? "Payout completed"
          : "Funds received"
        : status === "failed"
          ? "Transfer failed"
          : status === "cancelled"
            ? "Transfer cancelled"
            : status === "processing"
              ? "Transfer processing"
              : "Transfer created"

    const u = tx.user
    const fromParts = u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() : ""
    const userLabel = u
      ? fromParts || (typeof u.full_name === "string" ? u.full_name.trim() : "") || u.email || undefined
      : undefined

    return {
      id: tx.id,
      type: `transaction_${status}`,
      message,
      user: userLabel,
      amount,
      time: relativeTimeLabel(tx.created_at || undefined),
    }
  })
}

export function parseOverviewWindow(searchParams: URLSearchParams): { preset: string; since: Date; until: Date } {
  const untilRaw = searchParams.get("until")
  const sinceRaw = searchParams.get("since")
  const presetParam = (searchParams.get("preset") || "7d").toLowerCase()

  const until = untilRaw ? new Date(untilRaw) : new Date()
  if (!Number.isFinite(until.getTime())) {
    const u = new Date()
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
