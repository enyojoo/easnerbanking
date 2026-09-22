/**
 * Tight second pass: unlabeled J8Xh inbounds ↔ nearby outbounds from the same vault.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/match-unlabeled-payout-fees.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/match-unlabeled-payout-fees.ts --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { buildOrgTreasuryInboundWriteMetadata } from "@easner/shared"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

const APPLY = process.argv.includes("--apply")
const PAGE = 200
const WINDOW_MS = 15 * 60 * 1000
const GRID_VA_SWEEP_TREASURY = "E6GjrWqtzTfm5ShTCxpphBzEuNt22goKDUKspkA9tJ3U"

function feeWalletAddresses(): string[] {
  const addrs = new Set<string>()
  for (const ledgerCurrency of ["USD", "EUR"] as const) {
    const owner = resolveWalletSendFeeSolanaAddress({ ledgerCurrency })
    if (!owner) continue
    addrs.add(owner)
    const ata = deriveStablecoinAssociatedTokenAddress(
      owner,
      ledgerCurrency === "EUR" ? "EURC" : "USDC",
    )
    if (ata) addrs.add(ata)
  }
  return [...addrs]
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
}

function close(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false
  return Math.abs(a - b) <= Math.max(0.02, Math.max(a, b) * 0.005)
}

function feeCandidates(meta: Record<string, unknown>, payoutAmount: number): number[] {
  const vals = [
    Number(meta.fee_wallet_sweep),
    Number(meta.easner_revenue_sweep_amount),
    Number(meta.processing_fee),
    Number(meta.easner_fee),
    Number((meta.payout_review as Record<string, unknown> | undefined)?.processing_fee),
  ].filter((n) => Number.isFinite(n) && n > 0)
  const onePct = Math.round(payoutAmount * 0.01 * 1e6) / 1e6
  if (onePct > 0) vals.push(onePct)
  return vals
}

async function ownerForAddress(admin: SupabaseClient, address: string) {
  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("wallet_owner_id, address")
    .or(`address.eq.${address},associated_token_account_address.eq.${address}`)
    .limit(1)
    .maybeSingle()
  const ownerId = String(wallet?.wallet_owner_id ?? "").trim()
  if (!ownerId) return null
  const { data: owner } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref")
    .eq("id", ownerId)
    .maybeSingle()
  if (!owner) return null
  return { ownerType: String(owner.owner_type), ownerRef: String(owner.owner_ref) }
}

async function pageInbounds(admin: SupabaseClient) {
  const addresses = feeWalletAddresses()
  const rows: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const address of addresses) {
    let offset = 0
    for (;;) {
      const { data, error } = await admin
        .from("transactions")
        .select(
          "id, easner_transaction_id, tx_hash, amount, currency, created_at, occurred_at, counterparty_address, metadata, payload, user_id, business_id",
        )
        .eq("direction", "in")
        .eq("wallet_address", address)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw error
      for (const row of data ?? []) {
        const id = String(row.id)
        if (seen.has(id)) continue
        seen.add(id)
        rows.push(row as Record<string, unknown>)
      }
      if (!data || data.length < PAGE) break
      offset += data.length
    }
  }
  return rows
}

function ownerScope(owner: { ownerType: string; ownerRef: string } | null) {
  if (!owner?.ownerRef) return { userId: null as string | null, businessId: null as string | null }
  if (owner.ownerType === "business") return { userId: null, businessId: owner.ownerRef }
  if (owner.ownerType === "individual" || owner.ownerType === "user") {
    return { userId: owner.ownerRef, businessId: null }
  }
  return { userId: null, businessId: null }
}

async function nearbyOuts(
  admin: SupabaseClient,
  input: { userId?: string | null; businessId?: string | null; at: string },
) {
  const t = Date.parse(input.at)
  if (!Number.isFinite(t)) return []
  const since = new Date(t - WINDOW_MS).toISOString()
  const until = new Date(t + WINDOW_MS).toISOString()
  const select =
    "easner_transaction_id, amount, created_at, occurred_at, user_id, business_id, metadata, provider, direction"
  const byCreated = admin
    .from("transactions")
    .select(select)
    .eq("direction", "out")
    .gte("created_at", since)
    .lte("created_at", until)
    .limit(80)
  const byOccurred = admin
    .from("transactions")
    .select(select)
    .eq("direction", "out")
    .gte("occurred_at", since)
    .lte("occurred_at", until)
    .limit(80)

  const scoped = (q: typeof byCreated) => {
    if (input.businessId) return q.eq("business_id", input.businessId)
    if (input.userId) return q.eq("user_id", input.userId)
    return null
  }
  const createdQ = scoped(byCreated)
  const occurredQ = scoped(byOccurred)
  if (!createdQ || !occurredQ) return []

  const [created, occurred] = await Promise.all([createdQ, occurredQ])
  const seen = new Set<string>()
  const rows: Array<Record<string, unknown>> = []
  for (const row of [...(created.data ?? []), ...(occurred.data ?? [])]) {
    const etid = String((row as { easner_transaction_id?: string }).easner_transaction_id ?? "")
    const createdAt = String((row as { created_at?: string }).created_at ?? "")
    const key = `${etid}:${createdAt}`
    if (!etid || seen.has(key)) continue
    seen.add(key)
    rows.push(row as Record<string, unknown>)
  }
  return rows
}

function scoreOuts(
  outs: Array<Record<string, unknown>>,
  amount: number,
  at: string,
) {
  const inboundTs = Date.parse(at)
  return outs
    .map((out) => {
      const meta = asMeta(out.metadata)
      const payoutAmount = Number(out.amount)
      const fees = feeCandidates(meta, payoutAmount)
      const feeHit = fees.find((fee) => close(fee, amount))
      if (!feeHit) return null
      const outTs = Date.parse(String(out.occurred_at ?? out.created_at ?? ""))
      const deltaMs = Number.isFinite(inboundTs) && Number.isFinite(outTs) ? Math.abs(inboundTs - outTs) : Number.POSITIVE_INFINITY
      return {
        etid: String(out.easner_transaction_id ?? ""),
        payoutAmount,
        feeHit,
        deltaMs,
        alreadyHasSweepHash: Boolean(String(meta.fee_wallet_sweep_tx_hash ?? "").trim()),
        provider: out.provider,
        created: out.created_at,
        activity: meta.activity_type ?? meta.yc_mode ?? meta.flow ?? meta.payout_type ?? null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.deltaMs - b.deltaMs)
}

function pickUnique(scored: ReturnType<typeof scoreOuts>) {
  if (scored.length === 0) return { best: null as (typeof scored)[0] | null, reason: null as string | null }
  const best = scored[0]
  const next = scored.find((row) => row.etid !== best.etid)
  if (next && next.deltaMs <= best.deltaMs + 60_000 && Math.abs(next.feeHit - best.feeHit) <= 0.02) {
    return { best: null, reason: "ambiguous_fee_amount" }
  }
  return { best, reason: "fee_amount_near_outbound" }
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const all = await pageInbounds(admin)
  const unlabeled = all.filter((row) => !String(asMeta(row.metadata).org_treasury_kind ?? "").trim())

  const results: Array<Record<string, unknown>> = []
  for (const row of unlabeled) {
    const etid = String(row.easner_transaction_id ?? "")
    const hash = String(row.tx_hash ?? "").trim()
    const amount = Number(row.amount)
    const at = String(row.occurred_at ?? row.created_at ?? "")
    const from = String(row.counterparty_address ?? asMeta(row.metadata).from_address ?? "").trim()
    const owner = from ? await ownerForAddress(admin, from) : null
    const { userId, businessId } = ownerScope(owner)
    const gridSweep = from === GRID_VA_SWEEP_TREASURY

    const outs = owner && !gridSweep ? await nearbyOuts(admin, { userId, businessId, at }) : []
    const scored = scoreOuts(outs, amount, at)
    const picked = pickUnique(scored)

    const hashTwin = hash
      ? await admin
          .from("transactions")
          .select("easner_transaction_id, direction, amount, provider, metadata")
          .eq("tx_hash", hash)
          .neq("easner_transaction_id", etid)
          .limit(5)
      : { data: [] }

    const twins = (hashTwin.data ?? []).map((t) => ({
      etid: t.easner_transaction_id,
      direction: t.direction,
      amount: t.amount,
      provider: t.provider,
      activity: asMeta(t.metadata).activity_type ?? asMeta(t.metadata).source ?? null,
    }))

    const p2pTwin = twins.find((t) => {
      const act = String(t.activity ?? "")
      return act === "easetag_p2p" || (t.direction === "in" && Number(t.amount) === amount)
    })
    let kind: "payout_fee" | "pay_in_fee" | null = null
    let related: string | null = null
    let reason = gridSweep
      ? "grid_va_sweep_stablecoin_deposit"
      : p2pTwin
        ? "easetag_or_receive_twin"
        : "unlabeled_stablecoin_deposit"

    if (picked.best && !p2pTwin && !gridSweep) {
      kind = "payout_fee"
      related = picked.best.etid
      reason = picked.reason ?? "fee_amount_near_outbound"
    } else if (picked.reason === "ambiguous_fee_amount") {
      reason = "ambiguous_fee_amount"
    }

    let patched = false
    if (kind && APPLY) {
      const current = asMeta(row.metadata)
      const next = {
        ...current,
        ...buildOrgTreasuryInboundWriteMetadata({
          kind,
          relatedEasnerTransactionId: related,
        }),
        org_treasury_match: reason,
      }
      const { error } = await admin
        .from("transactions")
        .update({ metadata: next, updated_at: new Date().toISOString() })
        .eq("id", String(row.id))
      if (error) throw error
      patched = true
    }

    results.push({
      etid,
      amount,
      from: from ? `${from.slice(0, 8)}…` : null,
      owner: owner ? `${owner.ownerType}:${owner.ownerRef.slice(0, 8)}` : null,
      kind,
      related,
      reason,
      patched: APPLY ? patched : Boolean(kind),
      candidates: scored,
      twins,
    })
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        unlabeled: unlabeled.length,
        classified: results.filter((r) => r.kind).length,
        skipped: results.filter((r) => !r.kind).length,
        rows: results,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
