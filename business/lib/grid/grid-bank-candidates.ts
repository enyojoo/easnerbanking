import type { SupabaseClient } from "@supabase/supabase-js"
import { extractCorridorRecipientCandidates, type GridMomoProviderOption } from "@easner/shared"

export type GridRecipientBankCandidates = {
  bankNames: string[]
  momoProviders: GridMomoProviderOption[]
}

/** Load Grid bank/provider candidates for a corridor (DB union first, discoveries fallback). */
export async function loadGridRecipientBankCandidates(
  admin: SupabaseClient,
  input: {
    countryCode: string
    currencyCode: string
    rail: "bank_transfer" | "mobile_money"
  },
): Promise<GridRecipientBankCandidates> {
  const countryCode = input.countryCode.trim().toUpperCase()
  const currencyCode = input.currencyCode.trim().toUpperCase()
  const rail = input.rail

  const { data: corridor } = await admin
    .from("payout_corridors")
    .select("fields_schema,providers")
    .eq("country_code", countryCode)
    .eq("currency_code", currencyCode)
    .eq("rail", rail)
    .maybeSingle()

  const union = extractCorridorRecipientCandidates({
    countryCode,
    currencyCode,
    rail,
    fieldsSchema: corridor?.fields_schema,
    providers: corridor?.providers,
  })

  if (union.bankNames.length || union.momoCandidates.length) {
    return {
      bankNames: union.bankNames,
      momoProviders: union.momoCandidates,
    }
  }

  const discoveries = await listGridDiscoveries()
  const built = buildGridSchemaFromDiscoveries({
    discoveries,
    countryCode,
    currencyCode,
    rail,
  })

  return {
    bankNames: built?.bank_enum ?? [],
    momoProviders: built?.momo_provider_enum ?? [],
  }
}
