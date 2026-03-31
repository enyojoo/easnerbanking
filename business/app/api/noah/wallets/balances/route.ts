import { NextResponse } from "next/server"
import { noahFetch } from "@/lib/noah/http"
import { mapNoahBalancesToMobile } from "@/lib/noah/balance-map"
import { requireAuth, requireNoahEnv } from "../../_helpers"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getGlobalCurrencyPolicies } from "@/lib/accounts/currency-controls"

type BalancesPayload = { Items?: Array<Record<string, unknown>>; PageToken?: string }

export async function GET(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  const policies = await getGlobalCurrencyPolicies()
  if (!policies.USD.active && !policies.EUR.active) {
    return NextResponse.json(
      { error: "USD and EUR balances are temporarily unavailable.", code: "CURRENCY_DISABLED" },
      { status: 403 },
    )
  }

  try {
    const url = new URL(request.url)
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)))

    const all: Array<Record<string, unknown>> = []
    let token: string | undefined
    for (let i = 0; i < 5; i++) {
      const data = await noahFetch<BalancesPayload>({
        method: "GET",
        path: "/balances",
        query: { PageSize: pageSize, ...(token ? { PageToken: token } : {}) },
      })
      const items = data.Items ?? []
      all.push(...items)
      token = data.PageToken
      if (!token || items.length === 0) break
    }

    return NextResponse.json(mapNoahBalancesToMobile(all))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
