import { timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { dispatchMerchantWebhook } from "@/lib/checkout/merchant-webhooks"
import {
  hashCheckoutSecretKey,
  isMerchantSecretKey,
  isTransferAuthorizeSecret,
} from "@/lib/checkout/secrets"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { adjustPlatformAccount, insertPlatformTransaction } from "@/lib/platform/ledger"
import { publicTransfer, type PlatformTransferRow } from "@/lib/platform/objects"
import { executePlatformOutboundRail } from "@/lib/platform/send-rails"
import { readBearerToken } from "@/lib/platform/v1"

function railError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8")
  const b = Buffer.from(right, "utf8")
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function transferExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}

export function merchantTriedToConfirm(authorizationHeader: string | null): boolean {
  return isMerchantSecretKey(readBearerToken(authorizationHeader))
}

export function readTransferClientSecret(input: {
  authorizationHeader?: string | null
  bodySecret?: string | null
  querySecret?: string | null
}): string {
  const fromBody = String(input.bodySecret ?? "").trim()
  if (fromBody) return fromBody
  const fromQuery = String(input.querySecret ?? "").trim()
  if (fromQuery) return fromQuery
  const token = readBearerToken(input.authorizationHeader ?? null)
  return isTransferAuthorizeSecret(token) ? token : ""
}

export function destinationSummary(
  type: string,
  details: Record<string, unknown> | null | undefined,
): { type: string; label: string } {
  const meta = details ?? {}
  if (type === "easetag") {
    const tag = normalizeEasetag(String(meta.easetag ?? meta.tag ?? ""))
    return { type, label: tag ? `@${tag}` : "Easetag" }
  }
  if (type === "wallet") {
    const addr = String(meta.address ?? meta.account ?? meta.account_number ?? "").trim()
    return { type, label: addr ? `Wallet ···${addr.slice(-4)}` : "Wallet" }
  }
  if (type === "mobile_money") {
    const phone = String(meta.phone ?? "").replace(/\D/g, "")
    return { type, label: phone ? `Mobile money ···${phone.slice(-4)}` : "Mobile money" }
  }
  const acct = String(meta.account_number ?? meta.iban ?? "").replace(/\s/g, "")
  return { type: type || "bank", label: acct ? `Bank ···${acct.slice(-4)}` : "Bank" }
}

type TransferRow = PlatformTransferRow & {
  business_id?: string
  customer_id?: string | null
  client_secret_hash?: string | null
  authorized_at?: string | null
}

async function loadTransfer(admin: SupabaseClient, transferId: string): Promise<TransferRow | null> {
  const { data } = await admin
    .from("platform_transfers")
    .select("*")
    .eq("id", transferId)
    .maybeSingle()
  return data?.id ? (data as TransferRow) : null
}

function assertSecret(row: TransferRow, clientSecret: string): void {
  const hash = String(row.client_secret_hash ?? "")
  const incoming = String(clientSecret ?? "").trim()
  if (!hash || !incoming || !isTransferAuthorizeSecret(incoming)) {
    throw railError("not_found", "Not found")
  }
  if (!hashesEqual(hash, hashCheckoutSecretKey(incoming))) {
    throw railError("not_found", "Not found")
  }
}

async function releaseHold(
  admin: SupabaseClient,
  row: TransferRow,
): Promise<void> {
  const accountId = String(row.source_account_id ?? "")
  const amount = Number(row.amount_cents)
  if (!accountId || !(amount > 0)) return
  await adjustPlatformAccount(admin, {
    accountId,
    availableDelta: amount,
    pendingDelta: -amount,
  })
}

async function expireOpenTransfer(admin: SupabaseClient, row: TransferRow): Promise<void> {
  if (row.status !== "requires_action") return
  const now = new Date().toISOString()
  const { data: claimed } = await admin
    .from("platform_transfers")
    .update({ status: "failed", updated_at: now })
    .eq("id", row.id)
    .eq("status", "requires_action")
    .select("*")
    .maybeSingle()
  if (!claimed?.id) return
  await releaseHold(admin, row).catch(() => {})
  const mapped = publicTransfer(claimed as PlatformTransferRow)
  await dispatchMerchantWebhook(admin, {
    businessId: String(row.business_id),
    event: "transfer.failed",
    data: { ...mapped, error: "Transfer expired" },
  })
}

async function destinationForReview(
  admin: SupabaseClient,
  row: TransferRow,
): Promise<{ type: string; label: string } | null> {
  if (!row.destination_id) return null
  const { data } = await admin
    .from("platform_destinations")
    .select("type, details")
    .eq("id", row.destination_id)
    .maybeSingle()
  if (!data) return null
  return destinationSummary(String(data.type ?? ""), asMeta(data.details))
}

export function publicTransferReview(
  row: PlatformTransferRow,
  summary: { type: string; label: string } | null,
) {
  const mapped = publicTransfer(row)
  return {
    ...mapped,
    destination_summary: summary,
  }
}

export async function reviewPlatformTransfer(
  admin: SupabaseClient,
  input: { transferId: string; clientSecret: string },
) {
  const row = await loadTransfer(admin, input.transferId)
  if (!row) throw railError("not_found", "Not found")
  assertSecret(row, input.clientSecret)
  if (row.status === "requires_action" && transferExpired(row.expires_at)) {
    await expireOpenTransfer(admin, row)
    const latest = (await loadTransfer(admin, input.transferId)) ?? row
    return publicTransferReview(latest, await destinationForReview(admin, latest))
  }
  return publicTransferReview(row, await destinationForReview(admin, row))
}

export async function cancelPlatformTransfer(
  admin: SupabaseClient,
  input: { businessId: string; livemode: boolean; transferId: string },
) {
  const { data } = await admin
    .from("platform_transfers")
    .select("*")
    .eq("id", input.transferId)
    .eq("business_id", input.businessId)
    .eq("livemode", input.livemode)
    .maybeSingle()
  if (!data?.id) throw railError("not_found", "Not found")
  const row = data as TransferRow
  if (row.status === "canceled") return publicTransfer(row)
  if (row.status !== "requires_action") {
    throw railError("transfer_failed", "This transfer can no longer be canceled")
  }
  const now = new Date().toISOString()
  const { data: claimed } = await admin
    .from("platform_transfers")
    .update({ status: "canceled", updated_at: now })
    .eq("id", row.id)
    .eq("status", "requires_action")
    .select("*")
    .maybeSingle()
  if (!claimed?.id) {
    const latest = await loadTransfer(admin, row.id)
    if (latest?.status === "canceled") return publicTransfer(latest)
    throw railError("transfer_failed", "This transfer can no longer be canceled")
  }
  await releaseHold(admin, row)
  return publicTransfer(claimed as PlatformTransferRow)
}

export async function confirmPlatformTransfer(
  admin: SupabaseClient,
  input: { transferId: string; clientSecret: string },
) {
  const row = await loadTransfer(admin, input.transferId)
  if (!row) throw railError("not_found", "Not found")
  assertSecret(row, input.clientSecret)
  if (row.status === "completed") return publicTransfer(row)
  if (row.status === "canceled") throw railError("transfer_canceled", "This transfer was canceled")
  if (row.status === "failed") throw railError("transfer_failed", "This transfer failed")
  if (row.status !== "requires_action") {
    throw railError("transfer_failed", "This transfer cannot be confirmed")
  }
  if (transferExpired(row.expires_at)) {
    await expireOpenTransfer(admin, row)
    throw railError("transfer_expired", "This transfer expired")
  }

  const now = new Date().toISOString()
  const { data: claimed } = await admin
    .from("platform_transfers")
    .update({ authorized_at: now, updated_at: now })
    .eq("id", row.id)
    .eq("status", "requires_action")
    .select("*")
    .maybeSingle()
  if (!claimed?.id) {
    const latest = await loadTransfer(admin, row.id)
    if (latest?.status === "completed") return publicTransfer(latest)
    throw railError("transfer_failed", "This transfer cannot be confirmed")
  }

  const amountCents = Number(row.amount_cents)
  const currency = String(row.currency).toUpperCase()
  const source = String(row.source_account_id ?? "")
  const customerId = (row.customer_id as string | null) ?? null
  let settled = false
  try {
    if (row.livemode) {
      const { data: account } = await admin
        .from("platform_accounts")
        .select("id, wallet_owner_id, customer_id")
        .eq("id", source)
        .maybeSingle()
      await executePlatformOutboundRail(admin, {
        businessId: String(row.business_id),
        customerId: customerId ?? (account?.customer_id as string | null) ?? null,
        destinationId: row.destination_id ?? null,
        amountCents,
        currency,
        walletOwnerId: (account?.wallet_owner_id as string | null) ?? null,
      })
    }
    await adjustPlatformAccount(admin, { accountId: source, pendingDelta: -amountCents })
    settled = true
    await insertPlatformTransaction(admin, {
      businessId: String(row.business_id),
      livemode: Boolean(row.livemode),
      type: "transfer",
      amountCents,
      currency,
      direction: "out",
      status: "completed",
      accountId: source,
      customerId,
      transferId: row.id,
      description: "Transfer",
    })
    const completedAt = new Date().toISOString()
    const { data: completed } = await admin
      .from("platform_transfers")
      .update({ status: "completed", updated_at: completedAt })
      .eq("id", row.id)
      .select("*")
      .single()
    const mapped = publicTransfer((completed ?? claimed) as PlatformTransferRow)
    await dispatchMerchantWebhook(admin, {
      businessId: String(row.business_id),
      event: "transfer.completed",
      data: mapped,
    })
    return mapped
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transfer failed"
    if (!settled) {
      await releaseHold(admin, row).catch(() => {})
    }
    await admin
      .from("platform_transfers")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", row.id)
    await dispatchMerchantWebhook(admin, {
      businessId: String(row.business_id),
      event: "transfer.failed",
      data: { ...publicTransfer(row), status: "failed", error: message },
    })
    throw err
  }
}

export function platformTransferHttpError(error: unknown): { status: number; code: string; message: string } {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "transfer_failed"
  const message = error instanceof Error ? error.message : "Could not complete transfer"
  const status =
    code === "not_found"
      ? 404
      : code === "invalid_client_secret"
        ? 401
        : code === "customer_action_required" || code === "verification_required"
          ? 403
          : code === "not_available"
            ? 409
            : 400
  const mapped =
    code === "not_found" ||
    code === "invalid_client_secret" ||
    code === "customer_action_required" ||
    code === "verification_required" ||
    code === "not_available" ||
    code === "transfer_expired" ||
    code === "transfer_canceled" ||
    code === "transfer_failed"
      ? code
      : "transfer_failed"
  return { status, code: mapped, message }
}
