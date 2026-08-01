/**
 * Backfill metadata.provider_bindings on saved recipients from payout corridor schemas.
 *
 * Dry run:
 *   node --env-file=.env.local --import tsx scripts/backfill-recipient-provider-bindings.ts
 * Apply:
 *   node --env-file=.env.local --import tsx scripts/backfill-recipient-provider-bindings.ts --execute
 */
import { createClient } from "@supabase/supabase-js"
import {
  mergeProviderBindingsIntoMetadata,
  resolveRecipientProviderBindings,
  readAllProviderBindings,
} from "@easner/shared"

type RecipientRow = {
  id: string
  country_code: string | null
  currency: string
  bank_name: string
  mobile_provider: string | null
  wallet_network: string | null
  metadata: Record<string, unknown> | null
}

async function main() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!url || !key) throw new Error("Supabase admin environment is required.")
  const execute = process.argv.includes("--execute")
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const { data: corridors, error: corridorError } = await admin
    .from("payout_corridors")
    .select("country_code,currency_code,rail,fields_schema,providers")
  if (corridorError) throw new Error(corridorError.message)

  const corridorByKey = new Map(
    (corridors ?? []).map((row) => [
      `${String(row.country_code).toUpperCase()}:${String(row.currency_code).toUpperCase()}:${row.rail}`,
      row,
    ]),
  )

  const { data: recipients, error } = await admin
    .from("recipients")
    .select("id,country_code,currency,bank_name,mobile_provider,wallet_network,metadata")
  if (error) throw new Error(error.message)

  let updated = 0
  let skipped = 0
  let unresolved = 0

  for (const row of (recipients ?? []) as RecipientRow[]) {
    const bankLabel = String(row.bank_name || "").toLowerCase()
    if (row.wallet_network || bankLabel.includes("easetag") || bankLabel.includes("easenet")) {
      skipped++
      continue
    }

    const cc = String(row.country_code || "").trim().toUpperCase()
    const cur = String(row.currency || "").trim().toUpperCase()
    if (!cc || !cur) {
      skipped++
      continue
    }

    const isMobile = Boolean(row.mobile_provider) || bankLabel.includes("mobile money")
    const rail = isMobile ? "mobile_money" : "bank_transfer"
    const corridor = corridorByKey.get(`${cc}:${cur}:${rail}`)
    if (!corridor) {
      unresolved++
      continue
    }

    const bindings = resolveRecipientProviderBindings({
      countryCode: cc,
      currencyCode: cur,
      rail,
      bankName: row.bank_name,
      mobileProvider: row.mobile_provider,
      fieldsSchema: corridor.fields_schema,
      providers: corridor.providers,
    })

    if (!Object.keys(bindings).length) {
      unresolved++
      continue
    }

    const prior = readAllProviderBindings(row.metadata)
    const nextMetadata = mergeProviderBindingsIntoMetadata(row.metadata, bindings)
    const changed =
      JSON.stringify(readAllProviderBindings(nextMetadata)) !== JSON.stringify(prior)

    if (!changed) {
      skipped++
      continue
    }

    if (execute) {
      const { error: patchError } = await admin
        .from("recipients")
        .update({ metadata: nextMetadata })
        .eq("id", row.id)
      if (patchError) {
        console.error(`Failed ${row.id}: ${patchError.message}`)
        continue
      }
    }
    updated++
  }

  console.log(
    JSON.stringify(
      {
        execute,
        total: recipients?.length ?? 0,
        updated,
        skipped,
        unresolved,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
