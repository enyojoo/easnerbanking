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

const DEEP_SEARCH_SKIP = new Set(["votes", "intent"])

function takeSendStatusId(v: unknown): string | null {
  const s = String(v ?? "").trim()
  if (!s) return null
  // Turnkey may set `sendTransactionStatusId` to the activity fingerprint (`sha256:…`); that value is valid for `getSendTransactionStatus`.
  return s
}

function normalizeActivityResult(result: unknown): Record<string, unknown> | null {
  if (Array.isArray(result) && result.length === 1) {
    return normalizeActivityResult(result[0])
  }
  const obj = asRecord(result)
  if (obj) return obj
  if (typeof result === "string") {
    const t = result.trim()
    if (!t.startsWith("{") && !t.startsWith("[")) return null
    try {
      return normalizeActivityResult(JSON.parse(t) as unknown)
    } catch {
      return null
    }
  }
  return null
}

function unwrapSolSendTransactionResultPayload(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const hit = unwrapSolSendTransactionResultPayload(item)
      if (hit) return hit
    }
    return null
  }
  if (typeof raw === "string") {
    const t = raw.trim()
    if (!t.startsWith("{") && !t.startsWith("[")) return null
    try {
      return unwrapSolSendTransactionResultPayload(JSON.parse(t) as unknown)
    } catch {
      return null
    }
  }
  return asRecord(raw)
}

function extractSendStatusIdFromAppProofs(activity: Record<string, unknown>): string | null {
  const proofs = activity.appProofs
  if (!Array.isArray(proofs)) return null
  for (const p of proofs) {
    const pr = asRecord(p)
    const raw = pr?.proofPayload
    if (typeof raw !== "string") continue
    if (!raw.includes("sendTransaction") && !raw.includes("send_transaction")) continue
    try {
      const id = deepFindSendTransactionStatusId(JSON.parse(raw) as unknown, 0)
      if (id) return id
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Depth-first: Turnkey sometimes nests `sendTransactionStatusId` under protobuf/JSON shapes we do not enumerate. */
function deepFindSendTransactionStatusId(node: unknown, depth: number): string | null {
  if (depth > 16) return null
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = deepFindSendTransactionStatusId(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof node === "string") {
    const t = node.trim()
    if (
      t.length > 2 &&
      t.length < 200_000 &&
      (t.includes("sendTransactionStatusId") || t.includes("send_transaction_status_id"))
    ) {
      try {
        const id = deepFindSendTransactionStatusId(JSON.parse(t) as unknown, depth + 1)
        if (id) return id
      } catch {
        /* ignore */
      }
    }
    return null
  }
  const rec = asRecord(node)
  if (!rec) return null
  const hit = takeSendStatusId(rec.sendTransactionStatusId ?? rec.send_transaction_status_id)
  if (hit) return hit
  for (const [k, v] of Object.entries(rec)) {
    if (DEEP_SEARCH_SKIP.has(k)) continue
    const found = deepFindSendTransactionStatusId(v, depth + 1)
    if (found) return found
  }
  return null
}

function activityResultKeySummary(response: Record<string, unknown>): string {
  const act = asRecord(response.activity)
  if (!act) return "no_activity"
  const raw = act.result
  if (raw == null) return "activity.result=null"
  if (typeof raw === "string") return `activity.result_is_string(len=${raw.length})`
  const res = asRecord(raw)
  if (!res) return "activity.result_non_object"
  return `activity.result_keys=${Object.keys(res).join(",")}`
}

/** Reads `sendTransactionStatusId` from SDK-merged fields or `activity.result` (including fingerprint-shaped ids). */
export function extractTurnkeySolSendTransactionStatusId(response: Record<string, unknown>): string | null {
  const direct = takeSendStatusId(response.sendTransactionStatusId ?? response.send_transaction_status_id)
  if (direct) return direct

  const act = asRecord(response.activity)
  if (act) {
    const fromProofs = extractSendStatusIdFromAppProofs(act)
    if (fromProofs) return fromProofs
  }

  const res = act ? normalizeActivityResult(act.result) : null
  if (res) {
    const rawSol = res.solSendTransactionResult ?? res.sol_send_transaction_result
    const sol = unwrapSolSendTransactionResultPayload(rawSol)
    if (sol) {
      const nested = takeSendStatusId(sol.sendTransactionStatusId ?? sol.send_transaction_status_id)
      if (nested) return nested
    }
    const flat = takeSendStatusId(res.sendTransactionStatusId ?? res.send_transaction_status_id)
    if (flat) return flat
  }

  return deepFindSendTransactionStatusId(response, 0)
}

async function probeActivityIdAsSendTransactionStatusId(
  client: TurnkeyClientLike,
  organizationId: string,
  activityId: string,
): Promise<string | null> {
  if (!activityId || activityId.startsWith("sha256:")) return null
  if (typeof client.getSendTransactionStatus !== "function") return null
  try {
    const res = await client.getSendTransactionStatus({
      organizationId,
      sendTransactionStatusId: activityId,
    })
    const txStatus = String(
      res?.txStatus ?? res?.status ?? res?.transactionStatus ?? res?.sendTransactionStatus ?? "",
    ).trim()
    if (txStatus) return activityId
  } catch {
    /* Turnkey rejects unknown ids */
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Turnkey can return `ACTIVITY_STATUS_COMPLETED` while `activity.result.solSendTransactionResult` is still `{}`.
 * The SDK `command()` merge then omits `sendTransactionStatusId` until the result row is populated.
 */
async function backoffRefetchActivityUntilSolSendStatusId(
  client: TurnkeyClientLike,
  subOrgId: string,
  activityId: string,
): Promise<Record<string, unknown>[]> {
  if (typeof client.getActivity !== "function") return []
  const snapshots: Record<string, unknown>[] = []
  const maxAttempts = 36
  const delayMs = 500
  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0) await sleep(delayMs)
    try {
      const data = (await client.getActivity({
        organizationId: subOrgId,
        activityId,
      })) as Record<string, unknown>
      snapshots.push(data)
      if (extractTurnkeySolSendTransactionStatusId(data)) return snapshots
      const act = asRecord(data.activity)
      const st = String(act?.status ?? "")
      if (st === "ACTIVITY_STATUS_FAILED" || st === "ACTIVITY_STATUS_REJECTED") return snapshots
    } catch {
      break
    }
  }
  return snapshots
}

async function resolveSolSendParsedIds(
  client: TurnkeyClientLike,
  subOrgId: string,
  initialResponse: Record<string, unknown>,
): Promise<{ providerTransactionId: string; providerEventId: string | null; txHash: string | null }> {
  const bodies: Record<string, unknown>[] = [initialResponse]
  const act0 = asRecord(initialResponse.activity)
  const activityId = String(act0?.id ?? "").trim()
  if (activityId && !activityId.startsWith("sha256:") && typeof client.getActivity === "function") {
    try {
      bodies.push(
        (await client.getActivity({
          organizationId: subOrgId,
          activityId,
        })) as Record<string, unknown>,
      )
    } catch {
      /* best-effort */
    }
  }

  let lastErr: unknown
  for (const body of bodies) {
    try {
      return parseTurnkeySendIds(body)
    } catch (e) {
      lastErr = e
    }
  }

  if (activityId && !activityId.startsWith("sha256:")) {
    const refetched = await backoffRefetchActivityUntilSolSendStatusId(client, subOrgId, activityId)
    for (const body of refetched) {
      try {
        return parseTurnkeySendIds(body)
      } catch (e) {
        lastErr = e
      }
    }
  }

  if (activityId && !activityId.startsWith("sha256:")) {
    const probed = await probeActivityIdAsSendTransactionStatusId(client, subOrgId, activityId)
    if (probed) {
      return { providerTransactionId: probed, providerEventId: null, txHash: null }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

function parseTurnkeySendIds(response: Record<string, unknown>): {
  providerTransactionId: string
  providerEventId: string | null
  txHash: string | null
} {
  const providerTransactionId = extractTurnkeySolSendTransactionStatusId(response)
  if (!providerTransactionId) {
    const status = String(asRecord(response.activity)?.status ?? "").trim() || "unknown"
    const summary = activityResultKeySummary(response)
    throw new Error(
      `Turnkey send did not return sendTransactionStatusId (activity.status=${status}; ${summary}). Cannot poll broadcast status.`,
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
  const rawSend = (sendRes || {}) as Record<string, unknown>
  const act0 = asRecord(rawSend.activity)
  const activityId = String(act0?.id ?? "").trim()
  if (activityId && !activityId.startsWith("sha256:")) {
    console.info("turnkey_sol_send_resolve_ids", {
      subOrgId: sender.subOrgId,
      activityId: activityId.slice(0, 12),
    })
  }
  const parsed = await resolveSolSendParsedIds(client, sender.subOrgId, rawSend)

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
    res?.txStatus ?? res?.status ?? res?.transactionStatus ?? res?.sendTransactionStatus ?? "",
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
