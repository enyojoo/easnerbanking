import type { SupabaseClient } from "@supabase/supabase-js"
import { isStripeConnectPayoutInbound } from "@/lib/stripe/connect-payout-inbound"
import {
  creditConnectVaInboundSettlements,
  packPendingConnectSettlements,
} from "@/lib/stripe/connect-va-inbound-settlement"

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function nested(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(obj[key])
}

function depositCreditKey(depositId: string): string {
  return `bridge_va_inbound:${String(depositId || "").trim()}`
}

export function extractBridgeInboundAmountCents(data: Record<string, unknown>): number | null {
  const raw = nested(data, "receipt").final_amount ?? data.amount ?? nested(data, "source").amount
  const amount = Number(raw ?? 0)
  if (!Number.isFinite(amount) || !(amount > 0)) return null
  if (Number.isInteger(amount) && Math.abs(amount) >= 100) return Math.round(amount)
  return Math.round(amount * 100)
}

async function stripeAlreadySettledFromBridge(
  admin: SupabaseClient,
  businessId: string,
  depositId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("transactions")
    .select("id")
    .eq("provider", "stripe")
    .eq("business_id", businessId)
    .filter("metadata->>bridge_deposit_id", "eq", depositId)
    .limit(1)
    .maybeSingle()
  return Boolean(data?.id)
}

async function inboundAlreadyCreditedWallet(
  admin: SupabaseClient,
  depositId: string,
): Promise<boolean> {
  const creditKey = depositCreditKey(depositId)
  const { data: row } = await admin
    .from("transactions")
    .select("id,metadata")
    .eq("provider", "bridge")
    .eq("provider_transaction_id", depositId)
    .maybeSingle()
  if (!row?.id) return false
  const meta =
    row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : {}
  return meta.wallet_balance_credit_key === creditKey
}

async function deleteDuplicateVaInbound(admin: SupabaseClient, depositId: string): Promise<void> {
  const { data: row } = await admin
    .from("transactions")
    .select("id")
    .eq("provider", "bridge")
    .eq("provider_transaction_id", depositId)
    .maybeSingle()
  if (!row?.id) return
  await admin.from("transactions").delete().eq("id", row.id)
}

/**
 * Hop 3: Stripe Connect ACH into a Bridge VA credits pending invoice/checkout
 * settlements. Generic bank on-ramp must not run for these deposits.
 */
export async function handleBridgeStripeSettlementWebhook(
  admin: SupabaseClient,
  input: {
    payload: Record<string, unknown>
    businessId: string
    userId: string
    customerId: string
    depositId: string
  },
): Promise<{ handled: boolean }> {
  if (!isStripeConnectPayoutInbound(input.payload)) return { handled: false }

  const data = asRecord(input.payload.event_object ?? input.payload.data ?? input.payload)
  const amountCents = extractBridgeInboundAmountCents(data)
  if (amountCents == null || !(amountCents > 0)) return { handled: false }

  if (await stripeAlreadySettledFromBridge(admin, input.businessId, input.depositId)) {
    await deleteDuplicateVaInbound(admin, input.depositId)
    return { handled: true }
  }

  const packed = await packPendingConnectSettlements(admin, input.businessId, amountCents)
  if (!packed.length) return { handled: false }

  const alreadyCredited = await inboundAlreadyCreditedWallet(admin, input.depositId)
  await deleteDuplicateVaInbound(admin, input.depositId)

  await creditConnectVaInboundSettlements(admin, {
    packed,
    businessId: input.businessId,
    amountCents,
    inboundId: input.depositId,
    rail: "bridge_va",
    existingTransferId: null,
    skipWalletCredit: alreadyCredited,
    customerId: input.customerId,
    userId: input.userId,
  })

  return { handled: true }
}
