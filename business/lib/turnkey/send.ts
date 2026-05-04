import type { SupabaseClient } from "@supabase/supabase-js"
import { getTurnkeyApiClientForSubOrganization } from "@/lib/turnkey/client"
import {
  getTurnkeySolanaBroadcastCaip2,
  isTurnkeySolSponsorshipEnabled,
} from "@/lib/turnkey/config"
import { buildStablecoinSplTransferUnsignedTxPayloadForTurnkey } from "@/lib/turnkey/sol-spl-transfer-unsigned-tx"
import { resolveWalletOwnerIdForEasnerContext } from "@/lib/wallet/resolve-wallet-owner"
import type { NoahAccountContext } from "@/lib/noah/resolve-account-context"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"

export type TurnkeySendInput = {
  ctx: NoahAccountContext
  asset: "USDC" | "EURC"
  chain: "solana"
  destinationAddress: string
  amount: number
  /**
   * When false (default), `destinationAddress` is the token owner wallet and we derive the SPL ATA.
   * When true, `destinationAddress` is already the recipient token account (Easetag settlement).
   */
  destinationIsTokenAccount?: boolean
  /** Tags turnkey ledger rows for Easetag chain settlement (hidden from activity feed). */
  easetagSettlement?: { transferGroupId: string }
}

type TurnkeyClientLike = Record<string, (...args: any[]) => Promise<any>>

function mapAssetToCurrency(asset: "USDC" | "EURC"): "USD" | "EUR" {
  return asset === "EURC" ? "EUR" : "USD"
}

function mapTurnkeySponsoredSendError(message: string): string | null {
  const m = String(message || "").toLowerCase()
  if (!m) return null

  // Keep these intentionally broad; Turnkey error strings can change.
  if (m.includes("gas sponsorship") && (m.includes("limit") || m.includes("exceed"))) {
    return "gas_sponsorship_limit_exceeded"
  }
  if (m.includes("sponsor solana rent") || (m.includes("rent") && m.includes("sponsor"))) {
    return "solana_rent_sponsorship_required"
  }
  if (m.includes("gas sponsorship") && (m.includes("not enabled") || m.includes("disabled"))) {
    return "gas_sponsorship_not_enabled"
  }
  return null
}

async function resolveScopeOwner(admin: SupabaseClient, ctx: NoahAccountContext): Promise<{ userId: string; businessId: string | null }> {
  if (ctx.scope === "business" && ctx.subjectBusinessId) {
    const { data } = await admin
      .from("users")
      .select("id")
      .eq("easner_business_id", ctx.subjectBusinessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    return { userId: String(data?.id || ctx.subjectUserId), businessId: ctx.subjectBusinessId }
  }
  return { userId: ctx.subjectUserId, businessId: null }
}

async function getSubOrgAndWallet(
  admin: SupabaseClient,
  ctx: NoahAccountContext,
  asset: "USDC" | "EURC",
): Promise<{ subOrgId: string; sourceAddress: string } | null> {
  const ownerId = await resolveWalletOwnerIdForEasnerContext(admin, ctx)
  if (!ownerId) return null

  const { data: owner } = await admin
    .from("wallet_owners")
    .select("turnkey_sub_organization_id")
    .eq("id", ownerId)
    .maybeSingle()
  const subOrgId = String(owner?.turnkey_sub_organization_id || "").trim()
  if (!subOrgId) return null

  const { data: wallet } = await admin
    .from("wallet_accounts")
    .select("address")
    .eq("wallet_owner_id", ownerId)
    .eq("status", "active")
    .eq("chain", "solana")
    .eq("asset", asset)
    .limit(1)
    .maybeSingle()
  const sourceAddress = String(wallet?.address || "").trim()
  if (!sourceAddress) return null

  return { subOrgId, sourceAddress }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>
  return null
}

/** Turnkey `getSendTransactionStatus` expects `sendTransactionStatusId`, not root `id` (often `sha256:` activity fingerprint). */
export function extractTurnkeySolSendTransactionStatusId(response: Record<string, unknown>): string | null {
  const take = (v: unknown): string | null => {
    const s = String(v ?? "").trim()
    if (!s || s.startsWith("sha256:")) return null
    return s
  }

  const direct = take(response.sendTransactionStatusId ?? response.send_transaction_status_id)
  if (direct) return direct

  const act = asRecord(response.activity)
  const res = act ? asRecord(act.result) : null
  if (res) {
    const sol =
      asRecord(res.solSendTransactionResult) ?? asRecord(res.sol_send_transaction_result)
    if (sol) {
      const nested = take(sol.sendTransactionStatusId ?? sol.send_transaction_status_id)
      if (nested) return nested
    }
  }

  return null
}

function parseTurnkeySendIds(response: Record<string, unknown>): {
  providerTransactionId: string
  providerEventId: string | null
  txHash: string | null
} {
  const providerTransactionId = extractTurnkeySolSendTransactionStatusId(response)
  if (!providerTransactionId) {
    const status = String(asRecord(response.activity)?.status ?? "").trim() || "unknown"
    throw new Error(
      `Turnkey send did not return sendTransactionStatusId (activity.status=${status}). Cannot poll broadcast status.`,
    )
  }
  const providerEventId = String(response.eventId ?? response.requestId ?? "").trim() || null
  const txHash =
    String(response.signature ?? response.txHash ?? response.transactionHash ?? response.hash ?? "").trim() || null
  return { providerTransactionId, providerEventId, txHash }
}

export async function createTurnkeySend(
  admin: SupabaseClient,
  input: TurnkeySendInput,
): Promise<{
  providerTransactionId: string
  ledgerId: string
  status: "pending" | "settled" | "failed"
  txHash: string | null
  subOrgId: string
}> {
  const destinationAddress = String(input.destinationAddress || "").trim()
  if (!destinationAddress) throw new Error("destinationAddress is required")
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("amount must be positive")

  const scopeOwner = await resolveScopeOwner(admin, input.ctx)
  const sender = await getSubOrgAndWallet(admin, input.ctx, input.asset)
  if (!sender) throw new Error("No managed wallet found for requested asset")

  const client = getTurnkeyApiClientForSubOrganization(sender.subOrgId) as TurnkeyClientLike | null
  if (!client) throw new Error("Turnkey API client is not configured")
  if (typeof client.solSendTransaction !== "function") {
    throw new Error("Turnkey SDK does not expose solSendTransaction")
  }

  const sponsor = isTurnkeySolSponsorshipEnabled()
  const caip2 = getTurnkeySolanaBroadcastCaip2()
  const destinationIsTokenAccount = Boolean(input.destinationIsTokenAccount)

  const unsignedTransaction = await buildStablecoinSplTransferUnsignedTxPayloadForTurnkey({
    asset: input.asset,
    ownerAddress: sender.sourceAddress,
    destinationAddress,
    destinationIsTokenAccount,
    amountHuman: input.amount,
    sponsoredFlow: sponsor,
  })

  let sendRes: unknown
  try {
    console.info("turnkey_sol_send_transaction", {
      sponsor,
      caip2,
      asset: input.asset,
      chain: input.chain,
      subOrgId: sender.subOrgId,
    })
    sendRes = await client.solSendTransaction({
      organizationId: sender.subOrgId,
      unsignedTransaction,
      signWith: sender.sourceAddress,
      caip2,
      ...(sponsor ? { sponsor: true } : {}),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("turnkey_sol_send_transaction_failed", {
      sponsor,
      caip2,
      asset: input.asset,
      chain: input.chain,
      subOrgId: sender.subOrgId,
      detail: msg.slice(0, 500),
    })
    const mapped = sponsor ? mapTurnkeySponsoredSendError(msg) : null
    if (mapped) throw new Error(mapped)
    throw e
  }
  const parsed = parseTurnkeySendIds((sendRes || {}) as Record<string, unknown>)

  const easetagMeta =
    input.easetagSettlement?.transferGroupId != null && String(input.easetagSettlement.transferGroupId).trim()
      ? {
          easetag_settlement_leg: true,
          suppress_in_feed: true,
          transfer_group_id: String(input.easetagSettlement.transferGroupId).trim(),
        }
      : {}

  await upsertLedgerTransaction(admin, {
    userId: scopeOwner.userId,
    businessId: scopeOwner.businessId,
    provider: "turnkey",
    providerTransactionId: parsed.providerTransactionId,
    providerEventId: parsed.providerEventId,
    status: "pending",
    amount: input.amount,
    amountMinor: Math.round(input.amount * 1_000_000),
    currency: mapAssetToCurrency(input.asset),
    direction: "out",
    payload: (sendRes || {}) as Record<string, unknown>,
    metadata: {
      source: "turnkey_send",
      turnkey_sub_org_id: sender.subOrgId,
      turnkey_sponsor_requested: sponsor ? "true" : "false",
      turnkey_solana_caip2: caip2,
      ...easetagMeta,
    },
    txHash: parsed.txHash,
    walletAddress: sender.sourceAddress,
    counterpartyAddress: destinationAddress,
    asset: input.asset,
    chain: input.chain,
    occurredAt: new Date().toISOString(),
    baseCurrency: mapAssetToCurrency(input.asset),
  })

  let reconciled: { status: "pending" | "settled" | "failed"; txHash: string | null } = {
    status: "pending",
    txHash: parsed.txHash,
  }
  try {
    reconciled = await reconcileTurnkeySendStatus(admin, {
      subOrgId: sender.subOrgId,
      providerTransactionId: parsed.providerTransactionId,
    })
  } catch {
    // Best-effort reconciliation.
  }

  return {
    providerTransactionId: parsed.providerTransactionId,
    ledgerId: parsed.providerTransactionId,
    status: reconciled.status,
    txHash: reconciled.txHash ?? parsed.txHash,
    subOrgId: sender.subOrgId,
  }
}

export async function reconcileTurnkeySendStatus(
  admin: SupabaseClient,
  params: { subOrgId: string; providerTransactionId: string },
): Promise<{ status: "pending" | "settled" | "failed"; txHash: string | null }> {
  const client = getTurnkeyApiClientForSubOrganization(params.subOrgId) as TurnkeyClientLike | null
  if (!client) throw new Error("Turnkey API client is not configured")
  if (typeof client.getSendTransactionStatus !== "function") {
    return { status: "pending", txHash: null }
  }
  const res = await client.getSendTransactionStatus({
    organizationId: params.subOrgId,
    sendTransactionStatusId: params.providerTransactionId,
  })
  const statusRaw = String(
    res?.status ?? res?.transactionStatus ?? res?.sendTransactionStatus ?? "",
  ).toLowerCase()
  const status =
    statusRaw.includes("fail") || statusRaw.includes("revert")
      ? "failed"
      : statusRaw.includes("confirm") || statusRaw.includes("includ") || statusRaw.includes("complete")
        ? "settled"
        : "pending"
  const txHash = String(res?.signature ?? res?.txHash ?? res?.transactionHash ?? "").trim() || null

  const { data: existing } = await admin
    .from("transactions")
    .select("id, user_id, business_id, amount, currency, direction, wallet_address, counterparty_address, asset, chain, metadata")
    .eq("provider", "turnkey")
    .eq("provider_transaction_id", params.providerTransactionId)
    .maybeSingle()
  if (existing?.id) {
    await upsertLedgerTransaction(admin, {
      userId: String(existing.user_id),
      businessId: existing.business_id ? String(existing.business_id) : null,
      provider: "turnkey",
      providerTransactionId: params.providerTransactionId,
      status,
      amount: Number(existing.amount ?? 0),
      currency: String(existing.currency ?? "USD"),
      direction: (String(existing.direction ?? "out").toLowerCase() === "in" ? "in" : "out"),
      txHash,
      walletAddress: existing.wallet_address ? String(existing.wallet_address) : null,
      counterpartyAddress: existing.counterparty_address ? String(existing.counterparty_address) : null,
      asset: existing.asset ? String(existing.asset) : null,
      chain: existing.chain ? String(existing.chain) : null,
      settledAt: status === "settled" ? new Date().toISOString() : null,
      payload: (res || {}) as Record<string, unknown>,
      metadata: { source: "turnkey_send_status" },
      baseCurrency: String(existing.currency ?? "USD"),
    })
  }

  return { status, txHash }
}
