import { NextResponse } from "next/server"
import { assertInternalCronAuthorized } from "@/lib/api/internal-auth"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getTurnkeyDisplayBalancesUsdEur } from "@/lib/wallet/turnkey-chain-balances"
import { upsertWalletBalanceSnapshot } from "@/lib/wallet/wallet-balances-db"

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
 * Internal: seed `public.wallet_balances` by snapshotting current Turnkey balances for all owners.
 *
 * This is meant to be run after deploying the `wallet_balances` table so the DB becomes the
 * primary source-of-truth immediately (even if Turnkey is rate-limiting during cold start).
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

    const ctx =
      ownerType === "business"
        ? ({
            scope: "business",
            subjectBusinessId: ownerRef,
            subjectUserId: ownerRef, // unused in business scope by our resolver; keep present for type-shape
          } as any)
        : ({
            scope: "individual",
            subjectUserId: ownerRef,
            subjectBusinessId: null,
          } as any)

    try {
      const result = await getTurnkeyDisplayBalancesUsdEur(admin, ctx)
      if (result.source !== "turnkey") {
        skipped += 1
        return
      }

      const businessId = ownerType === "business" ? ownerRef : null
      const userId = ownerType === "individual" ? ownerRef : null

      await Promise.all([
        upsertWalletBalanceSnapshot(admin, {
          businessId,
          userId,
          currency: "USD",
          availableBalance: Number(result.USD) || 0,
        }),
        upsertWalletBalanceSnapshot(admin, {
          businessId,
          userId,
          currency: "EUR",
          availableBalance: Number(result.EUR) || 0,
        }),
      ])
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

