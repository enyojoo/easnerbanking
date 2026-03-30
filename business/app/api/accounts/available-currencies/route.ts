import { NextResponse } from "next/server"
import { getUserFromApiRequest } from "@/lib/supabase/admin"
import { buildOpenCurrencyCatalog } from "@/lib/accounts/open-currency-catalog"
import { getEnabledExtraCurrencies } from "@/lib/accounts/enabled-extras"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"

const DEFAULTS = ["USD", "EUR"] as const

/**
 * Catalog for **Open Currency Account** — Noah + Tier 2 placeholders; merged with org/user enabled extras.
 */
export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response

  const guard = await requireNoahVerificationApproved(acc.ctx.subjectUserId, acc.ctx.scope)
  if (guard) return guard

  const enabledExtras = await getEnabledExtraCurrencies(acc.ctx.subjectUserId, acc.ctx.scope)
  const enabledSet = new Set(enabledExtras.map((c) => c.toUpperCase()))

  const offers = buildOpenCurrencyCatalog().map((o) => ({
    ...o,
    alreadyAdded: enabledSet.has(o.code.toUpperCase()),
  }))

  return NextResponse.json({
    defaults: [...DEFAULTS],
    enabledExtras,
    offers,
  })
}
