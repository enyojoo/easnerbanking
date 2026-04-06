import { NextResponse } from "next/server"
import { createSupabaseAdmin, getUserFromApiRequest } from "@/lib/supabase/admin"
import { requireNoahEnv, requireAuth } from "@/app/api/noah/_helpers"
import { resolveNoahAccountContext } from "@/lib/noah/resolve-account-context"
import { requireNoahVerificationApproved } from "@/lib/noah/noah-tier-guards"
import { requireEasnerBusinessId } from "@/lib/terminal/context"
import { isAllowedTerminalPair } from "@/lib/terminal-allowed-pairs"
import {
  provisionNoahArtifactsForCustomer,
  readProvisionedWalletAddressFromDb,
} from "@/lib/noah/provisioning"

export async function GET(request: Request) {
  const user = await getUserFromApiRequest(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ctx = await requireEasnerBusinessId(user.id)
  if (!ctx.ok) return ctx.response

  const admin = createSupabaseAdmin()
  const { data: rows, error } = await admin
    .from("autopayout_payer_wallets")
    .select("id, source_address, crypto_currency, network, label, archived_at, created_at, updated_at")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const list = rows ?? []
  list.sort((a, b) => {
    const ar = (a as { archived_at?: string | null }).archived_at
    const br = (b as { archived_at?: string | null }).archived_at
    const aActive = ar ? 1 : 0
    const bActive = br ? 1 : 0
    if (aActive !== bActive) return aActive - bActive
    return String((b as { created_at?: string }).created_at || "").localeCompare(
      String((a as { created_at?: string }).created_at || ""),
    )
  })

  return NextResponse.json({ wallets: list })
}

export async function POST(request: Request) {
  const mis = requireNoahEnv()
  if (mis) return mis
  const auth = await requireAuth(request)
  if ("error" in auth) return auth.error
  const { user } = auth

  const acc = await resolveNoahAccountContext(request, user.id)
  if (!acc.ok) return acc.response
  const guard = await requireNoahVerificationApproved(
    acc.ctx.subjectUserId,
    acc.ctx.scope,
    acc.ctx.subjectBusinessId,
  )
  if (guard) return guard

  const biz = await requireEasnerBusinessId(user.id)
  if (!biz.ok) return biz.response
  if (acc.ctx.subjectBusinessId && acc.ctx.subjectBusinessId !== biz.businessId) {
    return NextResponse.json({ error: "Business scope mismatch." }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as {
    crypto_currency?: string
    network?: string
    label?: string | null
  } | null

  const cryptoCurrency = String(body?.crypto_currency || "").trim()
  const network = String(body?.network || "").trim()

  const pair = isAllowedTerminalPair(cryptoCurrency, network)
  if (!pair) {
    return NextResponse.json({ error: "Unsupported crypto/network pair." }, { status: 400 })
  }

  const label =
    body?.label != null && String(body.label).trim() ? String(body.label).trim().slice(0, 200) : null

  const admin = createSupabaseAdmin()

  try {
    await provisionNoahArtifactsForCustomer({
      subjectUserId: acc.ctx.subjectUserId,
      subjectBusinessId: acc.ctx.subjectBusinessId,
      noahCustomerId: acc.ctx.noahCustomerId,
      scope: acc.ctx.scope,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: msg || "Could not sync wallet with payment provider. Try again." },
      { status: 502 },
    )
  }

  const sourceAddress = await readProvisionedWalletAddressFromDb(admin, {
    subjectUserId: acc.ctx.subjectUserId,
    subjectBusinessId: acc.ctx.subjectBusinessId,
  })
  if (!sourceAddress) {
    return NextResponse.json(
      {
        error:
          "No provisioned wallet address yet. Complete verification and wallet setup, then try again.",
      },
      { status: 400 },
    )
  }
  const { data: inserted, error: insErr } = await admin
    .from("autopayout_payer_wallets")
    .insert({
      business_id: biz.businessId,
      created_by: user.id,
      source_address: sourceAddress,
      crypto_currency: cryptoCurrency,
      network: network,
      label,
    })
    .select("id, source_address, crypto_currency, network, label, archived_at, created_at, updated_at")
    .single()

  if (insErr || !inserted) {
    return NextResponse.json({ error: insErr?.message || "Failed to save wallet." }, { status: 400 })
  }

  return NextResponse.json({ wallet: inserted }, { status: 201 })
}
