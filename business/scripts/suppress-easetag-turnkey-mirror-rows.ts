/**
 * Tag (or delete) Turnkey inbound rows that duplicate Easetag P2P payee credits / chain settlement.
 * Reverses duplicate `wallet_balances` credits when `balance_delta_applied` was set on the mirror row.
 *
 * Usage:
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-easetag-turnkey-mirror-rows.ts --dry-run
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-easetag-turnkey-mirror-rows.ts
 *   cd business && node --env-file=.env.local --import tsx scripts/suppress-easetag-turnkey-mirror-rows.ts --delete
 */
import { createSupabaseAdmin } from "../lib/supabase/admin"
import { applyWalletBalanceDelta } from "../lib/wallet/wallet-balances-db"

const dryRun = process.argv.includes("--dry-run")
const deleteMirrors = process.argv.includes("--delete")

function amountsRoughlyEqual(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false
  return Math.abs(a - b) <= Math.max(0.02, a * 0.002)
}

type EasetagMirrorScope = {
  userId: string | null
  businessId: string | null
  amount: number
  transferGroupId: string
}

function scopeMatches(
  row: { user_id: string | null; business_id: string | null },
  scope: { userId: string | null; businessId: string | null },
): boolean {
  if (scope.businessId) return row.business_id === scope.businessId
  return row.user_id === scope.userId
}

function registerHash(
  map: Map<string, EasetagMirrorScope>,
  hash: string,
  scope: EasetagMirrorScope,
): void {
  const h = hash.trim()
  if (!h) return
  if (!map.has(h)) map.set(h, scope)
}

async function main() {
  const admin = createSupabaseAdmin()
  const hashToScope = new Map<string, EasetagMirrorScope>()

  const { data: settlements, error: setErr } = await admin
    .from("easetag_settlements")
    .select("transfer_group_id, tx_hash, payee_user_id, payee_business_id, amount")
    .not("tx_hash", "is", null)
    .limit(5000)
  if (setErr) throw setErr

  for (const row of settlements ?? []) {
    const hx = String(row.tx_hash ?? "").trim()
    if (!hx) continue
    registerHash(hashToScope, hx, {
      userId: String(row.payee_user_id),
      businessId: row.payee_business_id != null ? String(row.payee_business_id) : null,
      amount: Number(row.amount ?? 0),
      transferGroupId: String(row.transfer_group_id),
    })
  }

  const { data: p2pRows, error: p2pErr } = await admin
    .from("transactions")
    .select("provider_transaction_id, tx_hash, metadata, amount, user_id, business_id, direction")
    .eq("provider", "easner_internal")
    .like("provider_transaction_id", "easetag_p2p:%")
    .limit(10000)
  if (p2pErr) throw p2pErr

  const creditByTransferGroup = new Map<
    string,
    { userId: string | null; businessId: string | null; amount: number }
  >()
  for (const row of p2pRows ?? []) {
    const ptid = String(row.provider_transaction_id ?? "")
    const m = ptid.match(/^easetag_p2p:([^:]+):credit$/)
    if (!m) continue
    creditByTransferGroup.set(m[1]!, {
      userId: row.user_id != null ? String(row.user_id) : null,
      businessId: row.business_id != null ? String(row.business_id) : null,
      amount: Number(row.amount ?? 0),
    })
  }

  for (const debit of p2pRows ?? []) {
    const ptid = String(debit.provider_transaction_id ?? "")
    const m = ptid.match(/^easetag_p2p:([^:]+):debit$/)
    if (!m) continue
    const transferGroupId = m[1]!
    const meta = (debit.metadata as Record<string, unknown> | undefined) ?? {}
    const credit = creditByTransferGroup.get(transferGroupId)
    const scope: EasetagMirrorScope = {
      userId: credit?.userId ?? null,
      businessId: credit?.businessId ?? null,
      amount: Number(credit?.amount ?? debit.amount ?? 0),
      transferGroupId,
    }
    if (!scope.userId && !scope.businessId) continue

    const hashes = [
      String(debit.tx_hash ?? "").trim(),
      String(meta.turnkey_tx_hash ?? "").trim(),
    ].filter(Boolean)
    for (const h of hashes) registerHash(hashToScope, h, scope)
  }

  const { data: turnkeyRows, error: tkErr } = await admin
    .from("transactions")
    .select("id, tx_hash, user_id, business_id, metadata, amount, currency, hidden_from_feed")
    .eq("provider", "turnkey")
    .eq("direction", "in")
    .not("tx_hash", "is", null)
    .limit(5000)
  if (tkErr) throw tkErr

  let updated = 0
  for (const row of turnkeyRows ?? []) {
    const prior = (row.metadata as Record<string, unknown> | undefined) ?? {}
    if (prior.easetag_settlement_leg === true) continue
    if (
      prior.easetag_p2p_chain_mirror === true &&
      prior.suppress_in_feed === true &&
      row.hidden_from_feed === true &&
      !deleteMirrors
    ) {
      continue
    }

    const h = String(row.tx_hash ?? "").trim()
    const userId = row.user_id != null ? String(row.user_id) : null
    const businessId = row.business_id != null ? String(row.business_id) : null
    const amount = Number(row.amount ?? 0)

    let linkedTransferGroupId: string | null = null

    if (!h || !hashToScope.has(h)) continue
    const scope = hashToScope.get(h)!
    if (!scopeMatches({ user_id: userId, business_id: businessId }, scope)) continue
    if (!amountsRoughlyEqual(amount, scope.amount)) continue

    linkedTransferGroupId = scope.transferGroupId

    const reverseBalance =
      prior.balance_delta_applied === true && prior.easetag_p2p_chain_mirror_reversed !== true

    console.log(
      `${dryRun ? "[dry-run] " : ""}${deleteMirrors ? "delete" : "suppress"} easetag turnkey mirror id=${row.id} tx=${h.slice(0, 12)}…` +
        ` transfer_group=${linkedTransferGroupId ?? "?"}` +
        (reverseBalance ? " (reverse balance delta)" : ""),
    )

    if (!dryRun) {
      if (reverseBalance && Number.isFinite(amount) && amount > 0) {
        await applyWalletBalanceDelta(admin, {
          businessId,
          userId: businessId ? null : userId,
          currency: String(row.currency ?? "USD"),
          delta: -amount,
        })
      }

      if (deleteMirrors) {
        await admin.from("transactions").delete().eq("id", row.id)
      } else {
        await admin
          .from("transactions")
          .update({
            metadata: {
              ...prior,
              suppress_in_feed: true,
              easetag_p2p_chain_mirror: true,
              ...(linkedTransferGroupId ? { transfer_group_id: linkedTransferGroupId } : {}),
              ...(reverseBalance ? { easetag_p2p_chain_mirror_reversed: true } : {}),
            },
            hidden_from_feed: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id)
      }
    }
    updated += 1
  }

  console.log(
    `Done. ${updated} Easetag Turnkey mirror row(s) ${dryRun ? "would be " : ""}` +
      `${deleteMirrors ? "deleted" : "tagged"}.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
