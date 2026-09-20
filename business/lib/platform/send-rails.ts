import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveEasetagPayee } from "@/lib/easetag-payee"
import { normalizeEasetag } from "@/lib/easetag-validation"
import { executePlatformFiatPayout } from "@/lib/platform/fiat-payout"
import { creditPlatformAccountFromInbound } from "@/lib/platform/ledger"
import { sendStablecoinFromWalletOwner } from "@/lib/platform/vault-send"
import { applyWalletBalanceDelta } from "@/lib/wallet/wallet-balances-db"

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {}
}

function railError(code: string, message: string) {
  return Object.assign(new Error(message), { code })
}

export function isDirectVaultWalletSend(input: {
  currency: string
  network: string
  asset: string
}): boolean {
  const network = input.network.trim().toLowerCase()
  const asset = input.asset.trim().toUpperCase()
  const currency = input.currency.trim().toUpperCase()
  if (network !== "solana") return false
  if (currency === "USD" && asset === "USDC") return true
  if (currency === "EUR" && asset === "EURC") return true
  return false
}

export async function executePlatformOutboundRail(
  admin: SupabaseClient,
  input: {
    businessId: string
    customerId?: string | null
    destinationId: string | null
    amountCents: number
    currency: string
    walletOwnerId: string | null
  },
): Promise<void> {
  if (!input.destinationId) throw railError("invalid_destination", "destination is required")
  const { data: destination } = await admin
    .from("platform_destinations")
    .select("id, type, details")
    .eq("id", input.destinationId)
    .eq("business_id", input.businessId)
    .maybeSingle()
  if (!destination?.id) throw railError("not_found", "Destination not found")
  const type = String(destination.type ?? "")
  const details = asMeta(destination.details)
  const currency = input.currency.trim().toUpperCase()
  const amount = input.amountCents / 100

  if (type === "wallet") {
    const network = String(details.network ?? details.wallet_network ?? "").trim()
    const asset = String(details.currency ?? details.asset ?? (currency === "EUR" ? "EURC" : "USDC")).trim()
    const address = String(details.address ?? details.account ?? details.account_number ?? "").trim()
    if (!address) throw railError("invalid_destination", "wallet address is required")
    if (!isDirectVaultWalletSend({ currency, network, asset })) {
      throw railError("not_available", "Live wallet send from this vault is Solana USDC or EURC")
    }
    if (!input.walletOwnerId) throw railError("not_available", "Customer vault is not ready")
    await sendStablecoinFromWalletOwner(admin, {
      walletOwnerId: input.walletOwnerId,
      asset: asset.toUpperCase() === "EURC" ? "EURC" : "USDC",
      destinationAddress: address,
      amount,
    })
    return
  }

  if (type === "easetag") {
    const tag = normalizeEasetag(String(details.easetag ?? details.tag ?? ""))
    if (!tag) throw railError("invalid_destination", "easetag is required")
    await creditEasetagPayee(admin, {
      easetag: tag,
      amount,
      currency: currency === "EUR" ? "EUR" : "USD",
    })
    return
  }

  if (type === "bank" || type === "mobile_money") {
    await executePlatformFiatPayout(admin, {
      businessId: input.businessId,
      customerId: input.customerId ?? null,
      destinationId: destination.id,
      destinationType: type,
      details,
      amountCents: input.amountCents,
      currency,
      walletOwnerId: input.walletOwnerId,
    })
    return
  }

  throw railError("invalid_type", "Unknown destination type")
}

async function creditEasetagPayee(
  admin: SupabaseClient,
  input: { easetag: string; amount: number; currency: "USD" | "EUR" },
): Promise<void> {
  const payee = await resolveEasetagPayee(admin, input.easetag, input.currency)
  if (!payee) throw railError("not_found", "Easetag not found")
  if (payee.kind === "platform_customer") {
    await creditPlatformAccountFromInbound(admin, {
      accountId: payee.accountId,
      amountCents: Math.round(input.amount * 100),
      type: "easetag",
      description: "Easetag",
    })
    return
  }
  if (payee.kind === "user") {
    await applyWalletBalanceDelta(admin, {
      userId: payee.userId,
      businessId: null,
      currency: input.currency,
      delta: input.amount,
    })
    return
  }
  await applyWalletBalanceDelta(admin, {
    userId: null,
    businessId: payee.businessId,
    currency: input.currency,
    delta: input.amount,
  })
}
