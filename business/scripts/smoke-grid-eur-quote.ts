/**
 * Sandbox smoke: USDC REALTIME_FUNDING → DE EUR_ACCOUNT with SEPA_INSTANT.
 * Usage: cd business && node --env-file=.env.local --import tsx scripts/smoke-grid-eur-quote.ts
 */
import { createClient } from "@supabase/supabase-js"
import { gridFetch, GridHttpError } from "../lib/grid/http"
import { buildGridExternalAccountPayload } from "../lib/grid/external-account"
import { buildGridBalancePayoutQuoteBody } from "../lib/grid/quote-request"
import { buildGridIdempotencyKey } from "../lib/grid/idempotency"
import { extractGridFundingSolanaAddress } from "../lib/grid/external-account"

async function resolveSandboxCustomerId(): Promise<string> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (supabaseUrl && serviceRoleKey) {
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await admin
      .from("users")
      .select("grid_customer_id")
      .not("grid_customer_id", "is", null)
      .limit(1)
      .maybeSingle()
    const stored = String(data?.grid_customer_id ?? "").trim()
    if (stored) return stored
  }

  const listed = await gridFetch<{ data?: Array<{ id?: string }> }>({
    method: "GET",
    path: "/customers?limit=1",
  })
  const fromList = String(listed.data?.[0]?.id ?? "").trim()
  if (fromList) return fromList
  throw new Error("No Grid sandbox customer available for EUR smoke test")
}

async function main() {
  const customerId = await resolveSandboxCustomerId()
  console.log("customer", customerId)

  const recipient = {
    full_name: "EUR Smoke Test",
    currency: "EUR",
    country_code: "DE",
    iban: "DE89370400440532013000",
    swift_bic: "COBADEFFXXX",
    transfer_type: "SEPA Instant",
  }
  const extPayload = buildGridExternalAccountPayload({
    customerId,
    recipient,
    rail: "bank_transfer",
  })
  const external = await gridFetch<{ id: string }>({
    method: "POST",
    path: "/customers/external-accounts",
    json: extPayload,
    idempotencyKey: buildGridIdempotencyKey("eur_smoke_ext", extPayload),
  })
  console.log("external", external.id, extPayload.accountInfo.accountType)

  const quoteBody = buildGridBalancePayoutQuoteBody({
    customerId,
    externalAccountId: external.id,
    receiveCurrency: "EUR",
    lockedReceiveMinor: 1000,
    paymentRail: "SEPA_INSTANT",
  })
  const quote = await gridFetch<Record<string, unknown>>({
    method: "POST",
    path: "/quotes",
    json: quoteBody,
    idempotencyKey: buildGridIdempotencyKey("eur_smoke_quote", quoteBody),
  })
  const funding = extractGridFundingSolanaAddress(quote)
  console.log("quote", quote.id)
  console.log("paymentRail", (quoteBody.destination as { paymentRail?: string }).paymentRail)
  console.log("fundingAddress", funding ? "present" : "missing")
  console.log("SMOKE_OK")
}

main().catch((err) => {
  if (err instanceof GridHttpError) {
    console.error("GridHttpError", err.status, err.message, JSON.stringify(err.body))
  } else {
    console.error(err)
  }
  process.exit(1)
})
