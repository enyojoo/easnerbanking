import { createClient } from "@supabase/supabase-js"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const cases = [
  { etid: "ETID60822628", amount: 1, at: "2026-06-05T03:03:19+00:00", from: "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC" },
  { etid: "ETID72407784", amount: 1, at: "2026-06-05T10:07:32+00:00", from: "CZL3uoLy1j6Hye3tnrJQ82yWG3nKwcncQfUmquvHxvfC" },
  { etid: "ETID97484240", amount: 2, at: "2026-08-28T05:45:28+00:00", from: "7sNz8PvUjDX5WPq8d1VBTR2AWLqDXDbuUFMrNm6iQu6y" },
  { etid: "ETID75018692", amount: 2, at: "2026-08-28T06:39:15+00:00", from: "7sNz8PvUjDX5WPq8d1VBTR2AWLqDXDbuUFMrNm6iQu6y" },
  { etid: "ETID05367608", amount: 1, at: "2026-08-28T16:17:18+00:00", from: "Hmc2dLxZZ4xfHqn2wFCTBu11oCpYiuwsj23JBjJmD4ni" },
  { etid: "ETID96036469", amount: 1, at: "2026-08-28T21:20:19+00:00", from: "Hmc2dLxZZ4xfHqn2wFCTBu11oCpYiuwsj23JBjJmD4ni" },
  { etid: "ETID83507335", amount: 72, at: "2026-08-31T00:14:48+00:00", from: "Hmc2dLxZZ4xfHqn2wFCTBu11oCpYiuwsj23JBjJmD4ni" },
  { etid: "ETID97214296", amount: 1, at: "2026-09-01T01:43:05+00:00", from: "Hmc2dLxZZ4xfHqn2wFCTBu11oCpYiuwsj23JBjJmD4ni" },
  { etid: "ETID13269066", amount: 0.06, at: "2026-08-31T01:26:31+00:00", from: "4RQ7cT6cxrsL7F8m6VBDUix1N8J4TjjA7dB6dfSbWMdh" },
  { etid: "ETID52128192", amount: 0.05, at: "2026-09-15T19:30:21+00:00", from: "4RQ7cT6cxrsL7F8m6VBDUix1N8J4TjjA7dB6dfSbWMdh" },
]

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function close(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.02, Math.max(a, b) * 0.005)
}

function feeVals(meta: Record<string, unknown>, amount: number): number[] {
  return [
    Number(meta.processing_fee),
    Number(meta.fee_wallet_sweep),
    Number(meta.easner_fee),
    Number(meta.easner_revenue_sweep_amount),
    Math.round(amount * 0.01 * 1e6) / 1e6,
  ].filter((n) => Number.isFinite(n) && n > 0)
}

async function main() {
  const report: Record<string, unknown> = {}

  for (const c of cases) {
    const t = Date.parse(c.at)
    const since = new Date(t - 6 * 3600_000).toISOString()
    const until = new Date(t + 6 * 3600_000).toISOString()
    const { data: outs } = await admin
      .from("transactions")
      .select("easner_transaction_id, direction, amount, created_at, occurred_at, provider, user_id, business_id, counterparty_address, metadata, tx_hash")
      .eq("direction", "out")
      .gte("created_at", since)
      .lte("created_at", until)
      .limit(80)
    const feeHits = (outs ?? [])
      .map((row) => {
        const meta = asMeta(row.metadata)
        const fees = feeVals(meta, Number(row.amount))
        const feeHit = fees.find((f) => close(f, c.amount))
        if (!feeHit) return null
        return {
          etid: row.easner_transaction_id,
          amount: row.amount,
          feeHit,
          provider: row.provider,
          created: row.created_at,
          user: String(row.user_id ?? "").slice(0, 8),
          biz: String(row.business_id ?? "").slice(0, 8) || null,
          activity: meta.activity_type ?? meta.yc_mode ?? meta.flow ?? meta.source ?? null,
          from: row.counterparty_address,
        }
      })
      .filter(Boolean)

    const { data: sameFrom } = await admin
      .from("transactions")
      .select("easner_transaction_id, direction, amount, created_at, provider, wallet_address, counterparty_address, metadata")
      .or(`counterparty_address.eq.${c.from},wallet_address.eq.${c.from}`)
      .order("created_at", { ascending: false })
      .limit(15)

    report[c.etid] = {
      amount: c.amount,
      from: c.from.slice(0, 8),
      at: c.at,
      feeHits,
      sameFrom: (sameFrom ?? []).map((row) => ({
        etid: row.easner_transaction_id,
        dir: row.direction,
        amount: row.amount,
        created: row.created_at,
        provider: row.provider,
        wallet: String(row.wallet_address ?? "").slice(0, 8),
        from: String(row.counterparty_address ?? "").slice(0, 8),
        activity: asMeta(row.metadata).activity_type ?? asMeta(row.metadata).source ?? null,
      })),
    }
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
