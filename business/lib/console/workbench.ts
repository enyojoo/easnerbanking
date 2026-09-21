import type { SupabaseClient } from "@supabase/supabase-js"
import { getOrCreatePlatformAccount, listPlatformAccounts, publicAccount, publicTransaction } from "@/lib/platform/ledger"
import {
  createPlatformCustomer,
  createPlatformQuote,
  publicCustomer,
  publicTransfer,
  type PlatformTransferRow,
} from "@/lib/platform/objects"
import { buildPlatformPaymentCatalog, PLATFORM_PAYMENT_METHODS } from "@/lib/platform/payment-methods"
import { EXPLORER_ENDPOINTS } from "@/lib/console/explorer-catalog"

export function interpolateWorkbenchPath(path: string, body: Record<string, unknown>): string {
  return path.replace(/\{(\w+)\}/g, (_, key: string) => String(body[key] ?? `{${key}}`))
}

export async function runWorkbenchEndpoint(
  admin: SupabaseClient,
  input: {
    businessId: string
    livemode: boolean
    method: string
    path: string
    body: Record<string, unknown>
  },
): Promise<{ status: number; json: unknown }> {
  const catalog = EXPLORER_ENDPOINTS.find(
    (item) => item.method === input.method && interpolateWorkbenchPath(item.path, input.body) === input.path,
  )
  const resolved =
    catalog ??
    EXPLORER_ENDPOINTS.find((item) => {
      if (item.method !== input.method) return false
      const pattern = item.path.replace(/\{[^}]+\}/g, "[^/]+")
      return new RegExp(`^${pattern}$`).test(input.path)
    })
  if (!resolved) return { status: 400, json: { error: { code: "unknown_endpoint", message: "Endpoint is not in Workbench" } } }

  const idFromPath = input.path.split("/").filter(Boolean).pop() ?? ""
  const livemode = input.livemode
  const businessId = input.businessId

  try {
    if (resolved.id === "customers.list") {
      const { data } = await admin
        .from("platform_customers")
        .select("id, email, name, external_id, easetag, status, verification_status, livemode, created_at")
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .order("created_at", { ascending: false })
        .limit(100)
      return { status: 200, json: { data: (data ?? []).map((row) => publicCustomer(row)) } }
    }
    if (resolved.id === "customers.retrieve") {
      const { data } = await admin
        .from("platform_customers")
        .select("id, email, name, external_id, easetag, status, verification_status, livemode, created_at")
        .eq("id", idFromPath)
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .maybeSingle()
      if (!data) return { status: 404, json: { error: { code: "not_found", message: "Not found" } } }
      const accounts = await listPlatformAccounts(admin, businessId, livemode, { customerId: idFromPath })
      return { status: 200, json: { ...publicCustomer(data), accounts } }
    }
    if (resolved.id === "customers.create") {
      const customer = await createPlatformCustomer(admin, {
        businessId,
        livemode,
        email: typeof input.body.email === "string" ? input.body.email : undefined,
        name: typeof input.body.name === "string" ? input.body.name : undefined,
        externalId: typeof input.body.external_id === "string" ? input.body.external_id : undefined,
        easetag: typeof input.body.easetag === "string" ? input.body.easetag : undefined,
      })
      return { status: 201, json: customer }
    }
    if (resolved.id === "accounts.list") {
      const customerId = typeof input.body.customer === "string" ? input.body.customer : null
      const accounts = await listPlatformAccounts(admin, businessId, livemode, {
        customerId,
        issuedOnly: !customerId,
      })
      return { status: 200, json: { data: accounts } }
    }
    if (resolved.id === "accounts.retrieve") {
      const { data } = await admin
        .from("platform_accounts")
        .select("id, currency, available_cents, pending_cents, livemode, customer_id")
        .eq("id", idFromPath)
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .maybeSingle()
      if (!data) return { status: 404, json: { error: { code: "not_found", message: "Not found" } } }
      return { status: 200, json: publicAccount(data) }
    }
    if (resolved.id === "accounts.create") {
      const currency = String(input.body.currency ?? "").trim().toUpperCase()
      const customerId = String(input.body.customer ?? "").trim()
      const { data: customer } = await admin
        .from("platform_customers")
        .select("id, email, name")
        .eq("id", customerId)
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .maybeSingle()
      if (!customer?.id) return { status: 404, json: { error: { code: "not_found", message: "Customer not found" } } }
      const account = await getOrCreatePlatformAccount(admin, {
        businessId,
        livemode,
        currency,
        customerId,
        email: customer.email,
        name: customer.name,
      })
      return { status: 201, json: publicAccount(account) }
    }
    if (resolved.id === "transfers.list") {
      const { data } = await admin
        .from("platform_transfers")
        .select(
          "id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at, expires_at",
        )
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .order("created_at", { ascending: false })
        .limit(100)
      return { status: 200, json: { data: (data ?? []).map((row) => publicTransfer(row as PlatformTransferRow)) } }
    }
    if (resolved.id === "transfers.retrieve") {
      const { data } = await admin
        .from("platform_transfers")
        .select(
          "id, quote_id, source_account_id, destination_id, amount_cents, currency, status, livemode, created_at, expires_at",
        )
        .eq("id", idFromPath)
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .maybeSingle()
      if (!data) return { status: 404, json: { error: { code: "not_found", message: "Not found" } } }
      const mapped = publicTransfer(data as PlatformTransferRow)
      const { client_secret: _secret, ...safe } = mapped as typeof mapped & { client_secret?: string }
      return { status: 200, json: safe }
    }
    if (resolved.id === "quotes.create") {
      const quote = await createPlatformQuote(admin, {
        businessId,
        livemode,
        sourceAccountId: String(input.body.source ?? ""),
        destinationId: typeof input.body.destination === "string" ? input.body.destination : null,
        amountCents: Number(input.body.amount ?? 0),
        sendCurrency: String(input.body.currency ?? "USD"),
        receiveCurrency: typeof input.body.receive_currency === "string" ? input.body.receive_currency : undefined,
      })
      return { status: 201, json: quote }
    }
    if (resolved.id === "transactions.list") {
      const { data } = await admin
        .from("platform_transactions")
        .select(
          "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
        )
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .order("created_at", { ascending: false })
        .limit(100)
      return { status: 200, json: { data: (data ?? []).map((row) => publicTransaction(row)) } }
    }
    if (resolved.id === "transactions.retrieve") {
      const { data } = await admin
        .from("platform_transactions")
        .select(
          "id, type, amount_cents, currency, direction, status, account_id, customer_id, transfer_id, checkout_session_id, description, livemode, created_at",
        )
        .eq("id", idFromPath)
        .eq("business_id", businessId)
        .eq("livemode", livemode)
        .maybeSingle()
      if (!data) return { status: 404, json: { error: { code: "not_found", message: "Not found" } } }
      return { status: 200, json: publicTransaction(data) }
    }
    if (resolved.id === "payment_methods.list") {
      let catalog = null
      try {
        catalog = await buildPlatformPaymentCatalog()
      } catch {
        catalog = null
      }
      return { status: 200, json: { data: PLATFORM_PAYMENT_METHODS, catalog } }
    }
  } catch (error) {
    return {
      status: 400,
      json: { error: { code: "request_failed", message: error instanceof Error ? error.message : "Request failed" } },
    }
  }

  return { status: 400, json: { error: { code: "unknown_endpoint", message: "Endpoint is not in Workbench" } } }
}
