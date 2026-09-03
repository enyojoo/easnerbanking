import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import type { NoahCustomerScope } from "@/lib/noah/customer-id"
import {
  canonicalVerificationStatus,
  readVerificationRow,
} from "./verification-store"
import { isVerificationApproved } from "./map-partner-status"
import { assertAccountAllows, accountRestrictionErrorResponse } from "@/lib/account-restriction/assert"

export type VerificationScope = {
  subjectUserId: string
  scope: NoahCustomerScope
  subjectBusinessId?: string | null
}

export async function getVerificationStatus(
  admin: SupabaseClient,
  ctx: VerificationScope,
): Promise<string | null> {
  const row = await readVerificationRow(admin, {
    kind: ctx.scope === "business" ? "business" : "individual",
    businessId: ctx.subjectBusinessId,
    userId: ctx.subjectUserId,
  })
  return canonicalVerificationStatus(row)
}

export async function isVerificationApprovedForScope(
  admin: SupabaseClient,
  ctx: VerificationScope,
): Promise<boolean> {
  const status = await getVerificationStatus(admin, ctx)
  return isVerificationApproved(status)
}

/**
 * True when the scope has ever been provisioned (balances, fiat VAs, or Turnkey deposit vaults).
 */
export async function hasProvisionedArtifacts(
  admin: SupabaseClient,
  ctx: VerificationScope,
): Promise<boolean> {
  const businessId = ctx.scope === "business" ? ctx.subjectBusinessId : null
  const userId = ctx.subjectUserId

  let wb = admin.from("wallet_balances").select("id").limit(1)
  if (businessId) wb = wb.eq("business_id", businessId)
  else wb = wb.eq("user_id", userId)
  const { data: wbRows } = await wb
  if (wbRows?.length) return true

  let va = admin
    .from("virtual_accounts")
    .select("id")
    .neq("status", "retired")
    .neq("status", "inactive")
    .limit(1)
  if (businessId) va = va.eq("business_id", businessId)
  else va = va.eq("user_id", userId)
  const { data: vaRows } = await va
  if (vaRows?.length) return true

  if (!businessId) {
    const { data: user } = await admin
      .from("users")
      .select("noah_usd_virtual_account_id,noah_eur_virtual_account_id,noah_gbp_virtual_account_id")
      .eq("id", userId)
      .maybeSingle()
    if (
      user?.noah_usd_virtual_account_id ||
      user?.noah_eur_virtual_account_id ||
      user?.noah_gbp_virtual_account_id
    ) {
      return true
    }
  }

  const ownerType: "individual" | "business" = ctx.scope === "business" ? "business" : "individual"
  const ownerRef = businessId ?? userId
  const ownerId = await getWalletOwnerId(admin, ownerType, ownerRef)
  if (ownerId) {
    const { data: accounts } = await admin
      .from("wallet_accounts")
      .select("id")
      .eq("wallet_owner_id", ownerId)
      .limit(1)
    if (accounts?.length) return true
  }

  return false
}

/** Block money movement until canonical verification is approved.
 *  Also blocks when Office restriction/closure is active — Office status supersedes KYB. */
export async function requireVerificationApproved(
  subjectUserId: string,
  scope: NoahCustomerScope,
  subjectBusinessId?: string | null,
): Promise<NextResponse | null> {
  const admin = createSupabaseAdmin()

  // Office restriction supersedes KYB status
  const restriction = await assertAccountAllows(admin, {
    userId: subjectUserId,
    businessId: subjectBusinessId ?? undefined,
  }, "send")
  if (!restriction.ok) {
    return accountRestrictionErrorResponse(restriction)
  }

  const ctx: VerificationScope = { subjectUserId, scope, subjectBusinessId }

  if (scope === "business") {
    if (!subjectBusinessId) {
      return NextResponse.json({ error: "Business context missing" }, { status: 400 })
    }
    const status = await getVerificationStatus(admin, ctx)
    if (!status) {
      return NextResponse.json({ error: "Business not found" }, { status: 400 })
    }
    if (!isVerificationApproved(status)) {
      return NextResponse.json(
        {
          error: "Business verification must be approved before this action.",
          code: "VERIFICATION_REQUIRED",
        },
        { status: 403 },
      )
    }
    return null
  }

  const status = await getVerificationStatus(admin, ctx)
  if (!status) {
    return NextResponse.json({ error: "User profile not found" }, { status: 400 })
  }
  if (!isVerificationApproved(status)) {
    return NextResponse.json(
      {
        error: "Identity verification must be approved before this action.",
        code: "VERIFICATION_REQUIRED",
      },
      { status: 403 },
    )
  }

  return null
}

/** @deprecated Use requireVerificationApproved – kept as alias for incremental migration. */
export const requireNoahVerificationApproved = requireVerificationApproved
