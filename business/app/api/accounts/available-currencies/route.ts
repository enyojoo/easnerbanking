import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { buildOpenCurrencyCatalog } from "@/lib/accounts/open-currency-catalog"
import { getEnabledExtraCurrencies } from "@/lib/accounts/enabled-extras"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { getGlobalCurrencyPolicies } from "@/lib/accounts/currency-controls"

const DEFAULTS = ["USD", "EUR"] as const

/**
 * Catalog for **Open Currency Account** — Noah + Tier 2 placeholders; merged with org/user enabled extras.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const enabledExtras = await getEnabledExtraCurrencies(acc.ctx.subjectUserId, acc.ctx.scope)
  const enabledSet = new Set(enabledExtras.map((c) => c.toUpperCase()))
  const policies = await getGlobalCurrencyPolicies()

  const offers = buildOpenCurrencyCatalog().map((o) => ({
    ...o,
    disabledReason: !policies[o.code as keyof typeof policies]?.available
      ? `${o.code} is not available yet.`
      : !policies[o.code as keyof typeof policies]?.active
        ? `${o.code} is temporarily unavailable.`
        : o.disabledReason,
    alreadyAdded: enabledSet.has(o.code.toUpperCase()),
  }))
  const hasOpenableExtraCurrencies = offers.some(
    (o) => !DEFAULTS.includes(o.code as (typeof DEFAULTS)[number]) && !o.alreadyAdded && !o.disabledReason,
  )

  return NextResponse.json(
    {
      defaults: [...DEFAULTS],
      defaultPolicies: {
        USD: policies.USD,
        EUR: policies.EUR,
      },
      enabledExtras,
      offers,
      hasOpenableExtraCurrencies,
    },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=300",
      },
    },
  )
}
