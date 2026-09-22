/**
 * Find payout / pay-in / refund links the first backfill missed.
 *
 *   cd business && node --env-file=.env.local --import tsx scripts/investigate-unlabeled-fee-wallet-inbounds.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { deriveStablecoinAssociatedTokenAddress } from "@/lib/solana/ata"
import { resolveWalletSendFeeSolanaAddress } from "@/lib/wallet-send/fee-address"

const PAGE = 200
const HASH_META_KEYS = [
  "fee_wallet_sweep_tx_hash",
  "turnkey_tx_hash",
  "yc_crypto_deposit_tx_hash",
  "processing_fee_tx_hash",
  "margin_tx_hash",
  "fee_tx_hash",
]

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

function metaHasHash(meta: Record<string, unknown>, hash: string): string | null {
  for (const key of HASH_META_KEYS) {
    if (String(meta[key] ?? "").trim() === hash) return key
  }
  const nested = JSON.stringify(meta)
  if (nested.includes(hash)) return "metadata_text"
  return null
}

async function pageInbounds(admin: SupabaseClient, addresses: string[]) {
  const rows: Array<Record<string, unknown>> = []
  const seen = new Set<string>()
  for (const address of addresses) {
    let offset = 0
    for (;;) {
      const { data, error } = await admin
        .from("transactions")
        .select(
          "id, easner_transaction_id, tx_hash, amount, currency, created_at, occurred_at, counterparty_address, wallet_address, metadata, payload, user_id, business_id",
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

async function findByMetaHash(
  admin: SupabaseClient,
  key: string,
  hash: string,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await admin
    .from("transactions")
    .select("easner_transaction_id, direction, amount, provider, created_at, metadata")
    .filter(`metadata->>${key}`, "eq", hash)
    .limit(10)
  return (data ?? []) as Array<Record<string, unknown>>
}

async function findSameHashRows(
  admin: SupabaseClient,
  hash: string,
): Promise<Array<Record<string, unknown>>> {
  const { data } = await admin
    .from("transactions")
    .select(
      "easner_transaction_id, direction, amount, provider, created_at, counterparty_address, wallet_address, metadata, provider_transaction_id",
    )
    .eq("tx_hash", hash)
    .limit(20)
  return (data ?? []) as Array<Record<string, unknown>>
}

async function findYcByHash(admin: SupabaseClient, hash: string) {
  const hits: Array<Record<string, unknown>> = []
  const { data: byMeta } = await admin
    .from("yc_transfers")
    .select("id, transaction_id, mode, status, fee_wallet_sweep, metadata")
    .or(
      [
        `metadata->>fee_wallet_sweep_tx_hash.eq.${hash}`,
        `metadata->>yc_fee_wallet_refund_tx_hash.eq.${hash}`,
        `metadata->>yc_crypto_deposit_tx_hash.eq.${hash}`,
        `metadata->>turnkey_tx_hash.eq.${hash}`,
      ].join(","),
    )
    .limit(10)
  hits.push(...((byMeta ?? []) as Array<Record<string, unknown>>))
  return hits
}

async function findParentByFeeSendId(admin: SupabaseClient, sendId: string) {
  if (!sendId) return null
  for (const column of ["processing_fee_turnkey_send_id", "margin_turnkey_send_id"] as const) {
    const { data } = await admin
      .from("transactions")
      .select("easner_transaction_id, direction, amount, metadata")
      .filter(`metadata->>${column}`, "eq", sendId)
      .limit(3)
    if (data?.[0]) return { column, row: data[0] as Record<string, unknown> }
  }
  return null
}

async function findAmountTimeMatch(
  admin: SupabaseClient,
  input: {
    amount: number
    fromAddress: string | null
    occurredAt: string
  },
) {
  const amount = Number(input.amount)
  if (!(amount > 0) || amount > 50) return []
  const t = Date.parse(input.occurredAt)
  if (!Number.isFinite(t)) return []
  const since = new Date(t - 2 * 24 * 60 * 60 * 1000).toISOString()
  const until = new Date(t + 2 * 24 * 60 * 60 * 1000).toISOString()
  let q = admin
    .from("transactions")
    .select("easner_transaction_id, direction, amount, created_at, metadata, counterparty_address")
    .eq("direction", "out")
    .gte("created_at", since)
    .lte("created_at", until)
    .limit(40)
  const { data } = await q
  const matches = (data ?? []).filter((row) => {
    const meta = asMeta(row.metadata)
    const sweep = Number(meta.fee_wallet_sweep ?? meta.easner_revenue_sweep_amount ?? meta.processing_fee ?? 0)
    if (!(sweep > 0)) return false
    const close = Math.abs(sweep - amount) <= Math.max(0.02, amount * 0.005)
    if (!close) return false
    if (input.fromAddress && String(row.counterparty_address ?? "") === input.fromAddress) return true
    return close
  })
  return matches.slice(0, 5)
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const addresses = feeWalletAddresses()
  const all = await pageInbounds(admin, addresses)
  const unlabeled = all.filter((row) => {
    const meta = asMeta(row.metadata)
    return !String(meta.org_treasury_kind ?? "").trim()
  })

  const report: Array<Record<string, unknown>> = []
  for (const row of unlabeled) {
    const etid = String(row.easner_transaction_id ?? "")
    const hash = String(row.tx_hash ?? "").trim()
    const meta = asMeta(row.metadata)
    const payload = asMeta(row.payload)
    const amount = Number(row.amount)
    const fromAddress = String(row.counterparty_address ?? meta.from_address ?? "").trim() || null
    const occurredAt = String(row.occurred_at ?? row.created_at ?? "")

    const matches: Array<Record<string, unknown>> = []

    if (hash) {
      for (const key of HASH_META_KEYS) {
        const rows = await findByMetaHash(admin, key, hash)
        for (const hit of rows) {
          if (String(hit.easner_transaction_id) === etid) continue
          matches.push({
            via: `meta.${key}`,
            etid: hit.easner_transaction_id,
            direction: hit.direction,
            amount: hit.amount,
            provider: hit.provider,
          })
        }
      }

      const sameHash = await findSameHashRows(admin, hash)
      for (const hit of sameHash) {
        if (String(hit.easner_transaction_id) === etid) continue
        matches.push({
          via: "same_tx_hash",
          etid: hit.easner_transaction_id,
          direction: hit.direction,
          amount: hit.amount,
          provider: hit.provider,
          counterparty: hit.counterparty_address,
        })
        const sendId = String(hit.provider_transaction_id ?? "").trim()
        const parent = await findParentByFeeSendId(admin, sendId)
        if (parent) {
          matches.push({
            via: `parent.${parent.column}`,
            etid: parent.row.easner_transaction_id,
            direction: parent.row.direction,
            amount: parent.row.amount,
          })
        }
      }

      const yc = await findYcByHash(admin, hash)
      for (const hit of yc) {
        matches.push({
          via: "yc_transfers",
          transferId: hit.id,
          transactionId: hit.transaction_id,
          mode: hit.mode,
          status: hit.status,
          feeWalletSweep: hit.fee_wallet_sweep,
        })
      }
    }

    const amountHits = await findAmountTimeMatch(admin, { amount, fromAddress, occurredAt })
    for (const hit of amountHits) {
      matches.push({
        via: "amount_time",
        etid: hit.easner_transaction_id,
        direction: hit.direction,
        amount: hit.amount,
        created: hit.created_at,
      })
    }

    const unique = new Map<string, Record<string, unknown>>()
    for (const m of matches) {
      const key = `${m.via}:${m.etid ?? m.transferId ?? ""}`
      if (!unique.has(key)) unique.set(key, m)
    }

    report.push({
      etid,
      hash: hash.slice(0, 16),
      amount,
      currency: row.currency,
      created: row.created_at,
      from: fromAddress ? `${fromAddress.slice(0, 8)}…` : null,
      alreadySweep: Boolean(meta.fee_wallet_revenue_sweep),
      payloadSource: payload.source ?? null,
      matchCount: unique.size,
      matches: [...unique.values()],
    })
  }

  const withMatches = report.filter((r) => Number(r.matchCount) > 0)
  console.log(
    JSON.stringify(
      {
        scanned: all.length,
        unlabeled: unlabeled.length,
        withAnyMatch: withMatches.length,
        rows: report,
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
