import type { SupabaseClient } from "@supabase/supabase-js"
import { upsertLedgerTransaction } from "@/lib/ledger/transactions"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"
import { suppressTurnkeyGridVaChainMirrorRow } from "@/lib/grid/grid-va-turnkey-mirror"
import { notifyGridBankDepositPayInSettledPush } from "@/lib/notifications/bank-deposit-settled-notify"
import { resolveBusinessOrgOwnerUserId } from "@/lib/business/org-owner"

export function buildBridgeVaDepositCreditKey(depositId: string): string {
  return `bridge_va_inbound:${String(depositId || "").trim()}`
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function nested(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  return asRecord(obj[key])
}

export async function handleBridgeVaInboundActivity(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  const eventType = String(payload.event_type ?? payload.type ?? "").toLowerCase()
  if (!eventType.includes("virtual_account") && !eventType.includes("deposit")) {
    return
  }

  const data = asRecord(payload.event_object ?? payload.data ?? payload)
  const depositId = String(data.deposit_id ?? data.id ?? "").trim()
  if (!depositId) return

  const customerId = String(
    data.customer_id ?? nested(data, "customer").id ?? payload.customer_id ?? "",
  ).trim()
  const status = String(data.type ?? data.status ?? eventType).toLowerCase()
  const amountRaw = nested(data, "receipt")?.final_amount ?? data.amount ?? nested(data, "source").amount
  const amount = Number(amountRaw ?? 0)
  const currencyRaw = String(
    nested(data, "receipt").currency ?? data.currency ?? nested(data, "source").currency ?? "usd",
  )
    .trim()
    .toUpperCase()
  const ledgerCurrency: "USD" | "EUR" = currencyRaw === "EUR" || currencyRaw === "EURC" ? "EUR" : "USD"
  const solanaTxHash = String(
    nested(data, "destination").tx_hash ??
      nested(data, "receipt").destination_tx_hash ??
      data.destination_tx_hash ??
      "",
  ).trim()

  const subject = await resolveBridgeSubject(admin, customerId)
  if (!subject) return

  const processed = status.includes("payment_processed") || status.includes("funds_received") || status.includes("completed")
  const { transactionId } = await upsertLedgerTransaction(admin, {
    userId: subject.userId,
    businessId: subject.businessId,
    provider: "bridge",
    providerTransactionId: depositId,
    status: processed && solanaTxHash ? "settled" : processed ? "pending" : "pending",
    amount,
    currency: ledgerCurrency,
    direction: "in",
    txHash: solanaTxHash || null,
    asset: ledgerCurrency === "EUR" ? "EURC" : "USDC",
    chain: "solana",
    payload,
    metadata: {
      flow: "bank_onramp",
      payout_provider: "bridge",
      bridge_va_inbound: true,
      deposit_id: depositId,
      bridge_customer_id: customerId,
      fiat_deposit_amount: amount,
      fiat_deposit_currency: ledgerCurrency,
      source: "bridge_webhook_incoming",
      ...(solanaTxHash ? { bridge_on_chain_tx_hash: solanaTxHash } : {}),
    },
  })

  if (!processed || !(amount > 0)) return

  if (solanaTxHash) {
    await suppressTurnkeyGridVaChainMirrorRow(admin, {
      txHash: solanaTxHash,
      userId: subject.userId,
      businessId: subject.businessId,
    }).catch(() => ({ suppressed: 0, reversedBalance: 0 }))
  }

  const { data: prior } = await admin
    .from("transactions")
    .select("metadata")
    .eq("id", transactionId)
    .maybeSingle()
  const priorMeta = asRecord(prior?.metadata)
  const creditKey = buildBridgeVaDepositCreditKey(depositId)
  if (priorMeta.wallet_balance_credit_key === creditKey) return

  await applyWalletBalanceDelta(admin, {
    businessId: subject.businessId,
    userId: subject.businessId ? null : subject.userId,
    currency: ledgerCurrency,
    delta: amount,
  })

  await admin
    .from("transactions")
    .update({
      metadata: {
        ...priorMeta,
        wallet_balance_credit_key: creditKey,
        settled_stablecoin_amount: amount,
        wallet_ledger_currency: ledgerCurrency,
        ...(solanaTxHash ? { bridge_on_chain_tx_hash: solanaTxHash } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", transactionId)

  if (solanaTxHash) {
    await notifyGridBankDepositPayInSettledPush(admin, transactionId).catch(() => undefined)
  }
}

export async function resolveBridgeSubject(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ userId: string; businessId: string | null } | null> {
  if (!customerId) return null
  const { data: biz } = await admin
    .from("businesses")
    .select("id")
    .eq("bridge_customer_id", customerId)
    .maybeSingle()
  if (biz?.id) {
    const userId = await resolveBusinessOrgOwnerUserId(admin, String(biz.id)).catch(() => "")
    if (!userId) return null
    return { userId, businessId: String(biz.id) }
  }
  const { data: user } = await admin
    .from("users")
    .select("id")
    .eq("bridge_customer_id", customerId)
    .maybeSingle()
  if (!user?.id) return null
  return { userId: String(user.id), businessId: null }
}
