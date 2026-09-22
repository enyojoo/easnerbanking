import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { resolveLedgerListScope, type LedgerListScope } from "@/lib/transactions-ledger-scope"
import { LEDGER_LIST_SELECT } from "@/lib/ledger/ledger-select"
import { filterSupersededPendingGlobalPayoutRows, mapLedgerRowToMobileListItem } from "@easner/shared"
import { mapRowToBusinessTransaction } from "@/lib/transactions/map-row-to-business"
import {
  applyLedgerListCursorFilter,
  buildNextLedgerListCursor,
  decodeLedgerListCursor,
} from "@/lib/transactions/ledger-list-cursor"
import {
  applyLedgerListCreatedAtRange,
  parseLedgerListIsoBound,
} from "@/lib/transactions/ledger-list-range"
import { enrichYcFundBalanceOfficeRows } from "@/lib/admin/enrich-yc-fund-balance-office-rows"
import { listReportingFxRates } from "@/lib/fx/exchange-rates"
import { sumMoneyFlows } from "@/lib/transactions/money-flow-summary"

const PAGE = 200
const MAX_PAGES = 50

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scopeRes = await resolveLedgerListScope(request, user.id)
  if (!scopeRes.ok) return scopeRes.response
  const { scope, businessId } = scopeRes

  const url = new URL(request.url)
  const from = parseLedgerListIsoBound(url.searchParams.get("from"))
  const to = parseLedgerListIsoBound(url.searchParams.get("to"))
  const baseCurrency = String(url.searchParams.get("base") ?? "USD").trim().toUpperCase() || "USD"

  const admin = createSupabaseAdmin()
  try {
    const [fxRates, rows] = await Promise.all([
      listReportingFxRates(admin),
      loadAllVisibleRows({
        admin,
        scope,
        businessId,
        userId: user.id,
        from,
        to,
      }),
    ])

    const mapped =
      scope === "business"
        ? rows.map((row) => mapRowToBusinessTransaction(row))
        : rows.map((row) => mapLedgerRowToMobileListItem(row))

    const summary = sumMoneyFlows(mapped, baseCurrency, fxRates)
    return NextResponse.json({
      ...summary,
      currency: baseCurrency,
      from,
      to,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load money-flow summary"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

async function loadAllVisibleRows(input: {
  admin: ReturnType<typeof createSupabaseAdmin>
  scope: LedgerListScope
  businessId: string | null
  userId: string
  from: string | null
  to: string | null
}): Promise<Record<string, unknown>[]> {
  const collected: Record<string, unknown>[] = []
  let cursorRaw: string | null = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = input.admin
      .from("transactions")
      .select(LEDGER_LIST_SELECT)
      .eq("hidden_from_feed", false)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE + 1)

    if (input.scope === "business") {
      query = query.eq("business_id", input.businessId as string)
    } else {
      query = query.eq("user_id", input.userId).is("business_id", null)
    }

    query = applyLedgerListCreatedAtRange(query, input.from, input.to)
    const cursor = decodeLedgerListCursor(cursorRaw)
    if (cursor) {
      query = applyLedgerListCursorFilter(query, cursor)
    }

    const { data, error } = await query
    if (error) {
      throw new Error(error.message)
    }

    const rawRows = (data ?? []) as Record<string, unknown>[]
    const deduped = filterSupersededPendingGlobalPayoutRows(
      rawRows as Parameters<typeof filterSupersededPendingGlobalPayoutRows>[0],
    ) as Record<string, unknown>[]
    const { visible, nextCursor } = buildNextLedgerListCursor(deduped, PAGE)
    const enriched = await enrichYcFundBalanceOfficeRows(input.admin, visible)
    collected.push(...enriched)
    if (!nextCursor || visible.length === 0) break
    cursorRaw = nextCursor
  }

  return collected
}
