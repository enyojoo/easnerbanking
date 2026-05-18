import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdmin } from "@/lib/supabase/admin"
import { getWalletOwnerId } from "@/lib/wallet/resolve-wallet-owner"
import type { NoahCustomerScope } from "./customer-id"

export type NoahVerificationScope = {
  subjectUserId: string
  scope: NoahCustomerScope
  subjectBusinessId?: string | null
}

/**
 * Current Noah KYC (individual) or KYB (business) status from Supabase.
 */
export async function getNoahVerificationStatus(
  admin: SupabaseClient,
  ctx: NoahVerificationScope,
): Promise<string | null> {
  if (ctx.scope === "business") {
    if (!ctx.subjectBusinessId) return null
    const { data: biz, error } = await admin
      .from("businesses")
      .select("noah_kyb_status")
      .eq("id", ctx.subjectBusinessId)
      .maybeSingle()
    if (error || !biz) return null
    return (biz.noah_kyb_status as string | null) ?? null
  }

  const { data: row, error } = await admin
    .from("users")
    .select("noah_kyc_status")
    .eq("id", ctx.subjectUserId)
    .maybeSingle()
  if (error || !row) return null
  return (row.noah_kyc_status as string | null) ?? null
}

export async function isNoahVerificationApproved(
  admin: SupabaseClient,
  ctx: NoahVerificationScope,
): Promise<boolean> {
  return (await getNoahVerificationStatus(admin, ctx)) === "approved"
}

/**
 * True when the scope has ever been provisioned (balances, fiat VAs, or Turnkey deposit vaults).
 * Used to keep read surfaces populated after verification status changes.
 */
export async function hasNoahProvisionedArtifacts(
  admin: SupabaseClient,
  ctx: NoahVerificationScope,
): Promise<boolean> {
  const businessId = ctx.scope === "business" ? ctx.subjectBusinessId : null
  const userId = ctx.subjectUserId

  let wb = admin.from("wallet_balances").select("id").limit(1)
  if (businessId) wb = wb.eq("business_id", businessId)
  else wb = wb.eq("user_id", userId)
  const { data: wbRows } = await wb
  if (wbRows?.length) return true

  let va = admin.from("virtual_accounts").select("id").limit(1)
  if (businessId) va = va.eq("business_id", businessId)
  else va = va.eq("user_id", userId)
  const { data: vaRows } = await va
  if (vaRows?.length) return true

  if (businessId) {
    const { data: biz } = await admin
      .from("businesses")
      .select("noah_usd_virtual_account_id,noah_eur_virtual_account_id,noah_gbp_virtual_account_id")
      .eq("id", businessId)
      .maybeSingle()
    if (
      biz?.noah_usd_virtual_account_id ||
      biz?.noah_eur_virtual_account_id ||
      biz?.noah_gbp_virtual_account_id
    ) {
      return true
    }
  } else {
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

/**
 * Block money movement and new Noah provisioning until KYC/KYB is approved.
 * Do not use on read-only balance / deposit / virtual-account display routes.
 */
export async function requireNoahVerificationApproved(
  subjectUserId: string,
  scope: NoahCustomerScope,
  subjectBusinessId?: string | null,
): Promise<NextResponse | null> {
  const admin = createSupabaseAdmin()
  const ctx: NoahVerificationScope = { subjectUserId, scope, subjectBusinessId }

  if (scope === "business") {
    if (!subjectBusinessId) {
      return NextResponse.json({ error: "Business context missing" }, { status: 400 })
    }
    const status = await getNoahVerificationStatus(admin, ctx)
    if (!status) {
      return NextResponse.json({ error: "Business not found" }, { status: 400 })
    }
    if (status !== "approved") {
      return NextResponse.json(
        {
          error: "Business verification must be approved before this action.",
          code: "NOAH_KYB_REQUIRED",
        },
        { status: 403 },
      )
    }
    return null
  }

  const status = await getNoahVerificationStatus(admin, ctx)
  if (!status) {
    return NextResponse.json({ error: "User profile not found" }, { status: 400 })
  }
  if (status !== "approved") {
    return NextResponse.json(
      {
        error: "Identity verification must be approved before this action.",
        code: "NOAH_KYC_REQUIRED",
      },
      { status: 403 },
    )
  }

  return null
}
