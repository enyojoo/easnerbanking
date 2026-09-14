import { after } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { isBridgeEurSepaCorridor } from "@easner/shared"
import { bridgeFetch } from "./http"
import type { RecipientSellPrepareRow } from "@/lib/terminal/recipient-sell-prepare"
import { resolveRecipientPayoutCountry } from "@/lib/terminal/recipient-sell-prepare"

export type BridgeExternalAccount = {
  id: string
  currency?: string
  account_owner_name?: string
}

function storedBridgeExternalAccountId(recipient: RecipientSellPrepareRow): string | null {
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {}
  const id = String(obj.bridge_external_account_id ?? "").trim()
  return id || null
}

export function persistRecipientBridgeExternalAccount(
  admin: SupabaseClient,
  recipient: RecipientSellPrepareRow,
  externalAccountId: string,
  recipientId?: string,
): void {
  const id = String(recipientId ?? "").trim()
  if (!id) return
  const meta = recipient.metadata
  const obj = meta && typeof meta === "object" ? { ...(meta as Record<string, unknown>) } : {}
  if (String(obj.bridge_external_account_id ?? "").trim() === externalAccountId) return
  obj.bridge_external_account_id = externalAccountId
  after(async () => {
    const { error } = await admin
      .from("recipients")
      .update({ metadata: obj, updated_at: new Date().toISOString() })
      .eq("id", id)
    if (error) {
      console.warn("[bridge] persist recipient external account failed:", error.message)
    }
  })
}

function checkingOrSavings(recipient: RecipientSellPrepareRow): "checking" | "savings" {
  const raw = String(recipient.checking_or_savings ?? "").trim().toLowerCase()
  return raw === "savings" ? "savings" : "checking"
}

export function bridgePaymentRailForRecipient(recipient: RecipientSellPrepareRow): string {
  const country = resolveRecipientPayoutCountry(recipient)
  const currency = String(recipient.currency ?? "").trim().toUpperCase()
  const transfer = String(recipient.transfer_type ?? "").trim().toLowerCase()
  if (isBridgeEurSepaCorridor(country, currency)) {
    return transfer.includes("instant") ? "sepa_credit" : "sepa"
  }
  if (country === "US" && currency === "USD") {
    if (transfer.includes("wire")) return "wire"
    if (transfer.includes("fednow")) return "fednow"
    return "ach"
  }
  if (country === "GB" && currency === "GBP") return "faster_payments"
  if (country === "MX" && currency === "MXN") return "spei"
  if (country === "BR" && currency === "BRL") return "pix"
  if (country === "CO" && currency === "COP") return "ach_cop"
  return "ach"
}

export async function ensureBridgeExternalAccount(input: {
  admin: SupabaseClient
  customerId: string
  recipient: RecipientSellPrepareRow
  recipientId?: string
  accountOwnerType: "individual" | "business"
  idempotencyKey: string
}): Promise<string> {
  const existing = storedBridgeExternalAccountId(input.recipient)
  if (existing) return existing

  const country = resolveRecipientPayoutCountry(input.recipient)
  const currency = String(input.recipient.currency ?? "").trim().toLowerCase()
  const ownerName = String(input.recipient.full_name ?? "").trim() || "Account holder"
  const accountNumber = String(input.recipient.account_number ?? "").trim()
  const routing = String(input.recipient.routing_number ?? "").trim()
  const iban = String(input.recipient.iban ?? accountNumber).trim()
  const bic = String(input.recipient.swift_bic ?? "").trim()

  let body: Record<string, unknown>
  if (currency === "eur" || isBridgeEurSepaCorridor(country, currency.toUpperCase())) {
    body = {
      currency: "eur",
      account_type: "iban",
      account_owner_name: ownerName,
      account_owner_type: input.accountOwnerType,
      iban: {
        account_number: iban || accountNumber,
        bic: bic || undefined,
        country: country.toLowerCase(),
      },
    }
  } else if (currency === "gbp") {
    body = {
      currency: "gbp",
      account_type: "gb",
      account_owner_name: ownerName,
      account_owner_type: input.accountOwnerType,
      account: {
        account_number: accountNumber,
        sort_code: String(input.recipient.sort_code ?? routing).replace(/\D/g, ""),
      },
    }
  } else if (currency === "mxn") {
    body = {
      currency: "mxn",
      account_type: "clabe",
      account_owner_name: ownerName,
      account_owner_type: input.accountOwnerType,
      clabe: { account_number: accountNumber },
    }
  } else if (currency === "brl") {
    body = {
      currency: "brl",
      account_type: "pix",
      account_owner_name: ownerName,
      account_owner_type: input.accountOwnerType,
      pix_key: String((input.recipient.metadata as Record<string, unknown> | null)?.pix_key ?? accountNumber),
    }
  } else {
    body = {
      currency: "usd",
      account_type: "us",
      account_owner_name: ownerName,
      account_owner_type: input.accountOwnerType,
      account: {
        account_number: accountNumber,
        routing_number: routing,
        checking_or_savings: checkingOrSavings(input.recipient),
      },
    }
  }

  const created = await bridgeFetch<BridgeExternalAccount>({
    method: "POST",
    path: `/customers/${encodeURIComponent(input.customerId)}/external_accounts`,
    json: body,
    idempotencyKey: input.idempotencyKey,
  })
  const id = String(created.id ?? "").trim()
  if (!id) throw new Error("Could not create payout bank account.")
  persistRecipientBridgeExternalAccount(input.admin, input.recipient, id, input.recipientId)
  return id
}
