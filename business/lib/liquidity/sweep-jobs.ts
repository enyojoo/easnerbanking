import type { SupabaseClient } from "@supabase/supabase-js"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { noahCustomerIdFromBusinessId, noahCustomerIdFromUserId } from "@/lib/noah/customer-id"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { resolvePooledSolanaSourceAddress, ledgerCurrencyForStablecoinAsset } from "@/lib/liquidity/platform-pool"

export function isLiquiditySweepEnabled(): boolean {
  return String(process.env.LIQUIDITY_SWEEP_ENABLED || "").trim().toLowerCase() === "true"
}

export async function buildNoahContextForWalletOwner(
  admin: SupabaseClient,
  walletOwnerId: string,
): Promise<NoahAccountContext | null> {
  const { data: wo, error } = await admin
    .from("wallet_owners")
    .select("owner_type, owner_ref, noah_customer_id")
    .eq("id", walletOwnerId)
    .maybeSingle()
  if (error || !wo) return null
  const ot = String((wo as { owner_type?: string }).owner_type || "")
  if (ot === "platform") return null

  if (ot === "individual") {
    const uid = String((wo as { owner_ref?: string }).owner_ref || "")
    if (!uid) return null
    const { data: u } = await admin.from("users").select("noah_customer_id").eq("id", uid).maybeSingle()
    const stored = (u?.noah_customer_id as string | null | undefined)?.trim() || null
    return {
      scope: "individual",
      customerType: "Individual",
      noahCustomerId: stored || noahCustomerIdFromUserId(uid),
      subjectBusinessId: null,
      subjectUserId: uid,
    }
  }

  if (ot === "business") {
    const bid = String((wo as { owner_ref?: string }).owner_ref || "")
    if (!bid) return null
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, bid)
    if (!ownerUserId) return null
    return {
      scope: "business",
      customerType: "Business",
      noahCustomerId: noahCustomerIdFromBusinessId(bid),
      subjectBusinessId: bid,
      subjectUserId: ownerUserId,
    }
  }

  return null
}

export async function enqueueLiquiditySweepJob(
  admin: SupabaseClient,
  input: { walletAccountId: string; asset: string; amount: number; idempotencyKey: string },
): Promise<{ enqueued: boolean; reason?: string }> {
  if (!isLiquiditySweepEnabled()) return { enqueued: false, reason: "sweep_disabled" }
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { enqueued: false, reason: "invalid_amount" }

  const lc = ledgerCurrencyForStablecoinAsset(input.asset)
  if (!lc) return { enqueued: false, reason: "unsupported_asset" }
  const pool = await resolvePooledSolanaSourceAddress(admin, { ledgerCurrency: lc })
  if (!pool) return { enqueued: false, reason: "pool_not_configured" }

  const idem = String(input.idempotencyKey || "").trim().slice(0, 500)
  if (!idem) return { enqueued: false, reason: "missing_idempotency" }

  const { error } = await admin.from("liquidity_sweep_jobs").insert({
    wallet_account_id: input.walletAccountId,
    asset: String(input.asset || "").toUpperCase(),
    amount: input.amount,
    status: "pending",
    idempotency_key: idem,
  })
  if (error) {
    if (String((error as { code?: string }).code) === "23505") return { enqueued: false, reason: "duplicate" }
    console.warn("enqueueLiquiditySweepJob", error.message)
    return { enqueued: false, reason: error.message }
  }
  return { enqueued: true }
}

export async function processPendingLiquiditySweepJobs(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ processed: number; errors: string[] }> {
  const limit = Math.min(Math.max(opts?.limit ?? 5, 1), 25)
  const errors: string[] = []
  let processed = 0

  const { data: jobs } = await admin
    .from("liquidity_sweep_jobs")
    .select("id, wallet_account_id, asset, amount, idempotency_key")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)

  for (const raw of jobs || []) {
    const job = raw as {
      id: string
      wallet_account_id: string
      asset: string
      amount: number
      idempotency_key: string
    }
    const { error: lockErr } = await admin
      .from("liquidity_sweep_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending")
    if (lockErr) continue

    const { data: wa } = await admin
      .from("wallet_accounts")
      .select("wallet_owner_id, address, chain, asset, ledger_currency")
      .eq("id", job.wallet_account_id)
      .maybeSingle()
    if (!wa?.wallet_owner_id) {
      await admin
        .from("liquidity_sweep_jobs")
        .update({
          status: "failed",
          last_error: "wallet_account_missing",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      errors.push(`${job.id}:wallet_account_missing`)
      continue
    }

    const ctx = await buildNoahContextForWalletOwner(admin, String(wa.wallet_owner_id))
    if (!ctx) {
      await admin
        .from("liquidity_sweep_jobs")
        .update({ status: "failed", last_error: "no_ctx", updated_at: new Date().toISOString() })
        .eq("id", job.id)
      errors.push(`${job.id}:no_ctx`)
      continue
    }

    const lc = ledgerCurrencyForStablecoinAsset(String(wa.asset || job.asset))
    const poolAddr = lc ? await resolvePooledSolanaSourceAddress(admin, { ledgerCurrency: lc }) : null
    if (!poolAddr) {
      await admin
        .from("liquidity_sweep_jobs")
        .update({
          status: "failed",
          last_error: "pool_not_configured",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      errors.push(`${job.id}:pool_not_configured`)
      continue
    }

    const asset = String(job.asset || wa.asset || "USDC").toUpperCase() as "USDC" | "EURC"
    if (asset !== "USDC" && asset !== "EURC") {
      await admin
        .from("liquidity_sweep_jobs")
        .update({ status: "failed", last_error: "bad_asset", updated_at: new Date().toISOString() })
        .eq("id", job.id)
      continue
    }

    try {
      const created = await createTurnkeySend(admin, {
        ctx,
        asset,
        chain: "solana",
        destinationAddress: poolAddr,
        amount: Number(job.amount),
      })
      await admin
        .from("liquidity_sweep_jobs")
        .update({
          status: "completed",
          turnkey_send_status_id: created.providerTransactionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      processed += 1
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await admin
        .from("liquidity_sweep_jobs")
        .update({
          status: "failed",
          last_error: msg.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
      errors.push(`${job.id}:${msg.slice(0, 200)}`)
    }
  }

  return { processed, errors }
}

export async function reconcilePoolVsLiabilities(
  admin: SupabaseClient,
): Promise<{ ok: boolean; detail: Record<string, unknown> }> {
  const out: Record<string, unknown> = {
    pool_env_usd: Boolean(String(process.env.PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_USD || "").trim()),
    pool_env_eur: Boolean(String(process.env.PLATFORM_LIQUIDITY_POOL_SOLANA_ADDRESS_EUR || "").trim()),
  }

  for (const cur of ["USD", "EUR"] as const) {
    const { data: rows } = await admin.from("wallet_balances").select("available_balance").eq("currency", cur)
    const sum = (rows || []).reduce((acc, r) => acc + Number((r as { available_balance?: number }).available_balance ?? 0), 0)
    out[`sum_liabilities_${cur}`] = sum
  }

  console.info("liquidity_reconcile_snapshot", out)
  return { ok: true, detail: out }
}
