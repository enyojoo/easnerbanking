import type { SupabaseClient } from "@supabase/supabase-js"
import { PublicKey } from "@solana/web3.js"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"
import { resolveNoahAccountContextFromLedgerScope } from "@/lib/processing-fee/capture-pending-processing-fee"
import { createTurnkeySend } from "@/lib/turnkey/send"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

export class OfficeReturnError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.name = "OfficeReturnError"
    this.status = status
  }
}

export type OfficeReturnKind = "user" | "business"

export type OfficeReturnRemainingInput = {
  kind: OfficeReturnKind
  subjectId: string
  operatorAdminId: string
  reason: string
  destinationAddress: string
  amount: number
  currency: "USD" | "EUR"
}

export type OfficeReturnRemainingResult = {
  ok: true
  kind: OfficeReturnKind
  subjectId: string
  amount: number
  currency: "USD" | "EUR"
  asset: "USDC" | "EURC"
  destinationAddress: string
  providerTransactionId: string
  txHash: string | null
  sendStatus: "pending" | "settled"
}

function parseSolanaDestination(raw: string): string | null {
  const dest = String(raw || "").trim()
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(dest) || dest.startsWith("T")) return null
  try {
    return new PublicKey(dest).toBase58()
  } catch {
    return null
  }
}

function parsePositiveAmount(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? "").trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 1_000_000) / 1_000_000
}

function currencyToAsset(currency: "USD" | "EUR"): "USDC" | "EURC" {
  return currency === "EUR" ? "EURC" : "USDC"
}

async function loadAvailable(
  admin: SupabaseClient,
  kind: OfficeReturnKind,
  subjectId: string,
  currency: "USD" | "EUR",
): Promise<number> {
  let q = admin.from("wallet_balances").select("available_balance").eq("currency", currency).limit(1)
  q = kind === "business" ? q.eq("business_id", subjectId) : q.eq("user_id", subjectId).is("business_id", null)
  const { data, error } = await q.maybeSingle()
  if (error) throw new OfficeReturnError(error.message, 500)
  const available = Number(data?.available_balance ?? 0)
  return Number.isFinite(available) ? available : 0
}

async function resolveSubject(
  admin: SupabaseClient,
  kind: OfficeReturnKind,
  subjectId: string,
): Promise<{ userId: string; businessId: string | null }> {
  if (kind === "business") {
    const { data: biz } = await admin.from("businesses").select("id").eq("id", subjectId).maybeSingle()
    if (!biz) throw new OfficeReturnError("Business not found", 404)
    const ownerUserId = await resolveBusinessOrgOwnerUserId(admin, subjectId)
    if (!ownerUserId) throw new OfficeReturnError("Business has no owner to attach the ledger", 400)
    return { userId: ownerUserId, businessId: subjectId }
  }

  const { data: user } = await admin
    .from("users")
    .select("id, role, easner_business_id")
    .eq("id", subjectId)
    .maybeSingle()
  if (!user) throw new OfficeReturnError("User not found", 404)
  const orgLinked =
    String(user.role || "").toLowerCase() === "business" || Boolean(user.easner_business_id)
  if (orgLinked) {
    throw new OfficeReturnError(
      "Return from the business profile. This person is linked to a business wallet.",
      400,
    )
  }
  return { userId: subjectId, businessId: null }
}

async function stampOfficeLedger(
  admin: SupabaseClient,
  input: {
    providerTransactionId: string
    operatorAdminId: string
    reason: string
  },
): Promise<void> {
  const { data: ledger } = await admin
    .from("transactions")
    .select("id, metadata")
    .eq("provider", "turnkey")
    .eq("provider_transaction_id", input.providerTransactionId)
    .maybeSingle()
  if (!ledger?.id) return
  const prior =
    ledger.metadata && typeof ledger.metadata === "object"
      ? (ledger.metadata as Record<string, unknown>)
      : {}
  await admin
    .from("transactions")
    .update({
      metadata: {
        ...prior,
        activity_type: "office_return",
        actor: "office",
        office_return: true,
        operator_admin_id: input.operatorAdminId,
        reason: input.reason,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", ledger.id)
}

export async function officeReturnRemaining(
  admin: SupabaseClient,
  input: OfficeReturnRemainingInput,
): Promise<OfficeReturnRemainingResult> {
  const reason = String(input.reason || "").trim()
  if (!reason) throw new OfficeReturnError("Reason is required")

  const destinationAddress = parseSolanaDestination(input.destinationAddress)
  if (!destinationAddress) throw new OfficeReturnError("Enter a Solana address")

  const currency = input.currency === "EUR" || input.currency === "USD" ? input.currency : null
  if (!currency) throw new OfficeReturnError("Currency must be USD or EUR")

  const amount = parsePositiveAmount(input.amount)
  if (amount == null) throw new OfficeReturnError("Amount must be greater than zero")

  const subject = await resolveSubject(admin, input.kind, input.subjectId)
  const available = await loadAvailable(admin, input.kind, input.subjectId, currency)
  if (amount > available + 1e-9) {
    throw new OfficeReturnError(`Amount exceeds remaining ${currency} (${available})`)
  }

  const ctx = await resolveNoahAccountContextFromLedgerScope(admin, {
    userId: subject.userId,
    businessId: subject.businessId,
  })
  if (!ctx) throw new OfficeReturnError("Could not resolve the vault", 400)

  const asset = currencyToAsset(currency)
  let send: Awaited<ReturnType<typeof createTurnkeySend>>
  try {
    send = await createTurnkeySend(admin, {
      ctx,
      asset,
      chain: "solana",
      destinationAddress,
      amount,
      settlementPollTimeoutMs: 120_000,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Vault send failed"
    if (message === "No managed wallet found for requested asset") {
      throw new OfficeReturnError("Vault is not ready for this currency", 400)
    }
    throw new OfficeReturnError(message, 502)
  }

  if (send.status === "failed") {
    throw new OfficeReturnError(
      send.chainFailureDetail?.trim() || "Vault send failed. Remaining funds were not moved.",
      502,
    )
  }

  await applyWalletBalanceDelta(admin, {
    businessId: subject.businessId,
    userId: subject.businessId ? null : subject.userId,
    currency,
    delta: -amount,
  })
  await stampOfficeLedger(admin, {
    providerTransactionId: send.providerTransactionId,
    operatorAdminId: input.operatorAdminId,
    reason,
  })

  return {
    ok: true,
    kind: input.kind,
    subjectId: input.subjectId,
    amount,
    currency,
    asset,
    destinationAddress,
    providerTransactionId: send.providerTransactionId,
    txHash: send.txHash,
    sendStatus: send.status === "settled" ? "settled" : "pending",
  }
}
