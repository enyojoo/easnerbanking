import type { SupabaseClient } from "@supabase/supabase-js"
import {
  noahCustomerIdFromBusinessId,
  noahCustomerIdFromUserId,
  type NoahCustomerScope,
} from "./customer-id"
import { fetchAllPaymentMethodsForCustomer } from "./list-payment-methods"
import { isNoahVerificationApproved } from "./noah-tier-guards"
import {
  selectPreferredEurPayinPaymentMethod,
  selectPreferredUsdPayinPaymentMethod,
} from "./payment-method-map"
import { getVirtualAccountDisplayFromDb } from "./virtual-accounts-db"

type FiatRail = "usd" | "eur"

const RAIL_MIRROR_COLUMN: Record<FiatRail, "noah_usd_virtual_account_id" | "noah_eur_virtual_account_id"> = {
  usd: "noah_usd_virtual_account_id",
  eur: "noah_eur_virtual_account_id",
}

async function readMirroredVirtualAccountId(
  admin: SupabaseClient,
  opts: {
    scope: NoahCustomerScope
    subjectUserId: string
    subjectBusinessId: string | null
    rail: FiatRail
  },
): Promise<string | null> {
  const column = RAIL_MIRROR_COLUMN[opts.rail]
  if (opts.scope === "business" && opts.subjectBusinessId) {
    const { data } = await admin
      .from("businesses")
      .select(column)
      .eq("id", opts.subjectBusinessId)
      .maybeSingle()
    const id = (data as Record<string, string | null> | null)?.[column]
    return id?.trim() || null
  }
  const { data } = await admin
    .from("users")
    .select(column)
    .eq("id", opts.subjectUserId)
    .maybeSingle()
  const id = (data as Record<string, string | null> | null)?.[column]
  return id?.trim() || null
}

async function resolveNoahCustomerId(
  admin: SupabaseClient,
  opts: {
    scope: NoahCustomerScope
    subjectUserId: string
    subjectBusinessId: string | null
  },
): Promise<string> {
  if (opts.scope === "business" && opts.subjectBusinessId) {
    const { data } = await admin
      .from("businesses")
      .select("noah_customer_id")
      .eq("id", opts.subjectBusinessId)
      .maybeSingle()
    const stored = (data as { noah_customer_id?: string | null } | null)?.noah_customer_id?.trim()
    return stored || noahCustomerIdFromBusinessId(opts.subjectBusinessId)
  }
  const { data } = await admin
    .from("users")
    .select("noah_customer_id")
    .eq("id", opts.subjectUserId)
    .maybeSingle()
  const stored = (data as { noah_customer_id?: string | null } | null)?.noah_customer_id?.trim()
  return stored || noahCustomerIdFromUserId(opts.subjectUserId)
}

/**
 * A fiat rail no longer needs provisioning when mirrored, cached in `virtual_accounts`,
 * or Noah has no payin payment method for that rail (geo/product restriction).
 */
export async function isNoahFiatRailProvisionSatisfied(
  admin: SupabaseClient,
  opts: {
    scope: NoahCustomerScope
    subjectUserId: string
    subjectBusinessId: string | null
    rail: FiatRail
    paymentMethods: Record<string, unknown>[]
  },
): Promise<boolean> {
  const mirrored = await readMirroredVirtualAccountId(admin, {
    scope: opts.scope,
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
    rail: opts.rail,
  })
  if (mirrored) return true

  const cached = await getVirtualAccountDisplayFromDb(admin, {
    currency: opts.rail,
    userId: opts.subjectUserId,
    businessId: opts.subjectBusinessId,
  })
  if (cached?.hasAccount) return true

  const preferredPm =
    opts.rail === "usd"
      ? selectPreferredUsdPayinPaymentMethod(opts.paymentMethods)
      : selectPreferredEurPayinPaymentMethod(opts.paymentMethods)
  if (!preferredPm) return true

  return false
}

/**
 * True when verification is approved and any USD/EUR rail still needs provisioning.
 */
export async function needsNoahFiatVirtualAccountProvision(
  admin: SupabaseClient,
  opts: {
    scope: NoahCustomerScope
    subjectUserId: string
    subjectBusinessId: string | null
  },
): Promise<boolean> {
  const approved = await isNoahVerificationApproved(admin, {
    scope: opts.scope,
    subjectUserId: opts.subjectUserId,
    subjectBusinessId: opts.subjectBusinessId,
  })
  if (!approved) return false

  const noahCustomerId = await resolveNoahCustomerId(admin, opts)
  const paymentMethods = await fetchAllPaymentMethodsForCustomer(noahCustomerId)

  for (const rail of ["usd", "eur"] as const) {
    const satisfied = await isNoahFiatRailProvisionSatisfied(admin, {
      ...opts,
      rail,
      paymentMethods,
    })
    if (!satisfied) return true
  }

  return false
}
