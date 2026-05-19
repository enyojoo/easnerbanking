import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { syncWalletBalancesFromSolanaAtaForOwner } from "@/lib/wallet/sync-wallet-balances-from-ata"

export const runtime = "nodejs"

type WalletOwnerRow = {
  id: string
  owner_type: "individual" | "business" | string
  owner_ref: string
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  }
  const n = Math.max(1, Math.min(limit, items.length || 1))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return out
}

/**
 * Internal: seed `public.wallet_balances` from on-chain SPL ATA balances for all owners.
 *
 * Use after ledger backfill or when balances drifted from replaying historical transactions.
 */
export async function POST(request: Request) {
  try {
    assertInternalCronAuthorized(request)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized"
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }

  const admin = createSupabaseAdmin()

  const { data: owners, error } = await admin
    .from("wallet_owners")
    .select("id,owner_type,owner_ref")
    .limit(5000)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const rows = (owners as WalletOwnerRow[] | null) ?? []
  let attempted = 0
  let wrote = 0
  let skipped = 0
  const failures: Array<{ ownerId: string; reason: string }> = []

  await mapLimit(rows, 3, async (row) => {
    const ownerType = String(row.owner_type || "").toLowerCase()
    const ownerRef = String(row.owner_ref || "").trim()
    if (!ownerRef || (ownerType !== "business" && ownerType !== "individual")) {
      skipped += 1
      return
    }

    attempted += 1

    try {
      const synced = await syncWalletBalancesFromSolanaAtaForOwner(admin, String(row.id))
      if (!synced.ok) {
        skipped += 1
        return
      }
      wrote += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failures.push({ ownerId: String(row.id), reason: msg.slice(0, 200) })
    }
  })

  return NextResponse.json({
    ok: true,
    result: {
      owners: rows.length,
      attempted,
      wrote,
      skipped,
      failures: failures.slice(0, 50),
    },
  })
}

